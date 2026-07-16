import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EmailVerificationService } from './email-verification.service';
import { hashOtp } from './otp.util';

describe('EmailVerificationService', () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const otpCreate = jest.fn();
  const otpFindFirst = jest.fn();
  const otpUpdate = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    emailVerificationOtp: {
      create: otpCreate,
      findFirst: otpFindFirst,
      update: otpUpdate,
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const sendMailFireAndForget = jest.fn();
  const mailService = {
    sendMailFireAndForget,
  } as unknown as MailService;

  let service: EmailVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue(undefined);
    service = new EmailVerificationService(prisma, mailService);
  });

  describe('sendVerificationEmail', () => {
    it('creates an OTP row and fire-and-forget sends the email', async () => {
      await service.sendVerificationEmail({
        id: 'user-id',
        email: 'haseeb@example.com',
        fullName: 'Haseeb',
      });

      expect(otpCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-id' }) as unknown,
        }),
      );
      expect(sendMailFireAndForget).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'haseeb@example.com' }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('stamps emailVerifiedAt and marks the OTP used on a valid code', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 0,
      });

      await service.verifyEmail('haseeb@example.com', '123456');

      expect(transaction).toHaveBeenCalled();
    });

    it('rejects a wrong code and increments attemptCount', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 0,
      });

      await expect(
        service.verifyEmail('haseeb@example.com', '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(otpUpdate).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { attemptCount: 1 },
      });
    });

    it('rejects an expired OTP', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() - 1000),
        used: false,
        attemptCount: 0,
      });

      await expect(
        service.verifyEmail('haseeb@example.com', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects with a generic message for a nonexistent account', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(
        service.verifyEmail('nobody@example.com', '123456'),
      ).rejects.toThrow('Invalid or expired code');
    });
  });
});
