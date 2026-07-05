import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import type { StringValue } from 'ms';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

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

type TokenDuration = StringValue;

@Injectable()
export class AuthService {
  private readonly dummyPasswordHashPromise = argon2.hash(
    'project-phoenix-dummy-password',
    { type: argon2.argon2id },
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
        },
      });

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

    const accessToken = await this.jwtService.signAsync(
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
    const refreshToken = randomBytes(64).toString('base64url');
    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() +
        this.durationToMilliseconds(
          this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
        ),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceName: loginDto.device?.deviceName,
        deviceType: loginDto.device?.deviceType,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

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

  private async verifyAgainstDummyHash(password: string): Promise<void> {
    await argon2.verify(await this.dummyPasswordHashPromise, password);
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
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
