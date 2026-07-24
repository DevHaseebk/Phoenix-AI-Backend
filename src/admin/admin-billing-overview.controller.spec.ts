import { AdminBillingOverviewController } from './admin-billing-overview.controller';
import { AdminBillingOverviewService } from './admin-billing-overview.service';

describe('AdminBillingOverviewController', () => {
  const getOverview = jest.fn();
  const adminBillingOverviewService = {
    getOverview,
  } as unknown as AdminBillingOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps the service result', async () => {
    const overview = {
      totalActiveSubscriptions: 45,
      mrrUsd: 450,
      mrrPerSubscriptionUsd: 10,
      trialsCurrentlyActive: 30,
      trialToPaidConversionRate: 0.42,
      totalEverTrialed: 120,
      totalConverted: 50,
      canceledOrExpiredCount: 12,
      isStripeTestMode: true,
      funnelLast30Days: { signedUp: 18, enteredTrial: 18, converted: 4 },
    };
    getOverview.mockResolvedValue(overview);
    const controller = new AdminBillingOverviewController(
      adminBillingOverviewService,
    );

    const response = await controller.getOverview();

    expect(getOverview).toHaveBeenCalledWith();
    expect(response.data).toEqual(overview);
  });
});
