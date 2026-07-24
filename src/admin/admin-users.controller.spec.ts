import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersController', () => {
  const list = jest.fn();
  const setAccessOverride = jest.fn();
  const adminUsersService = {
    list,
    setAccessOverride,
  } as unknown as AdminUsersService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the query params to the service and wraps the result', async () => {
    list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const controller = new AdminUsersController(adminUsersService);

    const response = await controller.list({ search: 'haseeb' });

    expect(list).toHaveBeenCalledWith({ search: 'haseeb' });
    expect(response.data).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('forwards the id, accessOverride flag, and calling admin id to the service', async () => {
    setAccessOverride.mockResolvedValue({
      userId: 'user-1',
      status: 'EXPIRED',
      accessOverride: true,
      trialEndsAt: null,
    });
    const controller = new AdminUsersController(adminUsersService);

    const response = await controller.setAccessOverride(
      'user-1',
      { accessOverride: true },
      { userId: 'admin-1' } as AuthenticatedUser,
    );

    expect(setAccessOverride).toHaveBeenCalledWith('user-1', true, 'admin-1');
    expect(response.data).toEqual({
      userId: 'user-1',
      status: 'EXPIRED',
      accessOverride: true,
      trialEndsAt: null,
    });
  });
});
