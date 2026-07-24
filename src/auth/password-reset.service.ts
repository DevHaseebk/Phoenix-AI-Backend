import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { otpEmail } from '../mail/templates/otp.template';
import { passwordChangedEmail } from '../mail/templates/password-changed.template';
import {
  evaluatePasswordResetCooldown,
  getRequiredCooldownMs,
} from './password-reset-cooldown.util';
import { generateOtp, hashOtp, verifyOtp } from './otp.util';
import { generateResetToken, hashResetToken } from './reset-token.util';
import { revokeAllRefreshTokens } from './session-revocation.util';

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const GENERIC_INVALID_CODE_MESSAGE = 'Invalid or expired code';
const GENERIC_INVALID_TOKEN_MESSAGE = 'Invalid or expired reset token';

export interface ForgotPasswordResult {
  /** Whether an OTP was actually emailed this call. */
  sent: boolean;
  /**
   * If sent: seconds until the next resend would require waiting.
   * If not sent (cooldown active): seconds remaining on that cooldown.
   */
  retryAfterSeconds: number;
}

/**
 * Password reset via a 6-digit OTP, split into three steps: request a code
 * (forgotPassword), verify it for a short-lived single-use reset token
 * (verifyResetOtp), then spend that token on the actual password change
 * (resetPassword). Splitting verification from reset means the OTP is only
 * ever entered once - see docs/16_Claude_Code_Handover.md.
 *
 * Two deliberate design points carried over from the original single-step
 * flow, both disclosed in the handover doc:
 *
 * 1. forgotPassword() never reveals whether an account exists - an unknown
 *    or password-less email always resolves as if a fresh first-ever OTP
 *    request had just been sent (sent: true, a generic 60s next-resend
 *    hint), so response timing/shape can't be used to enumerate accounts.
 *    A *known* account's own cooldown, once the frontend already knows the
 *    email is theirs (mid-flow), is a different case - see forgotPassword()
 *    below and the cooldown util's own docs.
 * 2. The actual mail send in forgotPassword() is awaited (not fire-and-
 *    forget) for an existing account - a genuine SMTP failure must surface
 *    to the caller so they know the code didn't go out, per the task's own
 *    "must not silently fail" instruction. This is a narrow, accepted
 *    enumeration trade-off during a real SMTP outage.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async forgotPassword(rawEmail: string): Promise<ForgotPasswordResult> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        passwordHash: true,
        passwordResetRequestCount: true,
        passwordResetLastRequestedAt: true,
      },
    });

    if (!user || !user.passwordHash || !user.email) {
      return {
        sent: true,
        retryAfterSeconds: Math.ceil(getRequiredCooldownMs(2) / 1000),
      };
    }

    const now = Date.now();
    const decision = evaluatePasswordResetCooldown(
      {
        requestCount: user.passwordResetRequestCount,
        lastRequestedAt: user.passwordResetLastRequestedAt,
      },
      now,
    );

    if (!decision.allowed) {
      return { sent: false, retryAfterSeconds: decision.retryAfterSeconds };
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await this.prisma.$transaction([
      this.prisma.passwordResetOtp.create({
        data: {
          userId: user.id,
          otpHash,
          expiresAt: new Date(now + OTP_EXPIRY_MS),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetRequestCount: decision.effectiveRequestCount + 1,
          passwordResetLastRequestedAt: new Date(now),
        },
      }),
    ]);

    await this.mailService.sendMail({
      to: user.email,
      ...otpEmail({ name: user.fullName, otp }),
    });

    return { sent: true, retryAfterSeconds: decision.retryAfterSeconds };
  }

  async verifyResetOtp(
    rawEmail: string,
    otp: string,
  ): Promise<{ resetToken: string }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    const record = await this.prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !record ||
      record.expiresAt.getTime() <= Date.now() ||
      record.attemptCount >= MAX_ATTEMPTS
    ) {
      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    const matches = await verifyOtp(record.otpHash, otp);

    if (!matches) {
      const nextAttemptCount = record.attemptCount + 1;

      await this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: {
          attemptCount: nextAttemptCount,
          ...(nextAttemptCount >= MAX_ATTEMPTS ? { used: true } : {}),
        },
      });

      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    const resetToken = generateResetToken();
    const resetTokenHash = hashResetToken(resetToken);

    await this.prisma.$transaction([
      this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: {
          verified: true,
          resetTokenHash,
          resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
        },
      }),
      // A completed verification means the next time this user needs a
      // reset, it's a fresh sequence - see password-reset-cooldown.util.ts.
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetRequestCount: 0,
          passwordResetLastRequestedAt: null,
        },
      }),
    ]);

    return { resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    const resetTokenHash = hashResetToken(resetToken);
    const record = await this.prisma.passwordResetOtp.findUnique({
      where: { resetTokenHash },
      select: {
        id: true,
        verified: true,
        used: true,
        resetTokenExpiresAt: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (
      !record ||
      !record.verified ||
      record.used ||
      !record.resetTokenExpiresAt ||
      record.resetTokenExpiresAt.getTime() <= Date.now() ||
      !record.user.email
    ) {
      throw new BadRequestException(GENERIC_INVALID_TOKEN_MESSAGE);
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    await revokeAllRefreshTokens(this.prisma, record.user.id);

    this.mailService.sendMailFireAndForget({
      to: record.user.email,
      ...passwordChangedEmail({ name: record.user.fullName }),
    });
  }
}
