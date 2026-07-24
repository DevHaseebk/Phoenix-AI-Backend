import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminRagController } from './admin-rag.controller';
import { AdminRagService } from './admin-rag.service';

describe('AdminRagController', () => {
  const list = jest.fn();
  const getById = jest.fn();
  const update = jest.fn();
  const approve = jest.fn();
  const unapprove = jest.fn();
  const adminRagService = {
    list,
    getById,
    update,
    approve,
    unapprove,
  } as unknown as AdminRagService;
  const adminUser = { userId: 'admin-1' } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an update with neither title nor content', async () => {
    const controller = new AdminRagController(adminRagService);

    await expect(
      controller.update('doc-1', {}, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('forwards a title-only update', async () => {
    update.mockResolvedValue({ id: 'doc-1', title: 'New title' });
    const controller = new AdminRagController(adminRagService);

    const response = await controller.update(
      'doc-1',
      { title: 'New title' },
      adminUser,
    );

    expect(update).toHaveBeenCalledWith(
      'doc-1',
      { title: 'New title' },
      'admin-1',
    );
    expect(response.data).toEqual({ id: 'doc-1', title: 'New title' });
  });

  it('forwards approve/unapprove by id and the calling admin id', async () => {
    approve.mockResolvedValue({ id: 'doc-1', status: 'APPROVED' });
    unapprove.mockResolvedValue({ id: 'doc-1', status: 'DRAFT' });
    const controller = new AdminRagController(adminRagService);

    await controller.approve('doc-1', adminUser);
    await controller.unapprove('doc-1', adminUser);

    expect(approve).toHaveBeenCalledWith('doc-1', 'admin-1');
    expect(unapprove).toHaveBeenCalledWith('doc-1', 'admin-1');
  });
});
