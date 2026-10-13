import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import {
  getUserPreferences,
  saveUserPreferences,
  migrationPreview,
} from '../preferences/preference-service.js';
import { validatePreferences } from '../preferences/validator.js';
import { eq } from 'drizzle-orm';
import { CANONICAL_TAXONOMY } from '../matching/canonical-taxonomy.js';

// Mock DB and Drizzle
vi.mock('../database/connection.js', () => {
  const insertMock = vi.fn();
  const selectMock = vi.fn();
  const updateMock = vi.fn();
  const whereMock = vi.fn();
  const returningMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn();
  const fromMock = vi.fn();
  const limitMock = vi.fn();
  
  // Chain building
  const dbMock = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: returningMock
        }))
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: limitMock
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: returningMock
        }))
      }))
    })),
  };

  return { getDb: () => dbMock, __mocks__: { returningMock, limitMock } };
});

describe('Phase 4: Canonical Preference Integration', () => {
  const MOCK_USER_ID = '12345678-1234-1234-1234-1234567890ab';
  let limitMock: any;
  let returningMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { __mocks__ } = await import('../database/connection.js');
    limitMock = __mocks__.limitMock;
    returningMock = __mocks__.returningMock;
  });

  describe('Validation & DTO', () => {
    it('accepts valid canonical role IDs', async () => {
      const validId = CANONICAL_TAXONOMY[0].id; // e.g. ROLE_SOFTWARE_ENGINEER
      const res = await validatePreferences({
        roles: ['Software Engineer'],
        canonicalRoles: [validId],
        locations: ['Remote'],
      });
      expect(res.valid).toBe(true);
      expect(res.data?.canonicalRoles).toEqual([validId]);
    });

    it('rejects invalid canonical role IDs', async () => {
      const res = await validatePreferences({
        roles: ['Software Engineer'],
        canonicalRoles: ['FAKE_ROLE_ID'],
        locations: ['Remote'],
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContainEqual(expect.stringContaining('Invalid canonical role IDs: FAKE_ROLE_ID'));
    });

    it('legacy request without canonicalRoles remains valid', async () => {
      const res = await validatePreferences({
        roles: ['Software Engineer'],
        locations: ['Remote'],
      });
      expect(res.valid).toBe(true);
      expect(res.data?.canonicalRoles).toEqual([]);
    });
  });

  describe('Preference Service Read/Write', () => {
    it('getUserPreferences maps DB columns correctly', async () => {
      limitMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Software Engineer'],
        canonical_roles: ['ROLE_SOFTWARE_ENGINEER'],
        locations: ['Remote'],
        experience_level: 'FRESHER',
      }]);

      const prefs = await getUserPreferences(MOCK_USER_ID);
      expect(prefs?.roles).toEqual(['Software Engineer']);
      expect(prefs?.canonicalRoles).toEqual(['ROLE_SOFTWARE_ENGINEER']);
      expect(prefs?.experienceLevel).toBe('FRESHER');
    });

    it('saveUserPreferences preserves roles and canonicalRoles independently', async () => {
      returningMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Java Developer'], // legacy role intact
        canonical_roles: ['ROLE_SOFTWARE_ENGINEER'],
        locations: ['Remote'],
        experience_level: 'EXPERIENCED',
      }]);

      const valid = await validatePreferences({
        roles: ['Java Developer'],
        canonicalRoles: ['ROLE_SOFTWARE_ENGINEER'],
        locations: ['Remote'],
        experienceLevel: 'EXPERIENCED'
      });

      const prefs = await saveUserPreferences(MOCK_USER_ID, valid.data!);
      expect(prefs.roles).toEqual(['Java Developer']);
      expect(prefs.canonicalRoles).toEqual(['ROLE_SOFTWARE_ENGINEER']);
    });
  });

  describe('Migration Preview', () => {
    it('preview Software Engineer -> EXACT without writing DB', async () => {
      limitMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Software Engineer'],
        canonical_roles: [],
      }]);

      const preview = await migrationPreview(MOCK_USER_ID);
      expect(preview.roles).toHaveLength(1);
      expect(preview.roles[0].legacyValue).toBe('Software Engineer');
      expect(preview.roles[0].classification).toBe('EXACT');
      expect(preview.roles[0].canonicalRoleId).toBe('ROLE_SOFTWARE_ENGINEER');
    });

    it('preview Software Developer -> ALIAS without writing DB', async () => {
      limitMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Software Developer'],
        canonical_roles: [],
      }]);

      const preview = await migrationPreview(MOCK_USER_ID);
      expect(preview.roles).toHaveLength(1);
      expect(preview.roles[0].classification).toBe('ALIAS');
      expect(preview.roles[0].canonicalRoleId).toBe('ROLE_SOFTWARE_ENGINEER');
    });

    it('preview custom values remain unmapped and safe', async () => {
      limitMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Senior Software Engineer', 'Director of Engineering'],
        canonical_roles: [],
      }]);

      const preview = await migrationPreview(MOCK_USER_ID);
      expect(preview.roles).toHaveLength(2);
      expect(preview.roles[0].classification).toBe('UNMAPPED');
      expect(preview.roles[1].classification).toBe('UNMAPPED');
    });
    
    it('preview ambiguous values', async () => {
      limitMock.mockResolvedValueOnce([{
        id: 'mock-id',
        user_id: MOCK_USER_ID,
        roles: ['Manager'],
        canonical_roles: [],
      }]);

      const preview = await migrationPreview(MOCK_USER_ID);
      expect(preview.roles).toHaveLength(1);
      expect(preview.roles[0].classification).toBe('AMBIGUOUS');
    });
  });
});
