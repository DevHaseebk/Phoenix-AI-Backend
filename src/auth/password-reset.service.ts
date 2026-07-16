import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { otpEmail } from '../mail/templates/otp.template';
import { passwordChangedEmail } from '../mail/templates/password-changed.template';
import { generateOtp, hashOtp, verifyOtp } from './otp.util';
import { revokeAllRefreshTokens } from './session-revocation.util';

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const MAX_ATTEMPTS = 5;
const GENERIC_INVALID_CODE_MESSAGE = 'Invalid or expired code';

/**
 * Password reset via a 6-digit OTP. Two deliberate design points, both
 * disclosed in the handover doc:
 *
 * 1. forgotPassword() NEVER surfaces the rate limit as an error - it always
 *    resolves the same way regardless of whether the account exists, has a
 *    password, or is over the 3/15-min cap (the cap is enforced by silently
 *    skipping the OTP creation/send, not by throwing). A visible 429 only
 *    on real, capped accounts would itself be an email-enumeration oracle.
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

  async forgotPassword(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, email: true, passwordHash: true },
    });

    if (!user || !user.passwordHash || !user.email) {
      return;
    }

    const recentCount = await this.prisma.passwordResetOtp.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });

    if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    await this.mailService.sendMail({
      to: user.email,
      ...otpEmail({ name: user.fullName, otp }),
    });
  }

  async resetPassword(
    rawEmail: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, email: true },
    });

    if (!user || !user.email) {
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

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    await revokeAllRefreshTokens(this.prisma, user.id);

    this.mailService.sendMailFireAndForget({
      to: user.email,
      ...passwordChangedEmail({ name: user.fullName }),
    });
  }
}
