import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user.interface';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

interface MockRequest {
  user?: AuthenticatedUser;
}

function createContext(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  const canActivate = jest.fn();
  const jwtAuthGuard = { canActivate } as unknown as JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a request whose JwtAuthGuard-attached user has role ADMIN', async () => {
    const request: MockRequest = {
      user: {
        userId: 'admin-id',
        email: 'founder@example.com',
        fullName: 'Founder',
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      },
    };
    canActivate.mockResolvedValue(true);
    const guard = new AdminGuard(jwtAuthGuard);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(canActivate).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid, authenticated non-admin user', async () => {
    const request: MockRequest = {
      user: {
        userId: 'user-id',
        email: 'user@example.com',
        fullName: 'Regular User',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      },
    };
    canActivate.mockResolvedValue(true);
    const guard = new AdminGuard(jwtAuthGuard);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propagates JwtAuthGuard rejection (invalid/missing token) without checking role', async () => {
    const request: MockRequest = {};
    canActivate.mockRejectedValue(new Error('unauthorized'));
    const guard = new AdminGuard(jwtAuthGuard);

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      'unauthorized',
    );
  });
});
