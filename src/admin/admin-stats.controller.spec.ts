import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

describe('AdminStatsController', () => {
  const getStats = jest.fn();
  const adminStatsService = { getStats } as unknown as AdminStatsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the stats service result wrapped in the success envelope', async () => {
    getStats.mockResolvedValue({
      totalUsers: 10,
      trialingUsers: 3,
      activeUsers: 2,
      signupsLast7Days: 1,
      pendingUnknownFoods: 4,
    });
    const controller = new AdminStatsController(adminStatsService);

    const response = await controller.getStats();

    expect(getStats).toHaveBeenCalledWith();
    expect(response.data).toEqual({
      totalUsers: 10,
      trialingUsers: 3,
      activeUsers: 2,
      signupsLast7Days: 1,
      pendingUnknownFoods: 4,
    });
  });
});
