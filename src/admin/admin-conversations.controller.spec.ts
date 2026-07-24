import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminConversationsController } from './admin-conversations.controller';
import { AdminConversationsService } from './admin-conversations.service';

describe('AdminConversationsController', () => {
  const list = jest.fn();
  const getById = jest.fn();
  const adminConversationsService = {
    list,
    getById,
  } as unknown as AdminConversationsService;
  const adminUser = { userId: 'admin-1' } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the search query to the service', async () => {
    list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const controller = new AdminConversationsController(
      adminConversationsService,
    );

    await controller.list({ search: 'haseeb' });

    expect(list).toHaveBeenCalledWith({ search: 'haseeb' });
  });

  it('forwards the id and the calling admin id to the service', async () => {
    getById.mockResolvedValue({ id: 'conv-1', messages: [] });
    const controller = new AdminConversationsController(
      adminConversationsService,
    );

    const response = await controller.getById('conv-1', adminUser);

    expect(getById).toHaveBeenCalledWith('conv-1', 'admin-1');
    expect(response.data).toEqual({ id: 'conv-1', messages: [] });
  });
});
