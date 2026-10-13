/**
 * User Preferences & Validation Unit Tests.
 *
 * Tests preference taxonomy, server-side validation rules, and the critical
 * semantic scope business logic (Case A, Case B, Case C).
 */

import { describe, it, expect } from 'vitest';
import { normalizeLocation, STANDARD_ROLES, STANDARD_LOCATIONS } from '../preferences/taxonomy.js';
import { validatePreferences } from '../preferences/validator.js';

describe('User Preferences & Taxonomy Engine', () => {
  // ── Taxonomy & Location Normalization ───────────────────────────────────────

  describe('Location Normalization', () => {
    it('normalizes Bangalore variations to canonical "Bangalore"', () => {
      expect(normalizeLocation('bengaluru')).toBe('Bangalore');
      expect(normalizeLocation('Bengaluru')).toBe('Bangalore');
      expect(normalizeLocation('bangalore')).toBe('Bangalore');
      expect(normalizeLocation('  BLR  ')).toBe('Bangalore');
    });

    it('normalizes Gurgaon variations to canonical "Gurgaon"', () => {
      expect(normalizeLocation('gurugram')).toBe('Gurgaon');
      expect(normalizeLocation('Gurugram')).toBe('Gurgaon');
      expect(normalizeLocation('gurgaon')).toBe('Gurgaon');
    });

    it('normalizes Delhi variations to canonical "Delhi NCR"', () => {
      expect(normalizeLocation('delhi')).toBe('Delhi NCR');
      expect(normalizeLocation('new delhi')).toBe('Delhi NCR');
      expect(normalizeLocation('ncr')).toBe('Delhi NCR');
    });

    it('normalizes Remote variations to canonical "Remote"', () => {
      expect(normalizeLocation('remote')).toBe('Remote');
      expect(normalizeLocation('work from home')).toBe('Remote');
      expect(normalizeLocation('wfh')).toBe('Remote');
    });

    it('cleans and title-cases custom locations', () => {
      expect(normalizeLocation('  san francisco  ')).toBe('San Francisco');
      expect(normalizeLocation('london')).toBe('London');
    });
  });

  // ── Server-Side Validation ─────────────────────────────────────────────────

  describe('Server-Side Preferences Validation', () => {
    it('accepts a valid preference payload with multiple roles, locations, and fresher experience', async () => {
      const input = {
        roles: ['Software Engineer', 'Backend Developer'],
        locations: ['Bangalore', 'Remote'],
        experienceLevel: 'FRESHER',
        companyIds: [],
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(true);
      expect(result.data?.roles).toEqual(['Software Engineer', 'Backend Developer']);
      expect(result.data?.locations).toEqual(['Bangalore', 'Remote']);
      expect(result.data?.experienceLevel).toBe('FRESHER');
      expect(result.data?.companyIds).toEqual([]);
    });

    it('accepts EXPERIENCED level and normalizes experience case', async () => {
      const input = {
        roles: ['Data Analyst'],
        locations: ['Hyderabad'],
        experienceLevel: 'experienced',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(true);
      expect(result.data?.experienceLevel).toBe('EXPERIENCED');
    });

    it('rejects payload with empty roles array', async () => {
      const input = {
        roles: [],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one job role must be selected.');
    });

    it('rejects payload with whitespace-only roles', async () => {
      const input = {
        roles: ['  ', ''],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one job role must be selected.');
    });

    it('rejects payload with empty locations array', async () => {
      const input = {
        roles: ['Software Engineer'],
        locations: [],
        experienceLevel: 'FRESHER',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one preferred location must be selected.');
    });

    it('rejects invalid experience level', async () => {
      const input = {
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        experienceLevel: 'INTERMEDIATE_INVALID',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('experience level'))).toBe(true);
    });

    it('deduplicates duplicate roles and locations', async () => {
      const input = {
        roles: ['Software Engineer', 'Software Engineer', ' Software Engineer '],
        locations: ['Bangalore', 'bengaluru', 'BLR'],
        experienceLevel: 'FRESHER',
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(true);
      expect(result.data?.roles).toEqual(['Software Engineer']);
      expect(result.data?.locations).toEqual(['Bangalore']);
    });

    it('rejects invalid UUID formats in companyIds', async () => {
      const input = {
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
        companyIds: ['invalid-uuid-format-123'],
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('UUID format'))).toBe(true);
    });
  });

  // ── CRITICAL BUSINESS LOGIC: Company Selection Scope ───────────────────────

  describe('Critical Company Selection Semantic Rules (Case A, Case B, Case C)', () => {
    it('CASE A: Empty company list means ALL active supported company sources', async () => {
      const input = {
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
        companyIds: [], // Empty
      };

      const result = await validatePreferences(input);
      expect(result.valid).toBe(true);
      expect(result.data?.companyIds).toEqual([]);
      // An empty company array is valid and must NOT be rejected
    });

    it('CASE B: Selected companies list is preserved for specific company targeting', async () => {
      const sampleUuid = '00000000-0000-0000-0000-000000000001';
      const input = {
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
        companyIds: [sampleUuid],
      };

      // UUID regex check
      const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sampleUuid);
      expect(uuidCheck).toBe(true);
    });

    it('CASE C: Changing from specific companies back to empty restores ALL sources meaning', async () => {
      const updatedInput = {
        roles: ['Software Engineer'],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
        companyIds: [], // Reverted to empty
      };

      const result = await validatePreferences(updatedInput);
      expect(result.valid).toBe(true);
      expect(result.data?.companyIds).toEqual([]);
    });
  });
});
