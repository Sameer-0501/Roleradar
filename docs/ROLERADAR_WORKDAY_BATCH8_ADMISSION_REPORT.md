# RoleRadar — Workday Batch 8 Controlled Discovery, Probing, and Source Ingestion Report

**Document Classification:** `[PUBLIC / EXTERNAL SHAREABLE]`  
**Execution Context:** Phase 20.5 Source Expansion — Workday Batch 8 Admission  
**Compliance Standard:** `docs/ENGINEERING_STANDARDS.md`  
**Security Sanitization Check:** PASS (0 secrets, 0 API keys, 0 user tokens, 0 PII)

---

## 1. Executive Summary

In accordance with RoleRadar's `docs/ENGINEERING_STANDARDS.md`, a bounded, controlled runtime discovery, probing, schema validation, and catalog admission was executed for **Workday Batch 8**:
1. **Salesforce** (`salesforce.wd12.myworkdayjobs.com`) — Admitted (with specialized discovery for `Futureforce_NewGradRoles`)
2. **Workday (Corporate)** (`workday.wd5.myworkdayjobs.com`) — Admitted
3. **Teladoc Health** (`teladoc.wd503.myworkdayjobs.com`) — Admitted (Reconciled from unroutable `wd1`/422 to cluster `wd503`/200)

All candidate employers successfully passed end-to-end empirical verification, satisfying all mandatory architectural invariants:
- Health check connectivity and CXS JSON schema validation
- Authoritative requisition ID extraction and regex pattern matching
- Strict application URL provenance verification (HTTPS port 443 only, zero embedded userinfo, non-generic slug, domain binding)
- Absence reconciliation guard (`isCompleteScan() === false` on bounded/truncated scans to prevent premature job closing)
- Full database ingestion pipeline execution (`VERIFIED ACTIVE` status)
- Deterministic deduplication idempotency (zero duplicates on repeat scan)
- Complete isolation with zero alert/notification leakage
- Full integration test pass (17/17 passed) and zero typecheck/build regressions

---

## 2. Live Probing & Endpoint Reconciliation Audit

Initial probing verified immediate 200 OK responses on Salesforce (both professional and early career sites) and Workday corporate. Empirical probing verified datacenter cluster routing for Teladoc Health, proving why the preliminary `wd1` cluster failed with HTTP 422 while the reconciled `wd503` cluster returned HTTP 200 OK with active postings.

| Employer | Target Host | Tenant | Client Site | HTTP Status | Upstream Total | Status / Action |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Salesforce (Professional)** | `salesforce.wd12.myworkdayjobs.com` | `salesforce` | `External_Career_Site` | **200 OK** | **1,550** | Primary candidate endpoint for experienced / professional roles. |
| **Salesforce (Futureforce)** | `salesforce.wd12.myworkdayjobs.com` | `salesforce` | `Futureforce_NewGradRoles` | **200 OK** | **40** | Specialized early career / university graduate hiring portal verified. |
| **Workday (Corporate)** | `workday.wd5.myworkdayjobs.com` | `workday` | `Workday` | **200 OK** | **369** | Workday corporate direct hiring portal on `wd5` cluster. |
| **Teladoc Health (Initial)** | `teladoc.wd1.myworkdayjobs.com` | `teladoc` | `teladochealth_is_hiring` | **422 Unproc.** | — | Datacenter cluster mismatch (HTTP 422 Unprocessable Entity). |
| **Teladoc Health (Reconciled)**| `teladoc.wd503.myworkdayjobs.com` | `teladoc` | `teladochealth_is_hiring` | **200 OK** | **52** | Authoritative live endpoint on `wd503` cluster discovered. |

---

## 3. Extraction, Normalization & Provenance Verification

| Employer | Requisition ID Pattern | Sample Requisition ID | Official URL Subpath | Upstream Total | Controlled Validation Count |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Salesforce** | `/^(?:JR\|R)?\d+/i` | `JR338174` | `salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/` | 1,550 | 5 |
| **Workday** | `/^JR-?\d+/i` | `JR-0111499` | `workday.wd5.myworkdayjobs.com/Workday/job/` | 369 | 5 |
| **Teladoc Health** | `/^(?:JR\|R)?\d+/i` | `JR21222` | `teladoc.wd503.myworkdayjobs.com/teladochealth_is_hiring/job/` | 52 | 5 |

### Mandatory Invariant Enforcement Audit
1. **Source Isolation:** Collectors execute independently within isolated try/catch boundaries. Network errors, timeouts, or schema variations on one employer cannot cascade to another.
2. **Controlled Ingestion:** Test discovery sweeps strictly bounded with `pageSize: 5, maxPages: 1` (retrieving exactly 5 postings per candidate employer).
3. **Absence Reconciliation Guard:** `isCompleteScan()` returns `false` (`WORKDAY_SCAN_TRUNCATED: maxPages cap reached`), safeguarding against premature absent-job closure in `runPipeline()`.
4. **URL Provenance Security:** Validated using `validateJobUrl()`:
   - Official canonical paths accepted.
   - Internationalized paths (`/en-US/{tenant}/{site}/job/...`) accepted.
   - Lookalike domains (`evil-spoof.com`) rejected.
   - Attacker subdomains (`attacker-{officialDomain}`) rejected.
   - Non-standard ports (e.g. `:8443`) rejected.
   - Embedded credentials (`user:pass@host`) rejected.
   - Generic portal roots (`/{clientSite}`) rejected.
5. **Deduplication Idempotency:** Repeat scan cycles with identical candidate batches produced 0 duplicate database rows (`countAfter === countBefore`).
6. **Zero Notification Leakage:** `alertService` was mocked across all test runs (`evaluatedUsers: 0, createdNotifications: 0`), ensuring zero synthetic notifications or emails leaked.
7. **Non-Destructive Database Teardown:** Test cleanup deleted only job records matching the admitted `company_id`s, leaving shared `companies` records intact.

---

## 4. Source Catalog Registration

All admitted employers have been registered in `backend/src/sources/catalog.ts`:

```typescript
  {
    companyName: 'Salesforce',
    officialDomain: 'salesforce.wd12.myworkdayjobs.com',
    careersUrl: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'salesforce.wd12.myworkdayjobs.com',
      tenant: 'salesforce',
      clientSite: 'External_Career_Site',
    },
  },
  {
    companyName: 'Workday',
    officialDomain: 'workday.wd5.myworkdayjobs.com',
    careersUrl: 'https://workday.wd5.myworkdayjobs.com/Workday',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'workday.wd5.myworkdayjobs.com',
      tenant: 'workday',
      clientSite: 'Workday',
    },
  },
  {
    companyName: 'Teladoc Health',
    officialDomain: 'teladoc.wd503.myworkdayjobs.com',
    careersUrl: 'https://teladoc.wd503.myworkdayjobs.com/teladochealth_is_hiring',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'teladoc.wd503.myworkdayjobs.com',
      tenant: 'teladoc',
      clientSite: 'teladochealth_is_hiring',
    },
  },
```

---

## 5. Verification Commands & Acceptance Gate Results

### 5.1 Batch 8 Integration Suite
**Command:** `cd backend; npx vitest run src/tests/workday-batch8-integration.test.ts`  
**Result:** **17 passed / 17 total** (Duration: 43.05s)  
- Health check connectivity: PASS (3/3)
- URL validation & security attacks: PASS (3/3)
- Bounded discovery & req ID parsing: PASS (3/3)
- Full pipeline execution (`VERIFIED ACTIVE` in DB): PASS (3/3)
- Repeat scan deduplication idempotency (0 duplicates): PASS (3/3)
- Specialized Candidate Validations:
  * Salesforce Futureforce early career discovery: PASS
  * Teladoc Health cluster routing (wd503 200 OK vs wd1 422 Unproc.): PASS

### 5.2 Regression Engine Suite
**Command:** `cd backend; npx vitest run src/tests/adobe-dual-domain-provenance.test.ts src/tests/collector-timeout-safety.test.ts`  
**Result:** **17 passed / 17 total** (Duration: 960ms)  
- `adobe-dual-domain-provenance.test.ts`: 14 passed (14)
- `collector-timeout-safety.test.ts`: 3 passed (3)

### 5.3 Backend Typecheck
**Command:** `cd backend; npx tsc --noEmit`  
**Result:** **Exit Code 0** (0 diagnostic errors)

### 5.4 Frontend Production Build Check
**Command:** `npm --prefix frontend run build`  
**Result:** **Exit Code 0** (built in 13.87s, 2,438 modules transformed, 0 errors)

---

## 6. Git Safety & Working Tree Audit

- **Remote Pushes:** **0** (`git push` strictly prohibited).
- **Branch:** `main` (cleanly tracking local commits).
- **Digest Remediation Files Invariant:** Strict preservation confirmed. The 3 files remain uncommitted and unstaged:
  - `backend/src/notifications/digest-worker.ts`
  - `backend/src/notifications/email/providers/smtp-provider.ts`
  - `backend/src/tests/digest-concurrency-integration.test.ts`
- **Batch 8 Files for Controlled Commit:**
  - `backend/src/sources/catalog.ts` (Modified: 3 candidate sources admitted)
  - `backend/src/scripts/probe-workday-batch8.ts` (Untracked: Discovery probe script)
  - `backend/src/tests/workday-batch8-integration.test.ts` (Untracked: Integration suite)
  - `docs/ROLERADAR_WORKDAY_BATCH8_ADMISSION_REPORT.md` (Untracked: Shareable report)
