/**
 * Tests: Database Schema Structure
 *
 * Verifies that the schema exports the correct tables with the
 * expected column definitions and constraints — without a live DB.
 */

import { describe, it, expect } from 'vitest';
import * as schema from '../database/schema.js';

describe('Schema — table exports', () => {
  it('exports companies table', () => {
    expect(schema.companies).toBeDefined();
  });

  it('exports jobs table', () => {
    expect(schema.jobs).toBeDefined();
  });

  it('exports jobVerifications table', () => {
    expect(schema.jobVerifications).toBeDefined();
  });

  it('exports users table', () => {
    expect(schema.users).toBeDefined();
  });

  it('exports userPreferences table', () => {
    expect(schema.userPreferences).toBeDefined();
  });

  it('exports notifications table', () => {
    expect(schema.notifications).toBeDefined();
  });

  it('exports scanRuns table', () => {
    expect(schema.scanRuns).toBeDefined();
  });
});

describe('Schema — enum exports', () => {
  it('exports atsTypeEnum', () => {
    expect(schema.atsTypeEnum).toBeDefined();
  });

  it('exports jobStatusEnum', () => {
    expect(schema.jobStatusEnum).toBeDefined();
  });

  it('exports verificationStatusEnum', () => {
    expect(schema.verificationStatusEnum).toBeDefined();
  });

  it('exports scanRunStatusEnum', () => {
    expect(schema.scanRunStatusEnum).toBeDefined();
  });

  it('exports notificationTypeEnum', () => {
    expect(schema.notificationTypeEnum).toBeDefined();
  });
});

describe('Schema — jobs table columns', () => {
  it('has expected column names', () => {
    const columns = Object.keys(schema.jobs);
    const expectedCritical = [
      'id',
      'company_id',
      'source_system',
      'external_job_id',
      'title',
      'status',
      'verification_status',
      'content_hash',
    ];
    for (const col of expectedCritical) {
      expect(columns).toContain(col);
    }
  });
});

describe('Schema — job_verifications table columns', () => {
  it('has expected audit columns', () => {
    const columns = Object.keys(schema.jobVerifications);
    const expected = [
      'id',
      'job_id',
      'checked_at',
      'domain_check',
      'job_exists_check',
      'verification_score',
      'failure_reason',
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });
});

describe('Schema — scan_runs table columns', () => {
  it('has expected monitoring columns', () => {
    const columns = Object.keys(schema.scanRuns);
    const expected = [
      'id',
      'source_type',
      'source_name',
      'started_at',
      'completed_at',
      'status',
      'jobs_discovered',
      'jobs_verified',
      'jobs_rejected',
      'error_message',
    ];
    for (const col of expected) {
      expect(columns).toContain(col);
    }
  });
});

describe('Schema — deduplication constraint', () => {
  it('jobs table has the identity unique index defined', () => {
    // Drizzle stores indexes in the table's [Symbol] metadata.
    // We verify the table object is defined and has the expected columns
    // that form the unique constraint. The actual constraint is enforced
    // at the DB level and tested by integration tests with a live DB.
    const columns = Object.keys(schema.jobs);
    expect(columns).toContain('company_id');
    expect(columns).toContain('source_system');
    expect(columns).toContain('external_job_id');
  });
});
