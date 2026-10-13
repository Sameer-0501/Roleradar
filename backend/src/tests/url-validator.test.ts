/**
 * URL Validator Tests
 *
 * Tests all validation rules:
 *   1. URL must be syntactically valid
 *   2. URL must use HTTPS
 *   3. URL hostname must match official domain (exact or subdomain)
 *   4. URL path must identify an individual job (not a root homepage)
 */

import { describe, it, expect } from 'vitest';
import { validateJobUrl } from '../collectors/url-validator.js';

const OFFICIAL_DOMAIN = 'job-boards.greenhouse.io';

describe('validateJobUrl', () => {
  // ── Valid URLs ──────────────────────────────────────────────────────────
  it('accepts a valid HTTPS URL on the official domain', () => {
    const result = validateJobUrl(
      'https://job-boards.greenhouse.io/gitlab/jobs/8556658002',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with a long numeric job ID', () => {
    const result = validateJobUrl(
      'https://job-boards.greenhouse.io/company/jobs/123456789',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a subdomain of the official domain', () => {
    const result = validateJobUrl(
      'https://api.job-boards.greenhouse.io/gitlab/jobs/8556658002',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(true);
  });

  // ── Invalid: protocol ───────────────────────────────────────────────────
  it('rejects HTTP (not HTTPS)', () => {
    const result = validateJobUrl(
      'http://job-boards.greenhouse.io/gitlab/jobs/8556658002',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/HTTPS/i);
  });

  // ── Invalid: domain ─────────────────────────────────────────────────────
  it('rejects a URL on an unrelated domain', () => {
    const result = validateJobUrl(
      'https://scam-site.com/gitlab/jobs/8556658002',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/domain/i);
  });

  it('rejects a domain that contains the official domain but is not it', () => {
    const result = validateJobUrl(
      'https://evil-job-boards.greenhouse.io.evil.com/jobs/123',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(false);
  });

  // ── Invalid: URL syntax ─────────────────────────────────────────────────
  it('rejects a malformed URL', () => {
    const result = validateJobUrl('not-a-url', OFFICIAL_DOMAIN);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not syntactically valid/i);
  });

  it('rejects an empty string', () => {
    const result = validateJobUrl('', OFFICIAL_DOMAIN);
    expect(result.valid).toBe(false);
  });

  // ── Invalid: root/homepage URLs ─────────────────────────────────────────
  it('rejects the root careers homepage (no path)', () => {
    const result = validateJobUrl(
      'https://job-boards.greenhouse.io/',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/root|homepage/i);
  });

  it('rejects a single-segment path without a job ID', () => {
    const result = validateJobUrl(
      'https://job-boards.greenhouse.io/gitlab',
      OFFICIAL_DOMAIN
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/individual job/i);
  });

  // ── Lever domain examples ───────────────────────────────────────────────
  it('accepts a valid Lever job posting URL with UUID', () => {
    const result = validateJobUrl(
      'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c',
      'jobs.lever.co'
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a generic Lever root company page without job UUID', () => {
    const result = validateJobUrl('https://jobs.lever.co/palantir', 'jobs.lever.co');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/individual job/i);
  });

  // ── Workday domain examples ──────────────────────────────────────────────
  it('accepts a valid Autodesk Workday job posting URL', () => {
    const result = validateJobUrl(
      'https://autodesk.wd1.myworkdayjobs.com/Ext/job/Tel-Aviv-ISR/Principal-Experience-Designer_26WD100698',
      'autodesk.wd1.myworkdayjobs.com'
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a generic Workday careers page without individual job', () => {
    const result = validateJobUrl(
      'https://autodesk.wd1.myworkdayjobs.com/Ext',
      'autodesk.wd1.myworkdayjobs.com'
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/individual job/i);
  });

  it('rejects a generic Workday search/jobs page without job requisition ID', () => {
    const result = validateJobUrl(
      'https://autodesk.wd1.myworkdayjobs.com/Ext/jobs',
      'autodesk.wd1.myworkdayjobs.com'
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/individual job/i);
  });

  // ── Custom / SmartRecruiters domain examples ──────────────────────────────
  it('accepts a valid CERN SmartRecruiters job posting URL', () => {
    const result = validateJobUrl(
      'https://jobs.smartrecruiters.com/cern/744000145967675',
      'jobs.smartrecruiters.com'
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a generic CERN SmartRecruiters company root page', () => {
    const result = validateJobUrl(
      'https://jobs.smartrecruiters.com/cern',
      'jobs.smartrecruiters.com'
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/individual job/i);
  });
});
