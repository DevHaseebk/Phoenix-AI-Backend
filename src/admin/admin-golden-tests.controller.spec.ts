import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminGoldenTestsController } from './admin-golden-tests.controller';
import { AdminGoldenTestsService } from './admin-golden-tests.service';

describe('AdminGoldenTestsController', () => {
  const startRun = jest.fn();
  const getJob = jest.fn();
  const adminGoldenTestsService = {
    startRun,
    getJob,
  } as unknown as AdminGoldenTestsService;
  const adminUser = { userId: 'admin-1' } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('rejects a request without confirm: true', () => {
      const controller = new AdminGoldenTestsController(
        adminGoldenTestsService,
      );

      expect(() => controller.run({ confirm: false }, adminUser)).toThrow(
        BadRequestException,
      );
      expect(startRun).not.toHaveBeenCalled();
    });

    it('starts a run and forwards the calling admin id when confirmed', () => {
      startRun.mockReturnValue({ id: 'job-1', status: 'running' });
      const controller = new AdminGoldenTestsController(
        adminGoldenTestsService,
      );

      const response = controller.run({ confirm: true }, adminUser);

      expect(startRun).toHaveBeenCalledWith('admin-1');
      expect(response.data).toEqual({ id: 'job-1', status: 'running' });
    });
  });

  describe('getStatus', () => {
    it('returns the job when found', () => {
      getJob.mockReturnValue({ id: 'job-1', status: 'completed' });
      const controller = new AdminGoldenTestsController(
        adminGoldenTestsService,
      );

      const response = controller.getStatus('job-1');

      expect(response.data).toEqual({ id: 'job-1', status: 'completed' });
    });

    it('throws NotFoundException for an unknown jobId', () => {
      getJob.mockReturnValue(undefined);
      const controller = new AdminGoldenTestsController(
        adminGoldenTestsService,
      );

      expect(() => controller.getStatus('missing')).toThrow(NotFoundException);
    });
  });
});
