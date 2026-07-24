import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

describe('AuditLogController', () => {
  const list = jest.fn();
  const auditLogService = { list } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards query filters to the service and wraps the result', async () => {
    list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const controller = new AuditLogController(auditLogService);

    const response = await controller.list({ targetType: 'FoodItem' });

    expect(list).toHaveBeenCalledWith({ targetType: 'FoodItem' });
    expect(response.data).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});
