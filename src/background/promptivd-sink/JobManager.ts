import { logger } from "./logger";

export type AckStatus = "ok" | "retry" | "failed";

export interface JobResult {
  id: string;
  status: AckStatus;
  error: string | null;
}

export interface JobTimeoutHandler {
  (jobId: string): void;
}

interface JobTracker {
  timer: ReturnType<typeof setTimeout>;
}

export class JobManager {
  private readonly jobTimeoutMs: number;
  private readonly onJobTimeout: JobTimeoutHandler;
  private readonly outstandingJobs = new Map<string, JobTracker>();
  private readonly completedJobs = new Set<string>();

  constructor(jobTimeoutMs: number, onJobTimeout: JobTimeoutHandler) {
    this.jobTimeoutMs = jobTimeoutMs;
    this.onJobTimeout = onJobTimeout;
  }

  startJob(jobId: string): boolean {
    if (this.outstandingJobs.has(jobId)) return false;

    if (this.completedJobs.has(jobId)) {
      logger.info("Ignoring duplicate job", jobId);
      return false;
    }

    const timer = setTimeout(() => {
      this.outstandingJobs.delete(jobId);

      if (!this.completedJobs.has(jobId)) {
        this.completedJobs.add(jobId);
        logger.warn("Job timed out", jobId);
        this.onJobTimeout(jobId);
      }
    }, this.jobTimeoutMs);

    this.outstandingJobs.set(jobId, { timer });
    return true;
  }

  completeJob(jobId: string): boolean {
    if (this.completedJobs.has(jobId)) return false;

    const tracker = this.outstandingJobs.get(jobId);
    if (tracker) {
      clearTimeout(tracker.timer);
      this.outstandingJobs.delete(jobId);
    }

    this.completedJobs.add(jobId);
    return true;
  }

  isCompleted(jobId: string): boolean {
    return this.completedJobs.has(jobId);
  }

  isOutstanding(jobId: string): boolean {
    return this.outstandingJobs.has(jobId);
  }

  clearAll(): void {
    for (const [, tracker] of this.outstandingJobs) {
      clearTimeout(tracker.timer);
    }
    this.outstandingJobs.clear();
    this.completedJobs.clear();
  }

  clearOutstanding(): void {
    for (const [, tracker] of this.outstandingJobs) {
      clearTimeout(tracker.timer);
    }
    this.outstandingJobs.clear();
  }

  getOutstandingCount(): number {
    return this.outstandingJobs.size;
  }

  getCompletedCount(): number {
    return this.completedJobs.size;
  }
}
