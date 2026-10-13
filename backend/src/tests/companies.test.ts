/**
 * Companies API Unit Tests.
 *
 * Tests the public read-only companies list handler with mocked database responses.
 */

import { describe, it, expect, vi } from 'vitest';
import { listCompaniesHandler } from '../api/companies.js';
import type { Request, Response } from 'express';

const MOCK_COMPANIES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'GitLab',
    atsType: 'GREENHOUSE',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://about.gitlab.com/jobs',
    isActive: true,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Palantir',
    atsType: 'LEVER',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.palantir.com/careers',
    isActive: true,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Autodesk',
    atsType: 'WORKDAY',
    officialDomain: 'autodesk.wd1.myworkdayjobs.com',
    careersUrl: 'https://www.autodesk.com/careers',
    isActive: true,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'CERN',
    atsType: 'CUSTOM',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.cern/',
    isActive: true,
  },
];

vi.mock('../database/connection.js', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => MOCK_COMPANIES,
        }),
      }),
    }),
  }),
}));

describe('Companies API Handler', () => {
  it('returns active companies without exposing internal source_config or secrets', async () => {
    let statusCode = 200;
    let jsonResult: unknown = null;

    const req = {} as Request;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: unknown) => {
        jsonResult = data;
        return res;
      },
    } as unknown as Response;

    await listCompaniesHandler(req, res);

    expect(statusCode).toBe(200);
    expect(jsonResult).not.toBeNull();
    const resultObj = jsonResult as { companies: Array<Record<string, unknown>> };
    expect(Array.isArray(resultObj.companies)).toBe(true);
    expect(resultObj.companies).toHaveLength(4);

    const first = resultObj.companies[0]!;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name', 'GitLab');
    expect(first).toHaveProperty('atsType', 'GREENHOUSE');
    expect(first).toHaveProperty('officialDomain', 'job-boards.greenhouse.io');
    expect(first).toHaveProperty('careersUrl', 'https://about.gitlab.com/jobs');
    expect(first).toHaveProperty('isActive', true);

    // Crucial: Must NEVER expose internal source_config or credentials
    expect(first).not.toHaveProperty('source_config');
    expect(first).not.toHaveProperty('sourceConfig');
  });
});
