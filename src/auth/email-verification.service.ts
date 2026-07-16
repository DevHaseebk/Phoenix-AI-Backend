import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { verifyEmailEmail } from '../mail/templates/verify-email.template';
import { generateOtp, hashOtp, verifyOtp } from './otp.util';

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const GENERIC_INVALID_CODE_MESSAGE = 'Invalid or expired code';

/**
 * Email verification via a 6-digit OTP, same shape/validation as
 * PasswordResetService. Deliberately never gates app usage - verification
 * is tracked-only (User.emailVerifiedAt), consumed via a computed
 * `emailVerified` field on GET /me, per the task's own default.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /** Fire-and-forget from signup() - never blocks/fails account creation. */
  async sendVerificationEmail(user: {
    id: string;
    email: string;
    fullName: string | null;
  }): Promise<void> {
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await this.prisma.emailVerificationOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    this.mailService.sendMailFireAndForget({
      to: user.email,
      ...verifyEmailEmail({ name: user.fullName, otp }),
    });
  }

  async verifyEmail(rawEmail: string, otp: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    const record = await this.prisma.emailVerificationOtp.findFirst({
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

      await this.prisma.emailVerificationOtp.update({
        where: { id: record.id },
        data: {
          attemptCount: nextAttemptCount,
          ...(nextAttemptCount >= MAX_ATTEMPTS ? { used: true } : {}),
        },
      });

      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationOtp.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
  }
}
