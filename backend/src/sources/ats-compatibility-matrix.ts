/**
 * RoleRadar ATS Compatibility & Production Gate Matrix.
 *
 * Tracks the qualification and operational status of ATS platforms against
 * RoleRadar's strict 10-point Production Acceptance Gate:
 * 1. Public Discovery without private employer credentials
 * 2. Stable, unique job identifier
 * 3. Exact official ATS URL
 * 4. Individual live job verification capability
 * 5. Deterministic closed/expired job detection (404/removed)
 * 6. Structured schema extraction (Title, Location, Workplace, Description)
 * 7. Complete pagination without silent loss
 * 8. Safe rate limit profile & non-aggressive request behavior
 * 9. Per-company failure isolation
 * 10. Long-term operational reliability
 */

export type AtsProductionStatus = 'PRODUCTION' | 'CANDIDATE' | 'DEFERRED';

export interface AtsEvaluationRecord {
  atsName: string;
  publicDiscovery: boolean;
  stableJobId: boolean;
  officialUrl: boolean;
  individualVerification: boolean;
  closedJobDetection: boolean;
  structuredData: boolean;
  pagination: boolean;
  rateLimitsSafe: boolean;
  failureIsolation: boolean;
  status: AtsProductionStatus;
  notes: string;
  publicApiPattern?: string;
  sampleCompanies: string[];
}

export const ATS_COMPATIBILITY_MATRIX: Record<string, AtsEvaluationRecord> = {
  Greenhouse: {
    atsName: 'Greenhouse',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Primary enterprise standard. Supports board token API with JSON endpoints and individual job verification.',
    publicApiPattern: 'https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs',
    sampleCompanies: ['GitLab', 'Figma', 'Datadog', 'Notion', 'Scale AI', 'Stripe'],
  },
  Lever: {
    atsName: 'Lever',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Primary tech startup standard. Supports public JSON postings feed and individual job verification.',
    publicApiPattern: 'https://api.lever.co/v0/postings/{site_token}?mode=json',
    sampleCompanies: ['Palantir', 'Spotify', 'Affirm', 'Atlassian', 'Paytm', 'Mindtickle'],
  },
  Ashby: {
    atsName: 'Ashby',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Modern high-growth standard. Public postings API with rich compensation and workplace metadata.',
    publicApiPattern: 'https://api.ashbyhq.com/posting-api/job-board/{job_board_name}',
    sampleCompanies: ['Linear', 'Ramp', 'Vercel', 'OpenAI', 'DevRev', 'Sprinto'],
  },
  SmartRecruiters: {
    atsName: 'SmartRecruiters',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Public posting API supported with per-job live fetch and stable IDs.',
    publicApiPattern: 'https://api.smartrecruiters.com/v1/companies/{company_id}/postings',
    sampleCompanies: ['CERN', 'Visa', 'Ubisoft'],
  },
  Workday: {
    atsName: 'Workday',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Enterprise Workday MyWorkdayJobs public REST API endpoints with pagination and schema normalization.',
    publicApiPattern: 'https://{host}/wday/cxs/{tenant}/{site}/jobs',
    sampleCompanies: ['Autodesk', 'Adobe', 'Salesforce', 'NVIDIA'],
  },
  Workable: {
    atsName: 'Workable',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Public widget/embed API supported for Workable customer career pages.',
    publicApiPattern: 'https://apply.workable.com/api/v3/accounts/{subdomain}/jobs',
    sampleCompanies: ['BeReal', 'Typeform'],
  },
  Recruitee: {
    atsName: 'Recruitee',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Public careers REST API at https://{subdomain}.recruitee.com/api/offers/ with JSON schema and official career URLs.',
    publicApiPattern: 'https://{subdomain}.recruitee.com/api/offers/',
    sampleCompanies: ['Bunq', 'Transloadit'],
  },
  Personio: {
    atsName: 'Personio',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: true,
    closedJobDetection: true,
    structuredData: true,
    pagination: true,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'PRODUCTION',
    notes: 'Public XML/REST feed available at https://{subdomain}.jobs.personio.de/xml with structured job postings and career links.',
    publicApiPattern: 'https://{subdomain}.jobs.personio.de/xml',
    sampleCompanies: ['Personio', 'Finanzcheck'],
  },
  BambooHR: {
    atsName: 'BambooHR',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: false,
    closedJobDetection: false,
    structuredData: false,
    pagination: false,
    rateLimitsSafe: true,
    failureIsolation: true,
    status: 'DEFERRED',
    notes: 'DEFERRED: BambooHR public list endpoint omits full description & requirements data and lacks reliable individual live verification endpoints without private API tokens.',
    publicApiPattern: 'https://{subdomain}.bamboohr.com/jobs/embed2.php',
    sampleCompanies: [],
  },
  Teamtailor: {
    atsName: 'Teamtailor',
    publicDiscovery: false,
    stableJobId: false,
    officialUrl: false,
    individualVerification: false,
    closedJobDetection: false,
    structuredData: false,
    pagination: false,
    rateLimitsSafe: false,
    failureIsolation: true,
    status: 'DEFERRED',
    notes: 'DEFERRED: Teamtailor requires employer API keys (Authorization header) even for standard job queries; no public unauthenticated JSON feed is available.',
    publicApiPattern: 'https://api.teamtailor.com/v1/jobs',
    sampleCompanies: [],
  },
  BreezyHR: {
    atsName: 'Breezy HR',
    publicDiscovery: true,
    stableJobId: true,
    officialUrl: true,
    individualVerification: false,
    closedJobDetection: false,
    structuredData: false,
    pagination: false,
    rateLimitsSafe: false,
    failureIsolation: true,
    status: 'DEFERRED',
    notes: 'DEFERRED: Breezy HR public career widget uses embedded client JavaScript bundles without stable public REST contract; individual job verification is fragile.',
    publicApiPattern: 'https://{subdomain}.breezy.hr/json',
    sampleCompanies: [],
  },
};
