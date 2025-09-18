import { logger } from "./logger";

export type AckStatus = "ok" | "retry" | "failed";

export interface JobResult {
  id: string;
  status: AckStatus;
  error: string | null;
}

export interface JobTimeoutEvent {
  jobId: string;
}

interface JobTracker {
  timer: ReturnType<typeof setTimeout>;
}

export class JobManager extends EventTarget {
  static readonly EVENT_JOB_TIMEOUT = "jobtimeout";

  private readonly jobTimeoutMs: number;
  private readonly outstandingJobs = new Map<string, JobTracker>();
  private readonly completedJobs = new Set<string>();

  constructor(opts: { jobTimeoutMs: number }) {
    super();
    this.jobTimeoutMs = opts.jobTimeoutMs;
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
        this.dispatchEvent(
          new CustomEvent<JobTimeoutEvent>(JobManager.EVENT_JOB_TIMEOUT, { detail: { jobId } })
        );
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
