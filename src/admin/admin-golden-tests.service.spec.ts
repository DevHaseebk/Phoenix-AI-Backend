import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AdminGoldenTestsService } from './admin-golden-tests.service';

const spawnMock: jest.Mock = jest.fn();

jest.mock('child_process', () => {
  const actual: Record<string, unknown> = jest.requireActual('child_process');

  return {
    ...actual,
    spawn: (...args: unknown[]): unknown => spawnMock(...args) as unknown,
  };
});

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

describe('AdminGoldenTestsService', () => {
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;
  const config = {
    get: (key: string) => (key === 'PORT' ? '4000' : undefined),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a job, spawns the golden-test script, and records an AuditLogEntry', () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const service = new AdminGoldenTestsService(config, auditLog);

    const job = service.startRun('admin-1');

    expect(job.status).toBe('running');
    expect(job.triggeredByAdminUserId).toBe('admin-1');
    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['ts-node', '-T', 'scripts/run-golden-tests.ts'],
      expect.objectContaining({
        env: expect.objectContaining({
          API_BASE_URL: 'http://localhost:4000/api/v1',
        }) as Record<string, string>,
      }),
    );
    expect(record).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'golden-tests.run',
      targetType: 'GoldenTestRun',
      targetId: job.id,
      metadata: {},
    });
  });

  it('parses the output path and pass/fail summary on a clean exit', () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const service = new AdminGoldenTestsService(config, auditLog);

    const job = service.startRun('admin-1');
    fakeChild.stdout.emit(
      'data',
      Buffer.from(
        'Results written to: /repo/backend/golden-test-results/2026.md\n' +
          'Received: 18/21, errored: 3/21\n',
      ),
    );
    fakeChild.emit('close', 0);

    const updated = service.getJob(job.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.exitCode).toBe(0);
    expect(updated?.outputPath).toBe(
      '/repo/backend/golden-test-results/2026.md',
    );
    expect(updated?.summary).toEqual({ received: 18, total: 21, errored: 3 });
  });

  it('marks the job failed on a nonzero exit code', () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const service = new AdminGoldenTestsService(config, auditLog);

    const job = service.startRun('admin-1');
    fakeChild.stderr.emit(
      'data',
      Buffer.from('Golden test runner failed: boom'),
    );
    fakeChild.emit('close', 1);

    const updated = service.getJob(job.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.exitCode).toBe(1);
    expect(updated?.errorMessage).toContain('boom');
  });

  it('marks the job failed if the child process itself errors (e.g. spawn ENOENT)', () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const service = new AdminGoldenTestsService(config, auditLog);

    const job = service.startRun('admin-1');
    fakeChild.emit('error', new Error('spawn npx ENOENT'));

    const updated = service.getJob(job.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toBe('spawn npx ENOENT');
  });

  it('returns undefined for an unknown jobId', () => {
    const service = new AdminGoldenTestsService(config, auditLog);

    expect(service.getJob('nonexistent')).toBeUndefined();
  });
});
