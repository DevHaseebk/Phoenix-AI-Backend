import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

interface MockRequest {
  headers: {
    authorization?: string;
  };
  user?: unknown;
}

function createContext(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const verifyAsync = jest.fn();
  const findUnique = jest.fn();
  const jwtService = {
    verifyAsync,
  } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;
  const prisma = {
    user: {
      findUnique,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a valid bearer token and attaches current user context', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    });
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
      deletedAt: null,
    });
    const request: MockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'test-access-secret',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        role: true,
        deletedAt: true,
      },
    });
    expect(request.user).toEqual({
      userId: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    });
  });

  it('rejects missing authorization header', async () => {
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization header', async () => {
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Token invalid-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens', async () => {
    verifyAsync.mockRejectedValue(new Error('invalid token'));
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer invalid-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer expired-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects inactive, suspended, or deleted users', async () => {
    verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    });
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });
    const guard = new JwtAuthGuard(jwtService, config, prisma);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: 'Bearer valid-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
