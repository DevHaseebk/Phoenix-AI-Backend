import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const prisma = {
    user: {
      findUnique,
      update,
    },
    refreshToken: {
      updateMany,
    },
  } as unknown as PrismaService;
  const sendMailFireAndForget = jest.fn();
  const mailService = {
    sendMailFireAndForget,
  } as unknown as import('../mail/mail.service').MailService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns safe current user profile data', async () => {
    const createdAt = new Date('2026-07-05T10:00:00.000Z');
    const updatedAt = new Date('2026-07-05T10:05:00.000Z');
    const lastActiveAt = new Date('2026-07-05T10:10:00.000Z');

    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      phone: '+923001234567',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt,
      createdAt,
      updatedAt,
      deletedAt: null,
      passwordHash: 'should-not-be-selected',
    });

    const service = new UsersService(prisma, mailService);
    const response = await service.getCurrentUser('user-id');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    expect(response).toEqual({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      phone: '+923001234567',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      emailVerified: false,
      lastActiveAt,
      createdAt,
      updatedAt,
    });
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('computes emailVerified true when emailVerifiedAt is set', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      phone: null,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-07-10T00:00:00.000Z'),
      lastActiveAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const service = new UsersService(prisma, mailService);
    const response = await service.getCurrentUser('user-id');

    expect(response.emailVerified).toBe(true);
  });

  it('rejects missing users', async () => {
    findUnique.mockResolvedValue(null);

    const service = new UsersService(prisma, mailService);

    await expect(
      service.getCurrentUser('missing-user-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects non-active or deleted users', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new UsersService(prisma, mailService);

    await expect(service.getCurrentUser('user-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('updates allowed profile fields and returns safe user data', async () => {
    const createdAt = new Date('2026-07-05T10:00:00.000Z');
    const updatedAt = new Date('2026-07-05T10:05:00.000Z');

    findUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    update.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb Updated',
      phone: '+923001234567',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt: null,
      createdAt,
      updatedAt,
      passwordHash: 'should-not-be-selected',
    });

    const service = new UsersService(prisma, mailService);
    const response = await service.updateProfile('user-id', {
      fullName: 'Haseeb Updated',
      phone: '+923001234567',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: {
        id: true,
        status: true,
        deletedAt: true,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: {
        fullName: 'Haseeb Updated',
        phone: '+923001234567',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(response).not.toHaveProperty('passwordHash');
    expect(response.fullName).toBe('Haseeb Updated');
    expect(response.phone).toBe('+923001234567');
  });

  it('rejects empty profile update bodies', async () => {
    const service = new UsersService(prisma, mailService);

    await expect(service.updateProfile('user-id', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects profile updates for inactive or deleted users', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.INACTIVE,
      deletedAt: null,
    });

    const service = new UsersService(prisma, mailService);

    await expect(
      service.updateProfile('user-id', { fullName: 'Haseeb Updated' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  it('changes password with a new hash and revokes active refresh tokens', async () => {
    const currentPasswordHash = await argon2.hash('CurrentPassword123', {
      type: argon2.argon2id,
    });

    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      passwordHash: currentPasswordHash,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    update.mockResolvedValue({ id: 'user-id' });
    updateMany.mockResolvedValue({ count: 2 });

    const service = new UsersService(prisma, mailService);
    const response = await service.changePassword('user-id', {
      currentPassword: 'CurrentPassword123',
      newPassword: 'NewStrongPassword123',
    });

    expect(response).toBeNull();
    expect(sendMailFireAndForget).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'haseeb@example.com' }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { passwordHash: expect.any(String) as string },
      select: { id: true },
    });

    const updateCalls = update.mock.calls as Array<
      [{ data: { passwordHash: string } }]
    >;
    const newPasswordHash = updateCalls[0][0].data.passwordHash;

    expect(newPasswordHash).not.toBe('NewStrongPassword123');
    await expect(
      argon2.verify(newPasswordHash, 'NewStrongPassword123'),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('rejects wrong current password', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: await argon2.hash('CurrentPassword123', {
        type: argon2.argon2id,
      }),
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });

    const service = new UsersService(prisma, mailService);

    await expect(
      service.changePassword('user-id', {
        currentPassword: 'WrongPassword123',
        newPassword: 'NewStrongPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects password changes for inactive or deleted users', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: await argon2.hash('CurrentPassword123', {
        type: argon2.argon2id,
      }),
      status: UserStatus.DELETED,
      deletedAt: new Date(),
    });

    const service = new UsersService(prisma, mailService);

    await expect(
      service.changePassword('user-id', {
        currentPassword: 'CurrentPassword123',
        newPassword: 'NewStrongPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
