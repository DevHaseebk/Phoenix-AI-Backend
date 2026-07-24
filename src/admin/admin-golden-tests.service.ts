import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';

export type GoldenTestJobStatus =
  'pending' | 'running' | 'completed' | 'failed';

export interface GoldenTestJobSummary {
  total: number;
  received: number;
  errored: number;
}

export interface GoldenTestJob {
  id: string;
  status: GoldenTestJobStatus;
  triggeredByAdminUserId: string;
  startedAt: Date;
  finishedAt: Date | null;
  exitCode: number | null;
  outputPath: string | null;
  summary: GoldenTestJobSummary | null;
  /** Last ~4000 chars of combined stdout/stderr, for basic visibility
   * without needing to read the output markdown file directly. */
  logTail: string;
  errorMessage: string | null;
}

const LOG_TAIL_MAX_CHARS = 4000;

function tail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

/** Parses the exact two lines run-golden-tests.ts's own main() prints on
 * success - kept as simple regex over stdout rather than teaching the
 * script itself to also write machine-readable JSON, since the script is
 * shared with the CLI (`npm run test:golden`) and this admin trigger is
 * explicitly meant to invoke it unchanged, not fork its output format. */
function parseSummary(stdout: string): {
  outputPath: string | null;
  summary: GoldenTestJobSummary | null;
} {
  const pathMatch = /Results written to: (.+)/.exec(stdout);
  const summaryMatch = /Received: (\d+)\/(\d+), errored: (\d+)\/(\d+)/.exec(
    stdout,
  );

  return {
    outputPath: pathMatch ? pathMatch[1].trim() : null,
    summary: summaryMatch
      ? {
          received: Number(summaryMatch[1]),
          total: Number(summaryMatch[2]),
          errored: Number(summaryMatch[3]),
        }
      : null,
  };
}

/**
 * Triggers the existing golden-test CLI script (scripts/run-golden-tests.ts,
 * docs/15_AI_Golden_Test_Set.md) as a real child process rather than
 * reimplementing its ~450 lines of logic in-process - this is deliberately
 * "invoke it programmatically" per the task's own wording, not a rewrite.
 * The script makes ~21 real Gemini API calls and takes real wall-clock time
 * (request-throttled), so job state is tracked in-memory (no job-queue
 * infra exists in this repo, per CLAUDE.md - this is a single, short-lived,
 * founder-triggered job, not a recurring/scheduled one) and polled via
 * GET /admin/golden-tests/status/:jobId.
 */
@Injectable()
export class AdminGoldenTestsService {
  private readonly logger = new Logger(AdminGoldenTestsService.name);
  private readonly jobs = new Map<string, GoldenTestJob>();

  constructor(
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  startRun(adminUserId: string): GoldenTestJob {
    const job: GoldenTestJob = {
      id: randomUUID(),
      status: 'pending',
      triggeredByAdminUserId: adminUserId,
      startedAt: new Date(),
      finishedAt: null,
      exitCode: null,
      outputPath: null,
      summary: null,
      logTail: '',
      errorMessage: null,
    };

    this.jobs.set(job.id, job);

    // Real Gemini quota is spent by this action even though nothing in this
    // app's own data is mutated - audited for the same reason a mutating
    // admin action is: it's a real-world side effect an admin deliberately
    // triggered, not a read.
    void this.auditLog.record({
      adminUserId,
      action: 'golden-tests.run',
      targetType: 'GoldenTestRun',
      targetId: job.id,
      metadata: {},
    });

    this.launch(job);

    return job;
  }

  getJob(jobId: string): GoldenTestJob | undefined {
    return this.jobs.get(jobId);
  }

  private launch(job: GoldenTestJob): void {
    job.status = 'running';

    const port = this.config.get<string>('PORT') ?? '4000';
    const apiBaseUrl = `http://localhost:${port}/api/v1`;

    let stdout = '';
    let stderr = '';

    let child;
    try {
      // shell: true is required on Windows - `npx` resolves to `npx.cmd`,
      // which Node's spawn() cannot exec directly without a shell (confirmed
      // live: without this, spawn fails with ENOENT even though `npx` works
      // fine from an interactive terminal). Harmless on POSIX, where spawn
      // already goes through /bin/sh either way.
      child = spawn('npx', ['ts-node', '-T', 'scripts/run-golden-tests.ts'], {
        cwd: process.cwd(),
        env: { ...process.env, API_BASE_URL: apiBaseUrl },
        shell: true,
      });
    } catch (error) {
      job.status = 'failed';
      job.finishedAt = new Date();
      job.errorMessage = error instanceof Error ? error.message : String(error);
      return;
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      job.status = 'failed';
      job.finishedAt = new Date();
      job.errorMessage = error.message;
      job.logTail = tail(stdout + stderr, LOG_TAIL_MAX_CHARS);
    });

    child.on('close', (code) => {
      job.finishedAt = new Date();
      job.exitCode = code;
      job.logTail = tail(stdout + stderr, LOG_TAIL_MAX_CHARS);

      const { outputPath, summary } = parseSummary(stdout);
      job.outputPath = outputPath;
      job.summary = summary;

      if (code === 0) {
        job.status = 'completed';
      } else {
        job.status = 'failed';
        job.errorMessage =
          tail(stderr || stdout, 1000) || `Exited with code ${code}`;
      }

      this.logger.log(
        `Golden test job ${job.id} finished with status ${job.status} (exit code ${code}).`,
      );
    });
  }
}
