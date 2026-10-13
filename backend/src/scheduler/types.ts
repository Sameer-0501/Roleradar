/**
 * Scheduler types.
 */

import type { ICollector } from '../collectors/types.js';
import type { PipelineSourceConfig } from '../pipeline/pipeline.js';

export interface ScheduledJob {
  name: string;
  collector: ICollector;
  intervalMs: number;
  /** Internal timer handle */
  handle?: ReturnType<typeof setInterval>;
  /** Last time this job ran */
  lastRunAt?: Date;
  /** Last time this job completed successfully */
  lastSuccessAt?: Date;
  /** Company UUID in the DB — required for pipeline to upsert/verify */
  companyId?: string;
  /** Company name for source health tracking */
  companyName?: string;
  /** Source config — passed to the pipeline for verification */
  sourceConfig?: PipelineSourceConfig;
}


export type SchedulerStatus = 'stopped' | 'running';

export interface SchedulerState {
  status: SchedulerStatus;
  registeredJobs: number;
  jobs: Array<{
    name: string;
    intervalMs: number;
    lastRunAt?: Date;
    lastSuccessAt?: Date;
  }>;
}
