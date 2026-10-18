import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderWindowedDigestEmail, WindowedDigestJob } from '../notifications/email/templates/windowed-digest.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { windowedDigestWorker } from '../notifications/digest-worker.js';
import { ConsoleEmailProvider } from '../notifications/email/providers/console-provider.js';
import { setEmailProviderForTesting } from '../notifications/email/provider-factory.js';

function generateMockJobs(count: number): WindowedDigestJob[] {
  return Array.from({ length: count }, (_, i) => ({
    companyName: `Company ${i + 1}`,
    title: `Software Engineer ${i + 1}`,
    location: i % 2 === 0 ? 'Bangalore, India' : 'Hyderabad, India',
    workplaceType: i % 3 === 0 ? 'Remote' : i % 3 === 1 ? 'Hybrid' : 'On-site',
    experience: i % 2 === 0 ? '3+ yrs exp' : 'Fresher / Entry Level',
    externalJobId: `ext-${i + 1}`,
    officialUrl: `https://company${i + 1}.com/careers/job-${i + 1}`,
    sourceSystem: 'GREENHOUSE',
    matchSummary: `${i % 2 === 0 ? 'Bangalore, India' : 'Hyderabad, India'} \u00b7 Verified Genuine`,
  }));
}

describe('Windowed Digest Rendering & Count Verification', () => {
  const testCounts = [0, 1, 2, 7, 26];

  for (const count of testCounts) {
    it(`renders exactly ${count} job(s) with matching header count without arbitrary truncation`, () => {
      const mockJobs = generateMockJobs(count);
      const email = renderWindowedDigestEmail({
        recipientName: 'Sameer A',
        digestDateStr: 'Sep 18, 2026',
        windowStr: '21:30',
        jobs: mockJobs,
        additionalMatchesCount: 0,
      });

      // Count job cards rendered in HTML
      // Each job has an "Apply on Official Site" CTA button
      const ctaMatches = email.html.match(/Apply on Official Site &rarr;/g) || [];
      expect(ctaMatches.length).toBe(count);

      // Verify header count equals rendered job count
      if (count === 1) {
        expect(email.html).toContain('1 new job matches your preferences');
        expect(email.subject).toContain('RoleRadar — New Job Matches');
        expect(email.text).toContain('1 new job matches your preferences');
      } else {
        expect(email.html).toContain(`${count} new jobs match your preferences`);
        expect(email.text).toContain(`${count} new jobs match your preferences`);
      }

      // Verify each job URL and company is present in HTML and plaintext
      for (const job of mockJobs) {
        expect(email.html).toContain(job.officialUrl);
        expect(email.html).toContain(job.companyName);
        expect(email.html).toContain(job.title);
        expect(email.text).toContain(job.officialUrl);
      }

      // Integrity checks: No fictional data, aggregator links, or third-party branding
      expect(email.html).not.toContain('CareerPulse');
      expect(email.html).not.toContain('💼 Full-time'); // Must not use hardcoded fictional employment type
      expect(email.html).not.toContain('linkedin.com');
      expect(email.html).not.toContain('indeed.com');
      expect(email.html).not.toContain('naukri.com');
      expect(email.text).not.toContain('CareerPulse');
    });
  }

  it('renders real workplace and experience badges when provided', () => {
    const jobWithMeta: WindowedDigestJob = {
      companyName: 'Deliveroo',
      title: 'Staff Software Engineer',
      location: 'Hyderabad, India',
      workplaceType: 'Hybrid',
      experience: '4+ yrs exp',
      externalJobId: 'ext-staff-1',
      officialUrl: 'https://careers.deliveroo.com/jobs/staff-1',
      sourceSystem: 'Direct',
      matchSummary: 'Hyderabad, India \u00b7 Verified Genuine',
    };

    const email = renderWindowedDigestEmail({
      recipientName: 'Sameer A',
      digestDateStr: 'Sep 18, 2026',
      windowStr: '21:30',
      jobs: [jobWithMeta],
      additionalMatchesCount: 0,
    });

    expect(email.html).toContain('📍 Hyderabad, India');
    expect(email.html).toContain('🏢 Hybrid');
    expect(email.html).toContain('💼 4+ yrs exp');
    expect(email.text).toContain('Hyderabad, India · Hybrid · 4+ yrs exp');
  });
});

describe('Digest Worker Recovery Semantics (acquired > fetched)', () => {
  const db = getDb();
  let testUserId: string;
  let testCompanyId: string;
  let validJobId1: string;
  let validJobId2: string;

  beforeAll(async () => {
    // Setup safe console email provider for tests
    setEmailProviderForTesting(new ConsoleEmailProvider());

    // Cleanup any existing test data
    await db.execute(sql`DELETE FROM jobs WHERE external_job_id LIKE 'ext-recov-%'`);
    await db.delete(schema.users).where(eq(schema.users.email, 'recovery.test@roleradar.dev'));
    await db.delete(schema.companies).where(eq(schema.companies.name, 'Recovery Test Corp'));

    // Create user
    const [u] = await db.insert(schema.users).values({
      email: 'recovery.test@roleradar.dev',
      name: 'Recovery User',
      password_hash: 'hash',
      email_verified: true,
    }).returning({ id: schema.users.id });
    testUserId = u!.id;

    await db.insert(schema.userPreferences).values({
      user_id: testUserId,
      email_alerts_enabled: true,
      instant_notifications: true,
      daily_digest: false,
      timezone: 'America/New_York',
    });

    // Create company
    const [comp] = await db.insert(schema.companies).values({
      name: 'Recovery Test Corp',
      official_domain: 'recovery.test',
      careers_url: 'https://recovery.test/careers',
    }).returning({ id: schema.companies.id });
    testCompanyId = comp!.id;

    // Create 2 valid jobs in DB
    const [j1] = await db.insert(schema.jobs).values({
      company_id: testCompanyId,
      source_system: 'CUSTOM',
      external_job_id: 'ext-recov-1',
      title: 'Valid Job 1',
      official_url: 'https://recovery.test/jobs/1',
      content_hash: 'hash-recov-1',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
    }).returning({ id: schema.jobs.id });
    validJobId1 = j1!.id;

    const [j2] = await db.insert(schema.jobs).values({
      company_id: testCompanyId,
      source_system: 'CUSTOM',
      external_job_id: 'ext-recov-2',
      title: 'Valid Job 2',
      official_url: 'https://recovery.test/jobs/2',
      content_hash: 'hash-recov-2',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
    }).returning({ id: schema.jobs.id });
    validJobId2 = j2!.id;
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM jobs WHERE external_job_id LIKE 'ext-recov-%'`);
    await db.delete(schema.companies).where(eq(schema.companies.name, 'Recovery Test Corp'));
    await db.delete(schema.users).where(eq(schema.users.email, 'recovery.test@roleradar.dev'));
    setEmailProviderForTesting(null);
  });

  it('acquired notifications > fetched jobs: unmatched notifications safely return/remain PENDING', async () => {
    // Override window for deterministic test
    const originalGetWindow = (windowedDigestWorker as any).getActiveWindowForTimezone;
    (windowedDigestWorker as any).getActiveWindowForTimezone = () => '09:00';

    try {
      // Create 3 notification intents: 2 pointing to valid jobs, 1 pointing to a non-existent/deleted job
      const fakeJobId = '00000000-0000-0000-0000-000000000001';

      const [n1] = await db.insert(schema.notifications).values({
        user_id: testUserId,
        job_id: validJobId1,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: 'test_recov_notif_1',
      }).returning({ id: schema.notifications.id });

      const [n2] = await db.insert(schema.notifications).values({
        user_id: testUserId,
        job_id: validJobId2,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: 'test_recov_notif_2',
      }).returning({ id: schema.notifications.id });

      // n3 has no valid job in DB (simulating deleted job with null or ghost ID)
      const [n3] = await db.insert(schema.notifications).values({
        user_id: testUserId,
        job_id: null,
        notification_type: 'INSTANT_JOB',
        delivery_status: 'PENDING',
        idempotency_key: 'test_recov_notif_3',
      }).returning({ id: schema.notifications.id });

      // Run digest processing cycle strictly for the test user
      await windowedDigestWorker.processCycle(testUserId);

      // Verify the digest was created and SENT
      const digests = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE user_id = ${testUserId} AND notification_type = 'WINDOWED_DIGEST'
        ORDER BY created_at DESC
      `)).rows;
      expect(digests.length).toBeGreaterThanOrEqual(1);
      expect(digests[0]!.delivery_status).toBe('SENT');

      // Verify matched notifications (n1, n2) were marked SENT and linked
      const matchedNotifs = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE id IN (${n1!.id}, ${n2!.id})
      `)).rows;
      expect(matchedNotifs.length).toBe(2);
      expect(matchedNotifs[0]!.delivery_status).toBe('SENT');
      expect(matchedNotifs[0]!.digest_id).toBe(digests[0]!.id);
      expect(matchedNotifs[1]!.delivery_status).toBe('SENT');
      expect(matchedNotifs[1]!.digest_id).toBe(digests[0]!.id);

      // Verify unmatched notification (n3) safely returned/remains PENDING and unlinked
      const [unmatchedNotif] = (await db.execute(sql`
        SELECT * FROM notifications 
        WHERE id = ${n3!.id}
      `)).rows;
      expect(unmatchedNotif).toBeDefined();
      expect(unmatchedNotif!.delivery_status).toBe('PENDING');
      expect(unmatchedNotif!.digest_id).toBeNull();

    } finally {
      (windowedDigestWorker as any).getActiveWindowForTimezone = originalGetWindow;
    }
  });
});
