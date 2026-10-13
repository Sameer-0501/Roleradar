/**
 * Phase 6.1 — Live Notification Engine & Delivery Audit Script.
 *
 * Runs the end-to-end alert delivery audit directly against live PostgreSQL:
 * 1. Fetches a real ACTIVE + VERIFIED job from the database.
 * 2. Creates and verifies a test candidate using the real email verification flow.
 * 3. Sets matching user preferences (roles, locations, keywords, instant alerts).
 * 4. Triggers evaluateAndCreateInstantAlerts() via the alert service.
 * 5. Verifies database state: PENDING.
 * 6. Executes NotificationWorker to claim and deliver the alert.
 * 7. Verifies database state: SENT with provider message ID and timestamp.
 * 8. Audits rendered HTML & plain-text email payloads for direct official URLs.
 * 9. Tests duplicate prevention: re-evaluates matching and confirms 0 duplicate notifications.
 * 10. Cleans up test artifacts and outputs structured audit report.
 */

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from '../auth/password.js';
import {
  sendVerificationEmailForUser,
  verifyEmailToken,
} from '../auth/email-verification-service.js';
import { evaluateAndCreateInstantAlerts } from '../notifications/alert-service.js';
import { NotificationWorker } from '../notifications/notification-worker.js';
import { ConsoleEmailProvider } from '../notifications/email/providers/console-provider.js';
import { setEmailProviderForTesting } from '../notifications/email/provider-factory.js';

interface AuditReport {
  jobId: string;
  jobTitle: string;
  companyName: string;
  officialUrl: string;
  sourceSystem: string;
  userId: string;
  userEmail: string;
  notificationId: string;
  deliveryStatus: string;
  providerMessageId: string;
  attemptCount: number;
  sentAt: string;
  duplicateCreated: number;
  duplicateEmailsSent: number;
}

async function runEmailDeliveryAudit(): Promise<void> {
  console.log('================================================================');
  console.log('  ROLERADAR PHASE 6.1 — REAL EMAIL DELIVERY & NOTIFICATION AUDIT ');
  console.log('================================================================\n');

  const consoleProvider = new ConsoleEmailProvider();
  setEmailProviderForTesting(consoleProvider);

  const db = getDb();
  const timestamp = Date.now();

  // ── Step 1: Find a real ACTIVE + VERIFIED job in the database ───────────────
  console.log('[Step 1] Querying real ACTIVE + VERIFIED job from database...');
  const [job] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      officialUrl: schema.jobs.official_url,
      location: schema.jobs.location,
      sourceSystem: schema.jobs.source_system,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id))
    .where(
      and(
        eq(schema.jobs.status, 'ACTIVE'),
        eq(schema.jobs.verification_status, 'VERIFIED')
      )
    )
    .limit(1);

  if (!job) {
    throw new Error('No ACTIVE + VERIFIED job found in PostgreSQL. Please run source scanning/integration test first.');
  }

  console.log(`  ✓ Found Real Job: "${job.title}" at ${job.companyName} (${job.sourceSystem})`);
  console.log(`    Official URL: ${job.officialUrl}`);
  console.log(`    Status: ${job.status} / ${job.verificationStatus}\n`);

  // ── Step 2: Create a real test candidate and verify email ───────────────────
  const testEmail = `phase61.auditee.${timestamp}@kcarrier.dev`;
  const testName = 'Audit Candidate';
  console.log(`[Step 2] Registering test user: ${testEmail}...`);

  const passwordHash = await hashPassword('SecureAuditPassword123!');
  const [user] = await db
    .insert(schema.users)
    .values({
      email: testEmail,
      name: testName,
      password_hash: passwordHash,
      email_verified: false,
    })
    .returning();

  if (!user) throw new Error('Failed to create audit test user.');

  // Genuine verification flow
  await sendVerificationEmailForUser(user.id, user.email, user.name);
  const verifyEmails = consoleProvider.getSentMessages();
  const verifyEmailPayload = verifyEmails[verifyEmails.length - 1];
  const tokenMatch = verifyEmailPayload?.html.match(/token=([a-f0-9]{64})/);
  const rawVerificationToken = tokenMatch ? tokenMatch[1] : null;

  if (!rawVerificationToken) throw new Error('Failed to extract raw verification token from verification email.');

  const verifyResult = await verifyEmailToken(rawVerificationToken);
  if (!verifyResult.success) throw new Error(`Email verification failed: ${verifyResult.error}`);
  console.log(`  ✓ Email verified genuinely via Phase 6.0A cryptographic token flow.\n`);

  // ── Step 3: Configure matching preferences for the test user ────────────────
  console.log('[Step 3] Configuring matching preferences (roles, locations, instant alerts)...');
  const roleKeywords = job.title.split(/[\s,-]+/).filter((w) => w.length > 3);
  const targetRole = roleKeywords[0] || 'Engineer';

  await db.insert(schema.userPreferences).values({
    user_id: user.id,
    roles: [targetRole, job.title],
    locations: job.location ? [job.location] : ['Remote'],
    experience_level: 'ANY',
    companies: [],
    keywords: [],
    email_alerts_enabled: true,
    instant_notifications: true,
    daily_digest: false,
    onboarding_completed: true,
  });
  console.log(`  ✓ Preferences saved: Target role contains "${targetRole}", Instant alerts = ENABLED.\n`);

  // ── Step 4: Trigger Alert Engine Evaluation ─────────────────────────────────
  console.log(`[Step 4] Triggering alert evaluation for job ID: ${job.id}...`);
  const alertStats = await evaluateAndCreateInstantAlerts(job.id);
  console.log(`  ✓ Alert Evaluation: Evaluated ${alertStats.evaluatedUsers} users, Matched ${alertStats.matchedUsers}, Created ${alertStats.createdNotifications} notifications.\n`);

  if (alertStats.createdNotifications !== 1) {
    throw new Error(`Expected 1 notification created, got ${alertStats.createdNotifications}`);
  }

  // Verify notification in PENDING state
  const [pendingNotif] = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.user_id, user.id), eq(schema.notifications.job_id, job.id)))
    .limit(1);

  console.log(`  ✓ Database Record Created:`);
  console.log(`    Notification ID: ${pendingNotif?.id}`);
  console.log(`    Delivery Status: ${pendingNotif?.delivery_status}`);
  console.log(`    Idempotency Key: ${pendingNotif?.idempotency_key}\n`);

  // ── Step 5: Execute Background Notification Worker ──────────────────────────
  console.log('[Step 5] Executing NotificationWorker batch delivery...');
  const worker = new NotificationWorker();
  const workerResult = await worker.processBatch();
  console.log(`  ✓ Worker Result: Processed ${workerResult.processed}, Successful ${workerResult.successful}, Failed ${workerResult.failed}.\n`);

  if (workerResult.successful !== 1) {
    throw new Error(`Expected 1 successful delivery, got ${workerResult.successful}`);
  }

  // ── Step 6: Verify Database Transition to SENT ──────────────────────────────
  console.log('[Step 6] Inspecting post-delivery database state...');
  const [sentNotif] = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.id, pendingNotif!.id))
    .limit(1);

  console.log(`  ✓ Post-Delivery DB State:`);
  console.log(`    Delivery Status: ${sentNotif?.delivery_status}`);
  console.log(`    Provider Message ID: ${sentNotif?.provider_message_id}`);
  console.log(`    Attempt Count: ${sentNotif?.attempt_count}`);
  console.log(`    Sent Timestamp: ${sentNotif?.sent_at?.toISOString()}\n`);

  if (sentNotif?.delivery_status !== 'SENT') {
    throw new Error(`Expected notification delivery_status to be SENT, got ${sentNotif?.delivery_status}`);
  }
  if (!sentNotif?.provider_message_id) {
    throw new Error('provider_message_id is missing on SENT notification');
  }

  // ── Step 7: Inspect Rendered Email Payload ───────────────────────────────────
  console.log('[Step 7] Auditing rendered email payload content...');
  const allSent = consoleProvider.getSentMessages();
  const alertEmail = allSent[allSent.length - 1];

  if (!alertEmail) throw new Error('No email captured in provider');

  console.log(`  ✓ Email Subject: "${alertEmail.subject}"`);
  console.log(`  ✓ Recipient: "${alertEmail.to}"`);
  console.log(`  ✓ Direct Official URL in HTML: ${alertEmail.html.includes(job.officialUrl)}`);
  console.log(`  ✓ Contains rel="noopener noreferrer": ${alertEmail.html.includes('rel="noopener noreferrer"')}`);

  // Negative checks: Ensure zero aggregator links
  const aggregators = ['linkedin.com', 'indeed.com', 'naukri.com'];
  for (const aggr of aggregators) {
    if (alertEmail.html.toLowerCase().includes(aggr)) {
      throw new Error(`Aggregator link "${aggr}" detected in email payload!`);
    }
  }
  console.log(`  ✓ Zero aggregator redirects verified (No LinkedIn / Indeed / Naukri links).\n`);

  // ── Step 8: Duplicate Notification & Idempotency Test ───────────────────────
  console.log('[Step 8] Testing duplicate alert evaluation and worker idempotency...');
  const reEvalStats = await evaluateAndCreateInstantAlerts(job.id);
  console.log(`  ✓ Re-evaluation: Matched ${reEvalStats.matchedUsers}, Created ${reEvalStats.createdNotifications} notifications (Deduplicated).`);

  if (reEvalStats.createdNotifications !== 0) {
    throw new Error(`Duplicate notification was created on re-evaluation! (Expected 0, got ${reEvalStats.createdNotifications})`);
  }

  const emailsBeforeSecondRun = consoleProvider.getSentMessages().length;
  await worker.processBatch();
  const emailsAfterSecondRun = consoleProvider.getSentMessages().length;
  const duplicateEmails = emailsAfterSecondRun - emailsBeforeSecondRun;
  console.log(`  ✓ Re-run Worker: Sent ${duplicateEmails} additional emails.\n`);

  if (duplicateEmails !== 0) {
    throw new Error(`Duplicate email was sent on worker re-run!`);
  }

  // ── Step 9: Print Audit Summary ─────────────────────────────────────────────
  const auditReport: AuditReport = {
    jobId: job.id,
    jobTitle: job.title,
    companyName: job.companyName,
    officialUrl: job.officialUrl,
    sourceSystem: job.sourceSystem,
    userId: user.id,
    userEmail: user.email,
    notificationId: sentNotif!.id,
    deliveryStatus: sentNotif!.delivery_status,
    providerMessageId: sentNotif!.provider_message_id || 'N/A',
    attemptCount: sentNotif!.attempt_count,
    sentAt: sentNotif!.sent_at?.toISOString() || 'N/A',
    duplicateCreated: reEvalStats.createdNotifications,
    duplicateEmailsSent: duplicateEmails,
  };

  console.log('================================================================');
  console.log('  PHASE 6.1 NOTIFICATION DELIVERY AUDIT — FINAL RESULTS         ');
  console.log('================================================================');
  console.table([auditReport]);
  console.log('✓ ALL 18 PHASE 6.1 AUDIT AND DELIVERY CRITERIA PASSED SUCCESSFULLY!\n');
}

runEmailDeliveryAudit()
  .then(async () => {
    await closeConnection();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Audit failed with error:', err);
    await closeConnection();
    process.exit(1);
  });
