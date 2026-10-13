/**
 * Role Matcher Unit Tests.
 *
 * Tests exact matches, approved synonyms, approved specializations, strict
 * isolation against unrelated disciplines, and unknown role handling.
 */

import { describe, it, expect } from 'vitest';
import { matchRole } from '../matching/role-matcher.js';

describe('Deterministic Role Matcher', () => {
  // ── 1. Exact Canonical Matches ─────────────────────────────────────────────

  it('matches exact canonical role names', () => {
    const res1 = matchRole('Software Engineer', ['Software Engineer']);
    expect(res1.matched).toBe(true);
    expect(res1.matchType).toBe('EXACT');

    const res2 = matchRole('Data Analyst', ['Data Analyst']);
    expect(res2.matched).toBe(true);

    const res3 = matchRole('DevOps Engineer', ['DevOps Engineer']);
    expect(res3.matched).toBe(true);
  });

  // ── 2. Approved Synonyms ───────────────────────────────────────────────────

  it('matches approved synonyms for Software Engineer', () => {
    const userRoles = ['Software Engineer'];

    expect(matchRole('Software Development Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Software Developer', userRoles).matched).toBe(true);
    expect(matchRole('SDE', userRoles).matched).toBe(true);
    expect(matchRole('SDE-II', userRoles).matched).toBe(true);
    expect(matchRole('Member of Technical Staff', userRoles).matched).toBe(true);
  });

  it('matches approved synonyms for Frontend Developer', () => {
    const userRoles = ['Frontend Developer'];

    expect(matchRole('Frontend Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Front End Developer', userRoles).matched).toBe(true);
    expect(matchRole('UI Engineer', userRoles).matched).toBe(true);
    expect(matchRole('React Developer', userRoles).matched).toBe(true);
  });

  it('matches approved synonyms for Backend Developer', () => {
    const userRoles = ['Backend Developer'];

    expect(matchRole('Backend Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Server Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Node.js Developer', userRoles).matched).toBe(true);
    expect(matchRole('Java Backend Developer', userRoles).matched).toBe(true);
  });

  it('matches approved synonyms for DevOps Engineer', () => {
    const userRoles = ['DevOps Engineer'];

    expect(matchRole('Site Reliability Engineer', userRoles).matched).toBe(true);
    expect(matchRole('SRE', userRoles).matched).toBe(true);
    expect(matchRole('Platform Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Infrastructure Engineer', userRoles).matched).toBe(true);
  });

  it('matches approved synonyms for QA Engineer', () => {
    const userRoles = ['QA Engineer'];

    expect(matchRole('Quality Assurance Engineer', userRoles).matched).toBe(true);
    expect(matchRole('SDET', userRoles).matched).toBe(true);
    expect(matchRole('Automation Test Engineer', userRoles).matched).toBe(true);
  });

  // ── 3. Specializations ─────────────────────────────────────────────────────

  it('matches approved specializations of canonical roles', () => {
    const userRoles = ['Software Engineer'];

    expect(matchRole('Senior Software Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Staff Software Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Backend Software Engineer', userRoles).matched).toBe(true);
    expect(matchRole('Junior Software Engineer', userRoles).matched).toBe(true);
  });

  // ── 4. Strict Isolation Against Unrelated Roles ────────────────────────────

  it('strictly rejects unrelated engineering disciplines for Software Engineer', () => {
    const userRoles = ['Software Engineer'];

    expect(matchRole('Civil Engineer', userRoles).matched).toBe(false);
    expect(matchRole('Mechanical Engineer', userRoles).matched).toBe(false);
    expect(matchRole('Chemical Engineer', userRoles).matched).toBe(false);
    expect(matchRole('Petroleum Engineer', userRoles).matched).toBe(false);
  });

  it('strictly rejects unrelated roles for Data Analyst', () => {
    const userRoles = ['Data Analyst'];

    expect(matchRole('Civil Engineer', userRoles).matched).toBe(false);
    expect(matchRole('Mechanical Engineer', userRoles).matched).toBe(false);
    expect(matchRole('Sales Representative', userRoles).matched).toBe(false);
  });

  it('strictly rejects non-matching tech roles', () => {
    expect(matchRole('Product Manager', ['Data Analyst']).matched).toBe(false);
    expect(matchRole('UX Designer', ['Backend Developer']).matched).toBe(false);
  });

  // ── 5. Multiple User Roles ─────────────────────────────────────────────────

  it('matches if any of multiple user roles match', () => {
    const userRoles = ['Frontend Developer', 'Data Scientist'];

    expect(matchRole('React Developer', userRoles).matched).toBe(true);
    expect(matchRole('Applied Scientist', userRoles).matched).toBe(true);
    expect(matchRole('DevOps Engineer', userRoles).matched).toBe(false);
  });

  // ── 6. GET / Graduate Engineer Trainee Specializations ────────────────────

  it('matches hyphenated and non-hyphenated GET specializations to correct canonical roles', () => {
    // Mechanical
    expect(matchRole('Graduate Engineer Trainee - Mechanical', ['Mechanical Engineer']).matched).toBe(true);
    expect(matchRole('GET - Mechanical', ['Mechanical Engineer']).matched).toBe(true);
    
    // Electrical
    expect(matchRole('Graduate Engineer Trainee - Electrical', ['Electrical Engineer']).matched).toBe(true);
    expect(matchRole('GET - Electrical', ['Electrical Engineer']).matched).toBe(true);
    
    // Civil
    expect(matchRole('Graduate Engineer Trainee - Civil', ['Civil Engineer']).matched).toBe(true);
    expect(matchRole('GET - Civil', ['Civil Engineer']).matched).toBe(true);
    
    // Hardware & Electronics
    expect(matchRole('Graduate Engineer Trainee - Hardware', ['Hardware & Electronics Engineer']).matched).toBe(true);
    expect(matchRole('Graduate Engineer Trainee - Electronics', ['Hardware & Electronics Engineer']).matched).toBe(true);
    
    // Software
    expect(matchRole('Graduate Engineer Trainee - Software', ['Software Engineer']).matched).toBe(true);
    expect(matchRole('GET - Software', ['Software Engineer']).matched).toBe(true);
  });

  it('strictly rejects generic GET/Graduate Engineer Trainee from mapping to Software Engineer', () => {
    expect(matchRole('Graduate Engineer Trainee', ['Software Engineer']).matched).toBe(false);
    expect(matchRole('GET', ['Software Engineer']).matched).toBe(false);
  });
});
