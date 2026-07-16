import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { StringValue } from 'ms';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionAccessService } from '../billing/subscription-access.service';
import { MailService } from '../mail/mail.service';
import { newLoginEmail } from '../mail/templates/new-login.template';
import { welcomeEmail } from '../mail/templates/welcome.template';
import { EmailVerificationService } from './email-verification.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDeviceDto, LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { hashRefreshToken } from './refresh-token-hash.util';

/** New-login alerts are skipped for this exact (userId, deviceName, deviceType)
 * combo if it logged in within this window - avoids alert fatigue on normal
 * repeat logins from the same known browser/app, while still catching a
 * genuinely new device. */
const RECENT_SAME_DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SignupUserResponse {
  id: string;
  fullName: string | null;
  email: string | null;
  status: string;
}

export interface LoginRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResponse {
  user: SignupUserResponse;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface RefreshAccessTokenResponse {
  accessToken: string;
  expiresIn: number;
}

type TokenDuration = StringValue;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyPasswordHashPromise = argon2.hash(
    'project-phoenix-dummy-password',
    { type: argon2.argon2id },
  );
  // Not constructor-injected (a default/undecorated param would still need a
  // DI provider) - a plain field keeps `new AuthService(prisma, jwt, config)`
  // working unchanged in existing tests. Tests for the Google flow mock the
  // OAuth2Client.prototype.verifyIdToken method instead.
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async signup(signupDto: SignupDto): Promise<{ user: SignupUserResponse }> {
    const email = signupDto.email.trim().toLowerCase();
    const fullName = signupDto.fullName.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Account already exists');
    }

    const passwordHash = await argon2.hash(signupDto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          // 7-day trial, no card required (D-122/123/124 MVP scope) -
          // billing/subscription-access.service.ts's static helper is the
          // single source of the trial-length/status defaults, reused
          // identically by loginWithGoogle()'s new-user branch below.
          subscription: {
            create: SubscriptionAccessService.trialSubscriptionCreateData(),
          },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
        },
      });

      this.mailService.sendMailFireAndForget({
        to: email,
        ...welcomeEmail({ name: user.fullName }),
      });

      if (user.email) {
        // Never lets a verification-email failure fail signup itself -
        // verification is tracked-only and explicitly non-blocking.
        this.emailVerificationService
          .sendVerificationEmail({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
          })
          .catch((error: unknown) => {
            this.logger.error(
              `Failed to send verification email to ${user.email}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
      }

      return { user };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Account already exists');
      }

      throw error;
    }
  }

  async login(
    loginDto: LoginDto,
    metadata: LoginRequestMetadata = {},
  ): Promise<LoginResponse> {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        passwordHash: true,
        status: true,
        role: true,
        deletedAt: true,
      },
    });

    if (!user) {
      await this.verifyAgainstDummyHash(loginDto.password);
      throw this.invalidCredentials();
    }

    if (
      !user.passwordHash ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt !== null
    ) {
      throw this.invalidCredentials();
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );

    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    await this.promoteToBootstrapAdminIfMatched(user);

    return this.issueSession(user, metadata, loginDto.device);
  }

  /**
   * Google Sign-In via ID-token verification (D-037) - not a server-redirect
   * OAuth dance. The frontend uses Google Identity Services to obtain an ID
   * token client-side and posts it here; google-auth-library verifies its
   * signature/audience/expiry against Google's own keys (never hand-rolled).
   * googleId-first lookup handles a returning Google user even if they've
   * since changed their Google account's display name; falling back to an
   * email match links Google sign-in onto an existing password account
   * (password login keeps working - passwordHash is untouched). A brand-new
   * email creates a user exactly like signup() does, except passwordHash
   * stays null (already-nullable column) and emailVerifiedAt is set since
   * Google has already verified it - no separate email-verification flow
   * needed for these accounts.
   */
  async loginWithGoogle(
    googleAuthDto: GoogleAuthDto,
    metadata: LoginRequestMetadata = {},
  ): Promise<LoginResponse> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    const payload = await this.verifyGoogleIdToken(
      googleAuthDto.idToken,
      clientId,
    );

    if (!payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const email = payload.email.trim().toLowerCase();
    const googleId = payload.sub;

    const userSelect = {
      id: true,
      fullName: true,
      email: true,
      status: true,
      role: true,
      deletedAt: true,
    } as const;

    let user = await this.prisma.user.findUnique({
      where: { googleId },
      select: userSelect,
    });
    let isNewUser = false;

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
        select: userSelect,
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId },
          select: userSelect,
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email,
            fullName: payload.name?.trim() || null,
            googleId,
            emailVerifiedAt: new Date(),
            subscription: {
              create: SubscriptionAccessService.trialSubscriptionCreateData(),
            },
          },
          select: userSelect,
        });
        isNewUser = true;
      }
    }

    if (isNewUser && user.email) {
      this.mailService.sendMailFireAndForget({
        to: user.email,
        ...welcomeEmail({ name: user.fullName }),
      });
    }

    if (user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw this.invalidCredentials();
    }

    await this.promoteToBootstrapAdminIfMatched(user);

    return this.issueSession(user, metadata, googleAuthDto.device);
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshAccessTokenResponse> {
    const storedRefreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !storedRefreshToken ||
      storedRefreshToken.revokedAt !== null ||
      storedRefreshToken.expiresAt.getTime() <= Date.now() ||
      !storedRefreshToken.user.email ||
      storedRefreshToken.user.status !== UserStatus.ACTIVE ||
      storedRefreshToken.user.deletedAt !== null
    ) {
      throw this.invalidRefreshToken();
    }

    const accessTokenExpiresIn = this.config.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );

    await this.prisma.refreshToken.update({
      where: { id: storedRefreshToken.id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });

    return {
      accessToken: await this.signAccessToken({
        id: storedRefreshToken.user.id,
        email: storedRefreshToken.user.email,
        status: storedRefreshToken.user.status,
      }),
      expiresIn: this.durationToMilliseconds(accessTokenExpiresIn) / 1000,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const storedRefreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    if (!storedRefreshToken || storedRefreshToken.revokedAt !== null) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: storedRefreshToken.id },
      data: { revokedAt: new Date() },
    });
  }

  /** Shared by login() and loginWithGoogle() - issues tokens, records the device/session, and stamps lastActiveAt. */
  private async issueSession(
    user: {
      id: string;
      fullName: string | null;
      email: string | null;
      status: UserStatus;
    },
    metadata: LoginRequestMetadata,
    device?: LoginDeviceDto,
  ): Promise<LoginResponse> {
    const accessToken = await this.signAccessToken({
      id: user.id,
      email: user.email,
      status: user.status,
    });
    const refreshToken = randomBytes(64).toString('base64url');
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() +
        this.durationToMilliseconds(
          this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
        ),
    );

    // Checked before creating this session's own row, else it would always
    // match itself. Skips the new-login alert only when this exact device
    // combo was already seen recently - a genuinely new device still alerts.
    const recentSameDevice = await this.prisma.refreshToken.findFirst({
      where: {
        userId: user.id,
        deviceName: device?.deviceName ?? null,
        deviceType: device?.deviceType ?? null,
        revokedAt: null,
        createdAt: {
          gt: new Date(Date.now() - RECENT_SAME_DEVICE_WINDOW_MS),
        },
      },
      select: { id: true },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceName: device?.deviceName,
        deviceType: device?.deviceType,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
      select: { id: true },
    });

    if (!recentSameDevice && user.email) {
      this.mailService.sendMailFireAndForget({
        to: user.email,
        ...newLoginEmail({
          name: user.fullName,
          deviceName: device?.deviceName ?? null,
          deviceType: device?.deviceType ?? null,
          approximateTime: new Date().toUTCString(),
          ipAddress: metadata.ipAddress ?? null,
        }),
      });
    }

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Admin Panel Foundation bootstrap (Claude Code Prompt #4). Promotes the
   * ADMIN_BOOTSTRAP_EMAIL account to role: ADMIN the first time it logs in
   * (email/password or Google), so the founder never has to hand-edit the
   * DB to create the first admin. No-ops when the env var is unset, the
   * logging-in email doesn't match, or the user is already ADMIN. Mutates
   * the passed-in `user.role` in place so the caller's subsequent
   * issueSession() call reflects the promotion immediately.
   */
  private async promoteToBootstrapAdminIfMatched(user: {
    id: string;
    email: string | null;
    role: UserRole;
  }): Promise<void> {
    const bootstrapEmail = this.config
      .get<string>('ADMIN_BOOTSTRAP_EMAIL')
      ?.trim()
      .toLowerCase();

    if (
      !bootstrapEmail ||
      !user.email ||
      user.email.toLowerCase() !== bootstrapEmail ||
      user.role === UserRole.ADMIN
    ) {
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN },
      select: { id: true },
    });
    user.role = UserRole.ADMIN;
  }

  private async verifyGoogleIdToken(
    idToken: string,
    clientId: string,
  ): Promise<TokenPayload> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new Error('Google ID token had no payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }
  }

  private async verifyAgainstDummyHash(password: string): Promise<void> {
    await argon2.verify(await this.dummyPasswordHashPromise, password);
  }

  private async signAccessToken(user: {
    id: string;
    email: string | null;
    status: UserStatus;
  }): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        status: user.status,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow<TokenDuration>(
          'JWT_ACCESS_EXPIRES_IN',
        ),
      },
    );
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException('Unauthorized');
  }

  private durationToMilliseconds(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
  }
}
