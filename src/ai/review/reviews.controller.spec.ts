import { ReviewService } from './review.service';
import { ReviewsController } from './reviews.controller';

describe('ReviewsController', () => {
  const getLatest = jest.fn();
  const generate = jest.fn();
  const reviewService = { getLatest, generate } as unknown as ReviewService;
  const currentUser = { userId: 'user-id', email: 'user@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the latest review (or null) for the current user only', async () => {
    getLatest.mockResolvedValue(null);
    const controller = new ReviewsController(reviewService);

    const response = await controller.latest(currentUser as never);

    expect(getLatest).toHaveBeenCalledWith('user-id');
    expect(response.data).toBeNull();
  });

  it('generates a review for the current user with the given weekStart', async () => {
    generate.mockResolvedValue({ id: 'review-1' });
    const controller = new ReviewsController(reviewService);

    const response = await controller.generate(currentUser as never, {
      weekStart: '2026-06-25',
    });

    expect(generate).toHaveBeenCalledWith('user-id', '2026-06-25');
    expect(response.data).toEqual({ id: 'review-1' });
  });

  it('generates a review with no weekStart when omitted', async () => {
    generate.mockResolvedValue({ id: 'review-2' });
    const controller = new ReviewsController(reviewService);

    await controller.generate(currentUser as never, {});

    expect(generate).toHaveBeenCalledWith('user-id', undefined);
  });
});
