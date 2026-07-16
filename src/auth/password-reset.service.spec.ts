import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashOtp } from './otp.util';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const otpCount = jest.fn();
  const otpCreate = jest.fn();
  const otpFindFirst = jest.fn();
  const otpUpdate = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    passwordResetOtp: {
      count: otpCount,
      create: otpCreate,
      findFirst: otpFindFirst,
      update: otpUpdate,
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const sendMail = jest.fn();
  const sendMailFireAndForget = jest.fn();
  const mailService = {
    sendMail,
    sendMailFireAndForget,
  } as unknown as MailService;

  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue(undefined);
    transaction.mockResolvedValue(undefined);
    service = new PasswordResetService(prisma, mailService);
  });

  describe('forgotPassword', () => {
    it('generates, stores, and sends an OTP for an existing account with a password', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
      });
      otpCount.mockResolvedValue(0);

      await service.forgotPassword(' HASEEB@example.com ');

      expect(otpCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-id' }) as unknown,
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'haseeb@example.com' }),
      );
    });

    it('silently no-ops for a nonexistent account (no enumeration)', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('silently no-ops for a Google-only account with no password', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: null,
      });

      await service.forgotPassword('haseeb@example.com');

      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('skips creating/sending a new OTP once the 3/15-min cap is hit, without throwing', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
      });
      otpCount.mockResolvedValue(3);

      await expect(
        service.forgotPassword('haseeb@example.com'),
      ).resolves.toBeUndefined();
      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('propagates a genuine send failure for an existing account', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
      });
      otpCount.mockResolvedValue(0);
      sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.forgotPassword('haseeb@example.com'),
      ).rejects.toThrow('SMTP down');
    });
  });

  describe('resetPassword', () => {
    it('resets the password, revokes sessions, and confirms via email on a valid OTP', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
      });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 0,
      });

      await service.resetPassword(
        'haseeb@example.com',
        '123456',
        'NewStrongPassword123',
      );

      expect(transaction).toHaveBeenCalled();
      expect(sendMailFireAndForget).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'haseeb@example.com' }),
      );
    });

    it('rejects an expired OTP', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
      });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() - 1000),
        used: false,
        attemptCount: 0,
      });

      await expect(
        service.resetPassword(
          'haseeb@example.com',
          '123456',
          'NewStrongPassword123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('increments attemptCount on a wrong code and locks after 5', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
      });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 4,
      });

      await expect(
        service.resetPassword(
          'haseeb@example.com',
          '000000',
          'NewStrongPassword123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(otpUpdate).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { attemptCount: 5, used: true },
      });
    });

    it('rejects an OTP already at the attempt limit even with the right code', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
      });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 5,
      });

      await expect(
        service.resetPassword(
          'haseeb@example.com',
          '123456',
          'NewStrongPassword123',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects with the same generic message for a nonexistent account', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(
          'nobody@example.com',
          '123456',
          'NewStrongPassword123',
        ),
      ).rejects.toThrow('Invalid or expired code');
    });
  });
});
