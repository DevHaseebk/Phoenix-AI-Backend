import { AdminRewardsOverviewController } from './admin-rewards-overview.controller';
import { AdminRewardsOverviewService } from './admin-rewards-overview.service';

describe('AdminRewardsOverviewController', () => {
  const getOverview = jest.fn();
  const adminRewardsOverviewService = {
    getOverview,
  } as unknown as AdminRewardsOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps the service result', async () => {
    const overview = {
      totalBadgesUnlocked: 150,
      totalUsers: 50,
      averageBadgesPerUser: 3,
      mostUnlockedBadges: [],
      leastUnlockedBadges: [],
    };
    getOverview.mockResolvedValue(overview);
    const controller = new AdminRewardsOverviewController(
      adminRewardsOverviewService,
    );

    const response = await controller.getOverview();

    expect(getOverview).toHaveBeenCalledWith();
    expect(response.data).toEqual(overview);
  });
});
