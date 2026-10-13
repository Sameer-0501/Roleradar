/**
 * Experience Matcher Unit Tests.
 *
 * Tests experience parsing (years extraction, entry-level indicators, senior indicators)
 * and conservative matching rules (FRESHER vs EXPERIENCED vs UNKNOWN).
 */

import { describe, it, expect } from 'vitest';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';

describe('Experience Parser & Matcher', () => {
  // -- 1. Parsing Tests ---------------------------------------------------------

  it('parses Senior keywords in title as EXPERIENCED with high confidence', () => {
    const titles = [
      'Senior Software Engineer',
      'Staff DevOps Engineer',
      'Lead QA Specialist',
      'SDE III - Data Engineering',
      'Computer Scientist 3',
      'Head, Engineering',
      'Engineering Head',
      'Engineering Leader',
      'Engineering Lead',
      'Staff Engineer',
      'Principal Engineer',
      'Director of Engineering',
      'VP Engineering',
      'Engineering Manager',
    ];

    for (const title of titles) {
      const p = parseExperienceRequirements(title);
      expect(p.classification).toBe('EXPERIENCED');
    }
  });

  it('maintains EXPERIENCED classification even if description contains fresher keywords', () => {
    const p1 = parseExperienceRequirements('Head, Engineering', '0 to 1 years of experience');
    expect(p1.classification).toBe('EXPERIENCED');

    const p2 = parseExperienceRequirements('Engineering Leader', 'no experience required');
    expect(p2.classification).toBe('EXPERIENCED');

    const p3 = parseExperienceRequirements('VP Engineering', 'early career talent program');
    expect(p3.classification).toBe('EXPERIENCED');

    const p4 = parseExperienceRequirements('Senior Software Engineer', '0–1 years');
    expect(p4.classification).toBe('EXPERIENCED');

    const p5 = parseExperienceRequirements('Head, Engineering', 'no experience necessary');
    expect(p5.classification).toBe('EXPERIENCED');

    const p6 = parseExperienceRequirements('Engineering Leader', 'recent graduates');
    expect(p6.classification).toBe('EXPERIENCED');

    const p7 = parseExperienceRequirements('Engineering Manager', '0–2 years');
    expect(p7.classification).toBe('EXPERIENCED');
  });

  it('parses genuine fresher titles with fresher descriptions as FRESHER_COMPATIBLE', () => {
    const p = parseExperienceRequirements('Junior Developer', '0 to 1 years of experience');
    expect(p.classification).toBe('FRESHER_COMPATIBLE');
  });

  it('parses Entry-level and Graduate titles as FRESHER_COMPATIBLE', () => {
    const p1 = parseExperienceRequirements('Junior Frontend Developer');
    expect(p1.classification).toBe('FRESHER_COMPATIBLE');

    const p2 = parseExperienceRequirements('Graduate Software Engineer');
    expect(p2.classification).toBe('FRESHER_COMPATIBLE');

    const p3 = parseExperienceRequirements('Software Engineering Intern');
    expect(p3.classification).toBe('FRESHER_COMPATIBLE');

    const p4 = parseExperienceRequirements('SDE 1');
    expect(p4.classification).toBe('FRESHER_COMPATIBLE');

    const p5 = parseExperienceRequirements('SDE I - Backend');
    expect(p5.classification).toBe('FRESHER_COMPATIBLE');

    const p6 = parseExperienceRequirements('Software Engineer 1');
    expect(p6.classification).toBe('FRESHER_COMPATIBLE');

    const p7 = parseExperienceRequirements('Graduate Engineer Trainee');
    expect(p7.classification).toBe('FRESHER_COMPATIBLE');

    const p8 = parseExperienceRequirements('Associate Software Engineer');
    expect(p8.classification).toBe('FRESHER_COMPATIBLE');

    const p9 = parseExperienceRequirements('Computer Scientist 1 (C++)');
    expect(p9.classification).toBe('FRESHER_COMPATIBLE');

    const p10 = parseExperienceRequirements('Member of Technical Staff 1');
    expect(p10.classification).toBe('FRESHER_COMPATIBLE');
  });

  it('parses 0-1 years and no experience phrases as FRESHER_COMPATIBLE', () => {
    const p1 = parseExperienceRequirements('Software Engineer', 'No experience required for this role.');
    expect(p1.classification).toBe('FRESHER_COMPATIBLE');

    const p2 = parseExperienceRequirements('Junior Developer', 'Requires 0 to 1 years of experience.');
    expect(p2.classification).toBe('FRESHER_COMPATIBLE');

    const p3 = parseExperienceRequirements('Trainee', 'Freshers welcome to apply.');
    expect(p3.classification).toBe('FRESHER_COMPATIBLE');

    const cases = [
      '0-1 years', '0–1 years', '0—1 years', '0 - 1 years', '0 – 1 years', '0 — 1 years', '0 to 1 years',
      '0-1 year', '0–1 year', '0-1 yr', '0–1 yr', '0-1 yrs', '0–1 yrs',
      'no experience required', 'no experience necessary', 'no prior experience', 'freshers welcome', 
      'recent graduate', 'recent graduates', 'new graduate'
    ];
    for (const c of cases) {
      const p = parseExperienceRequirements('Software Engineer', c);
      expect(p.classification).toBe('FRESHER_COMPATIBLE');
    }
  });

  it('parses 0-2 and 1-3 years as BOTH (compatible with fresher and experienced)', () => {
    const p1 = parseExperienceRequirements('Software Engineer', 'Requires 0-2 years of experience.');
    expect(p1.classification).toBe('BOTH');

    const p2 = parseExperienceRequirements('Backend Developer', '1 to 3 years experience with Node.js.');
    expect(p2.classification).toBe('BOTH');

    const cases = [
      '0-2 years', '0–2 years', '0—2 years', '0 to 2 years'
    ];
    for (const c of cases) {
      const p = parseExperienceRequirements('Software Engineer', c);
      expect(p.classification).toBe('BOTH');
    }

    // 0-3 years should remain UNKNOWN
    const p3 = parseExperienceRequirements('Software Engineer', '0-3 years');
    expect(p3.classification).toBe('UNKNOWN');
    const p4 = parseExperienceRequirements('Software Engineer', '0–3 years');
    expect(p4.classification).toBe('UNKNOWN');
  });

  it('parses 3+ and 5+ years requirements as EXPERIENCED', () => {
    const p1 = parseExperienceRequirements('Software Engineer', 'Must have 3+ years of experience.');
    expect(p1.classification).toBe('EXPERIENCED');
    expect(p1.minYears).toBe(3);

    const p2 = parseExperienceRequirements('Full Stack Developer', 'Requires minimum 5 years of React experience.');
    expect(p2.classification).toBe('EXPERIENCED');
    expect(p2.minYears).toBe(5);
  });

  it('classifies unknown experience as UNKNOWN (never assumes fresher)', () => {
    const p = parseExperienceRequirements('Software Engineer', 'Looking for motivated developers with strong skills.');
    expect(p.classification).toBe('UNKNOWN');
  });

  // -- 2. Matching Tests --------------------------------------------------------

  it('FRESHER preference matches FRESHER_COMPATIBLE and BOTH', () => {
    const fresherParsed = parseExperienceRequirements('Junior Developer');
    const bothParsed = parseExperienceRequirements('Developer', '0-2 years experience');

    expect(matchExperience(fresherParsed, 'FRESHER').matched).toBe(true);
    expect(matchExperience(bothParsed, 'FRESHER').matched).toBe(true);
  });

  it('FRESHER preference rejects EXPERIENCED and UNKNOWN', () => {
    const expParsed = parseExperienceRequirements('Senior Developer');
    const unknownParsed = parseExperienceRequirements('Software Engineer');

    expect(matchExperience(expParsed, 'FRESHER').matched).toBe(false);
    expect(matchExperience(unknownParsed, 'FRESHER').matched).toBe(false);
  });

  it('EXPERIENCED preference matches EXPERIENCED, BOTH, and UNKNOWN, rejects FRESHER_COMPATIBLE', () => {
    const expParsed = parseExperienceRequirements('Senior Developer');
    const bothParsed = parseExperienceRequirements('Developer', '1-3 years experience');
    const fresherParsed = parseExperienceRequirements('Junior Developer');
    const unknownParsed = parseExperienceRequirements('Software Engineer');

    expect(matchExperience(expParsed, 'EXPERIENCED').matched).toBe(true);
    expect(matchExperience(bothParsed, 'EXPERIENCED').matched).toBe(true);
    expect(matchExperience(fresherParsed, 'EXPERIENCED').matched).toBe(false);
    expect(matchExperience(unknownParsed, 'EXPERIENCED').matched).toBe(true);
  });

  it('ANY preference matches all classifications', () => {
    const classifications = ['FRESHER_COMPATIBLE', 'EXPERIENCED', 'BOTH', 'UNKNOWN'] as const;

    for (const c of classifications) {
      const parsed = { classification: c, confidence: 'HIGH' as const, reason: 'test' };
      expect(matchExperience(parsed, 'ANY').matched).toBe(true);
    }
  });
});
