import { UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const getCurrentUser = jest.fn();
  const updateProfile = jest.fn();
  const changePassword = jest.fn();
  const usersService = {
    getCurrentUser,
    updateProfile,
    changePassword,
  } as unknown as UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the standard current user response', async () => {
    const currentUser: AuthenticatedUser = {
      userId: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    };
    const userProfile = {
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      phone: null,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt: null,
      createdAt: new Date('2026-07-05T10:00:00.000Z'),
      updatedAt: new Date('2026-07-05T10:05:00.000Z'),
    };
    getCurrentUser.mockResolvedValue(userProfile);

    const controller = new UsersController(usersService);
    const response = await controller.getMe(currentUser);

    expect(getCurrentUser).toHaveBeenCalledWith('user-id');
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: userProfile,
      meta: {},
    });
  });

  it('returns the standard profile update response', async () => {
    const currentUser: AuthenticatedUser = {
      userId: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    };
    const userProfile = {
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb Updated',
      phone: '+923001234567',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt: null,
      createdAt: new Date('2026-07-05T10:00:00.000Z'),
      updatedAt: new Date('2026-07-05T10:05:00.000Z'),
    };
    updateProfile.mockResolvedValue(userProfile);

    const controller = new UsersController(usersService);
    const response = await controller.updateProfile(currentUser, {
      fullName: 'Haseeb Updated',
    });

    expect(updateProfile).toHaveBeenCalledWith('user-id', {
      fullName: 'Haseeb Updated',
    });
    expect(response).toEqual({
      success: true,
      message: 'Profile updated successfully',
      data: userProfile,
      meta: {},
    });
  });

  it('returns the standard password change response', async () => {
    const currentUser: AuthenticatedUser = {
      userId: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    };
    const dto = {
      currentPassword: 'CurrentPassword123',
      newPassword: 'NewStrongPassword123',
    };
    changePassword.mockResolvedValue(null);

    const controller = new UsersController(usersService);
    const response = await controller.changePassword(currentUser, dto);

    expect(changePassword).toHaveBeenCalledWith('user-id', dto);
    expect(response).toEqual({
      success: true,
      message: 'Password changed successfully',
      data: null,
      meta: {},
    });
  });
});
