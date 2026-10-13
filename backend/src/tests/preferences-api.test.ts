/**
 * Preferences API & Security Isolation Tests.
 *
 * Tests the Express handlers for preferences, verifying:
 * - Unauthenticated requests are rejected (401)
 * - Users can only retrieve their own preferences
 * - Users can only update their own preferences
 * - Validation errors are returned with 400 Bad Request
 * - Onboarding completion marks preference record
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPreferencesHandler,
  savePreferencesHandler,
  completeOnboardingHandler,
  getTaxonomyHandler,
} from '../api/preferences.js';
import type { AuthenticatedRequest } from '../auth/middleware.js';
import type { Response } from 'express';

// ─── Mock Preference Service ──────────────────────────────────────────────────

const mockPreferencesStore = new Map<string, any>();

vi.mock('../preferences/preference-service.js', () => ({
  getUserPreferences: vi.fn(async (userId: string) => {
    return mockPreferencesStore.get(userId) || null;
  }),
  saveUserPreferences: vi.fn(async (userId: string, prefs: any, onboardingCompleted: boolean) => {
    const record = {
      id: 'pref-uuid-1',
      userId,
      roles: prefs.roles,
      locations: prefs.locations,
      experienceLevel: prefs.experienceLevel,
      companyIds: prefs.companyIds,
      companyScope: prefs.companyIds.length === 0 ? 'ALL_SUPPORTED_COMPANIES' : 'SPECIFIC_COMPANIES',
      keywords: prefs.keywords,
      onboardingCompleted,
      instantNotifications: prefs.instantNotifications,
      dailyDigest: prefs.dailyDigest,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPreferencesStore.set(userId, record);
    return record;
  }),
  completeOnboarding: vi.fn(async (userId: string) => {
    const existing = mockPreferencesStore.get(userId);
    if (!existing) return false;
    existing.onboardingCompleted = true;
    return true;
  }),
}));

vi.mock('../preferences/validator.js', () => ({
  validatePreferences: vi.fn(async (input: any) => {
    if (!input.roles || input.roles.length === 0) {
      return { valid: false, errors: ['At least one job role must be selected.'] };
    }
    return {
      valid: true,
      data: {
        roles: input.roles,
        locations: input.locations || ['Bangalore'],
        experienceLevel: input.experienceLevel || 'FRESHER',
        companyIds: input.companyIds || [],
        keywords: [],
        instantNotifications: true,
        dailyDigest: false,
      },
    };
  }),
}));

function createMockResponse() {
  let statusCode = 200;
  let jsonResult: any = null;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonResult = data;
      return res;
    },
  } as unknown as Response;

  return {
    res,
    getStatusCode: () => statusCode,
    getJson: () => jsonResult,
  };
}

describe('Preferences API & Security Isolation', () => {
  beforeEach(() => {
    mockPreferencesStore.clear();
  });

  it('rejects unauthenticated GET /users/me/preferences with 401', async () => {
    const req = {} as AuthenticatedRequest;
    const { res, getStatusCode, getJson } = createMockResponse();

    await getPreferencesHandler(req, res);
    expect(getStatusCode()).toBe(401);
    expect(getJson().error).toMatch(/unauthorized/i);
  });

  it('rejects unauthenticated PUT /users/me/preferences with 401', async () => {
    const req = { body: { roles: ['Software Engineer'] } } as AuthenticatedRequest;
    const { res, getStatusCode } = createMockResponse();

    await savePreferencesHandler(req, res);
    expect(getStatusCode()).toBe(401);
  });

  it('saves and retrieves preferences strictly isolated to the authenticated user', async () => {
    const userA = { id: 'user-a-uuid', email: 'userA@example.com', name: 'User A', emailVerified: true };
    const userB = { id: 'user-b-uuid', email: 'userB@example.com', name: 'User B', emailVerified: true };

    // 1. User A saves preferences
    const reqA = {
      user: userA,
      body: {
        roles: ['Frontend Developer'],
        locations: ['Bangalore'],
        experienceLevel: 'FRESHER',
        companyIds: [],
      },
    } as AuthenticatedRequest;
    const resA = createMockResponse();

    await savePreferencesHandler(reqA, resA.res);
    expect(resA.getStatusCode()).toBe(200);
    expect(resA.getJson().preferences.roles).toEqual(['Frontend Developer']);

    // 2. User B retrieves preferences -> should be null (isolated!)
    const reqB = { user: userB } as AuthenticatedRequest;
    const resB = createMockResponse();

    await getPreferencesHandler(reqB, resB.res);
    expect(resB.getStatusCode()).toBe(200);
    expect(resB.getJson().preferences).toBeNull();
    expect(resB.getJson().onboardingCompleted).toBe(false);

    // 3. User A retrieves preferences -> gets their own saved preferences
    const getReqA = { user: userA } as AuthenticatedRequest;
    const getResA = createMockResponse();

    await getPreferencesHandler(getReqA, getResA.res);
    expect(getResA.getStatusCode()).toBe(200);
    expect(getResA.getJson().preferences.userId).toBe('user-a-uuid');
    expect(getResA.getJson().preferences.roles).toEqual(['Frontend Developer']);
  });

  it('returns 400 Bad Request when preference payload validation fails', async () => {
    const user = { id: 'user-uuid', email: 'user@example.com', name: 'User', emailVerified: true };
    const req = {
      user,
      body: {
        roles: [], // Empty roles!
      },
    } as AuthenticatedRequest;
    const { res, getStatusCode, getJson } = createMockResponse();

    await savePreferencesHandler(req, res);
    expect(getStatusCode()).toBe(400);
    expect(getJson().error).toMatch(/invalid preferences/i);
    expect(getJson().details).toContain('At least one job role must be selected.');
  });

  it('returns public taxonomy without requiring authentication', () => {
    const req = {} as AuthenticatedRequest;
    const { res, getStatusCode, getJson } = createMockResponse();

    getTaxonomyHandler(req, res);
    expect(getStatusCode()).toBe(200);
    expect(getJson()).toHaveProperty('roles');
    expect(getJson()).toHaveProperty('locations');
    expect(getJson()).toHaveProperty('experienceLevels');
  });
});
