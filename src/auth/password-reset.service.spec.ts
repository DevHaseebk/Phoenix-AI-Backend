import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashOtp } from './otp.util';
import { hashResetToken } from './reset-token.util';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const otpCreate = jest.fn();
  const otpFindFirst = jest.fn();
  const otpFindUnique = jest.fn();
  const otpUpdate = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    passwordResetOtp: {
      create: otpCreate,
      findFirst: otpFindFirst,
      findUnique: otpFindUnique,
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
    transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
    service = new PasswordResetService(prisma, mailService);
  });

  describe('forgotPassword', () => {
    it('sends an OTP for a first-ever request and hints a 60s next-resend cooldown', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
        passwordResetRequestCount: 0,
        passwordResetLastRequestedAt: null,
      });

      const result = await service.forgotPassword(' HASEEB@example.com ');

      expect(result).toEqual({ sent: true, retryAfterSeconds: 60 });
      expect(otpCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-id' }) as unknown,
        }),
      );
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-id' },
          data: expect.objectContaining({
            passwordResetRequestCount: 1,
          }) as unknown,
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'haseeb@example.com' }),
      );
    });

    it('silently pretends success for a nonexistent account (no enumeration)', async () => {
      userFindUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result).toEqual({ sent: true, retryAfterSeconds: 60 });
      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('silently pretends success for a Google-only account with no password', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: null,
        passwordResetRequestCount: 0,
        passwordResetLastRequestedAt: null,
      });

      const result = await service.forgotPassword('haseeb@example.com');

      expect(result).toEqual({ sent: true, retryAfterSeconds: 60 });
      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('denies a resend before the 2nd-request 1-minute cooldown elapses, reporting remaining wait', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
        passwordResetRequestCount: 1,
        passwordResetLastRequestedAt: new Date(Date.now() - 10_000),
      });

      const result = await service.forgotPassword('haseeb@example.com');

      expect(result.sent).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(50);
      expect(otpCreate).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('allows a resend once its tier cooldown has fully elapsed', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
        passwordResetRequestCount: 1,
        passwordResetLastRequestedAt: new Date(Date.now() - 61_000),
      });

      const result = await service.forgotPassword('haseeb@example.com');

      expect(result.sent).toBe(true);
      expect(otpCreate).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalled();
    });

    it('treats a stale (>30min old) last request as a fresh sequence, skipping cooldown', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
        passwordResetRequestCount: 5,
        passwordResetLastRequestedAt: new Date(Date.now() - 31 * 60 * 1000),
      });

      const result = await service.forgotPassword('haseeb@example.com');

      expect(result.sent).toBe(true);
      expect(result.retryAfterSeconds).toBe(60);
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordResetRequestCount: 1,
          }) as unknown,
        }),
      );
    });

    it('propagates a genuine send failure for an existing account', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        passwordHash: 'hashed',
        passwordResetRequestCount: 0,
        passwordResetLastRequestedAt: null,
      });
      sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.forgotPassword('haseeb@example.com'),
      ).rejects.toThrow('SMTP down');
    });
  });

  describe('verifyResetOtp', () => {
    it('issues a reset token on a valid OTP and resets the cooldown counter to 0', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 0,
      });

      const result = await service.verifyResetOtp(
        'haseeb@example.com',
        '123456',
      );

      expect(result.resetToken).toEqual(expect.any(String));
      expect(transaction).toHaveBeenCalled();
      expect(otpUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-id' },
          data: expect.objectContaining({ verified: true }) as unknown,
        }),
      );
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          passwordResetRequestCount: 0,
          passwordResetLastRequestedAt: null,
        },
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
        service.verifyResetOtp('haseeb@example.com', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('increments attemptCount on a wrong code and locks after 5', async () => {
      const otpHash = await hashOtp('123456');
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      otpFindFirst.mockResolvedValue({
        id: 'otp-id',
        otpHash,
        expiresAt: new Date(Date.now() + 60_000),
        used: false,
        attemptCount: 4,
      });

      await expect(
        service.verifyResetOtp('haseeb@example.com', '000000'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(otpUpdate).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { attemptCount: 5, used: true },
      });
    });

    it('rejects with the same generic message for a nonexistent account', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(
        service.verifyResetOtp('nobody@example.com', '123456'),
      ).rejects.toThrow('Invalid or expired code');
    });
  });

  describe('resetPassword', () => {
    it('resets the password, revokes sessions, and confirms via email on a valid token', async () => {
      const resetToken = 'a-raw-reset-token';
      otpFindUnique.mockResolvedValue({
        id: 'otp-id',
        verified: true,
        used: false,
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
        },
      });

      await service.resetPassword(resetToken, 'NewStrongPassword123');

      expect(otpFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resetTokenHash: hashResetToken(resetToken) },
        }),
      );
      expect(transaction).toHaveBeenCalled();
      expect(sendMailFireAndForget).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'haseeb@example.com' }),
      );
    });

    it('rejects an unknown/invalid reset token', async () => {
      otpFindUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'NewStrongPassword123'),
      ).rejects.toThrow('Invalid or expired reset token');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a token that was never verified', async () => {
      otpFindUnique.mockResolvedValue({
        id: 'otp-id',
        verified: false,
        used: false,
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
        },
      });

      await expect(
        service.resetPassword('some-token', 'NewStrongPassword123'),
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('rejects an expired reset token', async () => {
      otpFindUnique.mockResolvedValue({
        id: 'otp-id',
        verified: true,
        used: false,
        resetTokenExpiresAt: new Date(Date.now() - 1000),
        user: {
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
        },
      });

      await expect(
        service.resetPassword('some-token', 'NewStrongPassword123'),
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('rejects a reset token that has already been used once (single-use)', async () => {
      otpFindUnique.mockResolvedValue({
        id: 'otp-id',
        verified: true,
        used: true,
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
        },
      });

      await expect(
        service.resetPassword('some-token', 'NewStrongPassword123'),
      ).rejects.toThrow('Invalid or expired reset token');
      expect(transaction).not.toHaveBeenCalled();
    });
  });
});
