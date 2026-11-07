# Notification Digest & Email Safety Implementation Plan (Corrected)

## Goal
Migrate from the high-volume one-email-per-job (`INSTANT_JOB`) model to a controlled, windowed daily digest (6 windows per day per user timezone). This includes a global email safety budget and strict database-level concurrency controls, built on top of the Phase 15 notification infrastructure.

## Corrected Design Architecture

### 1. User Preference Semantics
We will not silently merge preferences. The new windowed system replaces the delivery engine but respects existing intent:
- `instant_notifications=true`: User receives job matches through the windowed digest system (up to 6 times a day as new matches arrive).
- `daily_digest=true` (and `instant_notifications=false`): User receives job matches ONCE a day via the digest, strictly during their 09:00 local timezone window.
- **Both True**: `instant_notifications` logic applies (up to 6 windows).
- **Both False**: No email digests sent.

### 2. Delivered Job Safety (Only Delivered = SENT)
- `alert-service.ts` will continue generating `INSTANT_JOB` records with `delivery_status = 'PENDING'`.
- The new `digest-worker.ts` will select up to 10 `PENDING` jobs, generate a digest, and insert a single `WINDOWED_DIGEST` record as the parent intent.
- Only the 10 selected jobs will be updated to `SENT` upon successful email delivery.
- Any remaining eligible jobs (>10) will be left `PENDING` for the next window.
- Jobs successfully delivered will never be re-selected because their status is `SENT` (query only targets `PENDING`).

### 3. Concurrency-Safe Global Email Safety Budget
- Create a new PostgreSQL table `email_daily_budget`:
  - `date_utc` (DATE PRIMARY KEY)
  - `sent_count` (INTEGER)
- Configure `EMAIL_DAILY_SAFETY_BUDGET=300`.
- Workers will execute an ATOMIC budget reservation before sending:
  ```sql
  INSERT INTO email_daily_budget (date_utc, sent_count)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (date_utc) DO UPDATE 
  SET sent_count = email_daily_budget.sent_count + 1
  WHERE email_daily_budget.sent_count < 300
  RETURNING sent_count;
  ```
- If the reservation fails (0 rows returned), the worker aborts, jobs remain `PENDING`, and no emails are sent.

### 4. Concurrency Testing
- Implement `digest-concurrency.test.ts` using `Promise.all` to verify:
  - Two workers cannot process the same user/window simultaneously.
  - No duplicate job delivery occurs.
  - Simultaneous budget acquisition never exceeds the hard limit.

## Execution Plan
1. Update `schema.ts` (add `WINDOWED_DIGEST`, `digest_id` to notifications, create `email_daily_budget`).
2. Generate and run Drizzle migration.
3. Build the `digest-worker.ts` with the atomic budget logic and top-10 delivery rules.
4. Clean up `notification-worker.ts` to remove `INSTANT_JOB` one-by-one dispatch.
5. Create `windowed-digest.ts` email template.
6. Write concurrency tests.
7. Run tests, build, and runtime validation.
