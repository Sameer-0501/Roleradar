/**
 * Development Verification Flow Script.
 *
 * Executes the complete genuine email verification lifecycle against live PostgreSQL:
 * 1. Registers test user `console.devtest.<timestamp>@kcarrier.dev`
 * 2. Confirms DB state: email_verified = false, verification_token_hash is 64-char SHA256
 * 3. Extracts raw token from captured ConsoleEmailProvider
 * 4. Calls verifyEmailToken() via the verification service/endpoint logic
 * 5. Confirms DB state: email_verified = true, email_verified_at set, verification_token_hash = null
 * 6. Tests token reuse: attempts to verify again with the same token, asserts failure
 * 7. Closes database connection cleanly
 */

import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.js';
import {
  sendVerificationEmailForUser,
  verifyEmailToken,
} from '../auth/email-verification-service.js';
import { ConsoleEmailProvider } from '../notifications/email/providers/console-provider.js';
import { setEmailProviderForTesting } from '../notifications/email/provider-factory.js';

async function runDevelopmentVerificationTest() {
  console.log('--- PHASE 6.0A DEVELOPMENT EMAIL VERIFICATION TEST ---');

  const consoleProvider = new ConsoleEmailProvider();
  setEmailProviderForTesting(consoleProvider);

  const db = getDb();
  const timestamp = Date.now();
  const testEmail = `console.devtest.${timestamp}@kcarrier.dev`;
  const testName = 'Console Dev Tester';
  const passwordHash = await hashPassword('SecurePass123!');

  // Step 1: Create unverified user
  console.log(`[1] Registering user: ${testEmail}`);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: testEmail,
      name: testName,
      password_hash: passwordHash,
      email_verified: false,
    })
    .returning();

  if (!user) throw new Error('User creation failed');

  // Step 2: Send verification email
  console.log('[2] Dispatching verification email...');
  const sent = await sendVerificationEmailForUser(user.id, user.email, user.name);
  if (!sent) throw new Error('Failed to dispatch verification email');

  // Inspect database state before verification
  const [beforeVerification] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  console.log(`    State: email_verified = ${beforeVerification?.email_verified}`);
  console.log(`    Token hash stored: ${beforeVerification?.verification_token_hash?.slice(0, 16)}... (length: ${beforeVerification?.verification_token_hash?.length})`);
  console.log(`    Token expires at: ${beforeVerification?.verification_token_expires_at?.toISOString()}`);

  if (beforeVerification?.email_verified !== false) {
    throw new Error('User must be unverified before verification!');
  }
  if (!beforeVerification?.verification_token_hash || beforeVerification.verification_token_hash.length !== 64) {
    throw new Error('Valid 64-char SHA256 hash must be stored in DB!');
  }

  // Step 3: Extract verification link & raw token from captured ConsoleEmailProvider
  const sentMessages = consoleProvider.getSentMessages();
  console.log(`[3] Captured emails in Console provider: ${sentMessages.length}`);
  const lastEmail = sentMessages[sentMessages.length - 1];
  const urlMatch = lastEmail?.html.match(/token=([a-f0-9]{64})/);
  const rawToken = urlMatch ? urlMatch[1] : null;

  if (!rawToken) {
    throw new Error('Could not extract raw token from captured email payload');
  }
  console.log(`    Extracted raw token: ${rawToken.slice(0, 16)}... (length: ${rawToken.length})`);

  // Step 4: Verify email via verifyEmailToken
  console.log('[4] Calling verification service with raw token...');
  const verifyResult = await verifyEmailToken(rawToken);
  if (!verifyResult.success) {
    throw new Error(`Verification failed: ${verifyResult.error}`);
  }
  console.log('    ✓ Verification call returned success: true');

  // Step 5: Assert database state transitioned to VERIFIED
  const [afterVerification] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  console.log(`[5] Post-verification DB State:`);
  console.log(`    email_verified = ${afterVerification?.email_verified}`);
  console.log(`    email_verified_at = ${afterVerification?.email_verified_at?.toISOString()}`);
  console.log(`    verification_token_hash = ${afterVerification?.verification_token_hash}`);

  if (afterVerification?.email_verified !== true) {
    throw new Error('User email_verified is not true in PostgreSQL!');
  }
  if (!afterVerification?.email_verified_at) {
    throw new Error('email_verified_at is not populated in PostgreSQL!');
  }
  if (afterVerification?.verification_token_hash !== null) {
    throw new Error('verification_token_hash was not cleared to null upon verification!');
  }

  // Step 6: Test token reuse rejection
  console.log('[6] Testing token reuse rejection with same token...');
  const reuseResult = await verifyEmailToken(rawToken);
  console.log(`    Reuse attempt result: success = ${reuseResult.success}, error = "${reuseResult.error}"`);
  if (reuseResult.success) {
    throw new Error('Reused token was accepted! Must be rejected.');
  }

  console.log('--- ALL DEVELOPMENT EMAIL VERIFICATION STEPS PASSED SUCCESSFULLY! ---');
}

runDevelopmentVerificationTest()
  .then(async () => {
    await closeConnection();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Test failed with error:', err);
    await closeConnection();
    process.exit(1);
  });
