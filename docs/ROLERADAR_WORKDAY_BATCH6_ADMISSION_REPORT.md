# RoleRadar — Workday Batch 6 Controlled Discovery, Probing, and Source Ingestion Report

**Document Classification:** `[PUBLIC / EXTERNAL SHAREABLE]`  
**Execution Context:** Phase 20.5 Source Expansion  
**Compliance Standard:** `docs/ENGINEERING_STANDARDS.md`  
**Security Sanitization Check:** PASS (0 secrets, 0 API keys, 0 user tokens, 0 PII)

---

## 1. Executive Summary

In accordance with RoleRadar's `docs/ENGINEERING_STANDARDS.md`, a bounded, controlled runtime discovery, probing, schema validation, and catalog admission was executed for **Workday Batch 6**:
1. **Haleon** (`gsknch.wd3.myworkdayjobs.com`) — Admitted
2. **Nasdaq** (`nasdaq.wd1.myworkdayjobs.com`) — Admitted
3. **TransUnion** (`transunion.wd5.myworkdayjobs.com`) — Admitted (Reconciled from wd1/422 to wd5/200)
4. **Broadridge** (`broadridge.wd5.myworkdayjobs.com`) — Admitted (Reconciled from `Broadridge_Careers`/404 to `Careers`/200)
5. **U.S. Bank** (`usbank.wd1.myworkdayjobs.com`) — Admitted
6. **Pfizer** (`pfizer.wd1.myworkdayjobs.com`) — Admitted (Reconciled from `Pfizer_Careers`/404 to `PfizerCareers`/200)

All 6 employer sources successfully passed live probing, schema validation, URL provenance enforcement, absence reconciliation guards, end-to-end pipeline execution (`VERIFIED ACTIVE`), repeat scan idempotency (0 duplicates), and integration test assertions (30/30 passed).

---

## 2. Live Probing & Endpoint Reconciliation Audit

During initial probing, empirical verification confirmed three immediate 200 OK endpoints and identified upstream routing/site name discrepancies on the remaining three. In accordance with zero-guessing engineering standards, authoritative endpoints were discovered and validated against live Workday career portals.

| Employer | Target Host | Tenant | Client Site | HTTP Status | Upstream Total | Status / Action |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Haleon** | `gsknch.wd3.myworkdayjobs.com` | `gsknch` | `GSKCareers` | **200 OK** | **267** | Exact match with candidate spec. |
| **Nasdaq** | `nasdaq.wd1.myworkdayjobs.com` | `nasdaq` | `Global_External_Site` | **200 OK** | **150** | Exact match with candidate spec. |
| **TransUnion (Initial)** | `transunion.wd1.myworkdayjobs.com` | `transunion` | `transunion_external` | **422 Unproc.** | — | Datacenter cluster mismatch (HTTP 422). |
| **TransUnion (Reconciled)** | `transunion.wd5.myworkdayjobs.com` | `transunion` | `TransUnion` | **200 OK** | **225** | Authoritative live endpoint on wd5 cluster. |
| **Broadridge (Initial)** | `broadridge.wd5.myworkdayjobs.com` | `broadridge` | `Broadridge_Careers` | **404 Not Found** | — | Upstream site identifier invalid. |
| **Broadridge (Reconciled)** | `broadridge.wd5.myworkdayjobs.com` | `broadridge` | `Careers` | **200 OK** | **320** | Live career site identified on tenant `broadridge`. |
| **U.S. Bank** | `usbank.wd1.myworkdayjobs.com` | `usbank` | `US_Bank_Careers` | **200 OK** | **1,278** | Exact match with candidate spec. |
| **Pfizer (Initial)** | `pfizer.wd1.myworkdayjobs.com` | `pfizer` | `Pfizer_Careers` | **404 Not Found** | — | Upstream site identifier invalid. |
| **Pfizer (Reconciled)** | `pfizer.wd1.myworkdayjobs.com` | `pfizer` | `PfizerCareers` | **200 OK** | **632** | Live career site identified on tenant `pfizer`. |

---

## 3. Extraction, Normalization & Provenance Verification

| Employer | Requisition ID Pattern | Sample Requisition ID | Official URL Format | Upstream Total | Controlled Validation Count |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Haleon** | `/^\d+/` | `548815` | `https://gsknch.wd3.myworkdayjobs.com/GSKCareers/job/...` | 267 | 5 |
| **Nasdaq** | `/^R\d+/i` | `R0026959` | `https://nasdaq.wd1.myworkdayjobs.com/Global_External_Site/job/...` | 150 | 5 |
| **TransUnion** | `/^\d+/` | `19042954` | `https://transunion.wd5.myworkdayjobs.com/TransUnion/job/...` | 225 | 5 |
| **Broadridge** | `/^(?:JR\|R)?\d+/i` | `JR1086959` | `https://broadridge.wd5.myworkdayjobs.com/Careers/job/...` | 320 | 5 |
| **U.S. Bank** | `/^\d{4}-\d+/` | `2026-0004477` | `https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers/job/...` | 1,278 | 5 |
| **Pfizer** | `/^\d+/` | `4967560` | `https://pfizer.wd1.myworkdayjobs.com/PfizerCareers/job/...` | 632 | 5 |

### Invariant Governance Verification
1. **Source Isolation:** Each collector instance operates independently with dedicated company metadata. A network fault or timeout on one endpoint does not affect any other source.
2. **Controlled Ingestion:** Bounded sweeps configured with `pageSize: 5, maxPages: 1` retrieved exactly 5 candidate postings per employer for end-to-end schema extraction and pipeline persistence.
3. **URL Provenance:** All candidate URLs validated strictly via `validateJobUrl()`:
   - Valid standard and internationalized (`/en-US/{tenant}/{site}/job/...`) paths accepted.
   - Lookalike domains, attacker subdomains, credentials in userinfo, non-443 ports, and root career pages rejected.
4. **Absence Reconciliation Guard:** Bounded scans were verified to set `isCompleteScan() === false` (`MAX_PAGES_REACHED_TRUNCATION`), strictly preventing erroneous absence-based closures of active jobs.
5. **Deterministic Deduplication:** Re-running the pipeline with identical candidate batches inserted 0 new rows (`countAfter === countBefore`).
6. **Zero Notification Leakage:** `alertService` mocked across all integration tests (`evaluatedUsers: 0, createdNotifications: 0`), ensuring zero synthetic notifications or emails leaked.
7. **Non-Destructive Cleanup:** `afterAll` teardown cleaned up only test-inserted job records by `company_id` without deleting shared `companies` records.

---

## 4. Source Catalog Registration

The 6 verified employers are registered in `backend/src/sources/catalog.ts`:

```typescript
  {
    companyName: 'Haleon',
    officialDomain: 'gsknch.wd3.myworkdayjobs.com',
    careersUrl: 'https://gsknch.wd3.myworkdayjobs.com/GSKCareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'gsknch.wd3.myworkdayjobs.com',
      tenant: 'gsknch',
      clientSite: 'GSKCareers',
    },
  },
  {
    companyName: 'Nasdaq',
    officialDomain: 'nasdaq.wd1.myworkdayjobs.com',
    careersUrl: 'https://nasdaq.wd1.myworkdayjobs.com/Global_External_Site',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'nasdaq.wd1.myworkdayjobs.com',
      tenant: 'nasdaq',
      clientSite: 'Global_External_Site',
    },
  },
  {
    companyName: 'TransUnion',
    officialDomain: 'transunion.wd5.myworkdayjobs.com',
    careersUrl: 'https://transunion.wd5.myworkdayjobs.com/TransUnion',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'transunion.wd5.myworkdayjobs.com',
      tenant: 'transunion',
      clientSite: 'TransUnion',
    },
  },
  {
    companyName: 'Broadridge',
    officialDomain: 'broadridge.wd5.myworkdayjobs.com',
    careersUrl: 'https://broadridge.wd5.myworkdayjobs.com/Careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'broadridge.wd5.myworkdayjobs.com',
      tenant: 'broadridge',
      clientSite: 'Careers',
    },
  },
  {
    companyName: 'U.S. Bank',
    officialDomain: 'usbank.wd1.myworkdayjobs.com',
    careersUrl: 'https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'usbank.wd1.myworkdayjobs.com',
      tenant: 'usbank',
      clientSite: 'US_Bank_Careers',
    },
  },
  {
    companyName: 'Pfizer',
    officialDomain: 'pfizer.wd1.myworkdayjobs.com',
    careersUrl: 'https://pfizer.wd1.myworkdayjobs.com/PfizerCareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'pfizer.wd1.myworkdayjobs.com',
      tenant: 'pfizer',
      clientSite: 'PfizerCareers',
    },
  },
```

---

## 5. Verification Commands & Acceptance Gate Results

### 5.1 Batch 6 Integration Suite
**Command:** `npx vitest run src/tests/workday-batch6-integration.test.ts` (from `backend/`)  
**Result:** **30 passed / 30 total** across 6 employer test suites (Duration: 117.69s)  
- Health check connectivity: PASS (6/6)
- URL validation & security attacks: PASS (6/6)
- Bounded discovery & req ID parsing: PASS (6/6)
- Full pipeline execution (`VERIFIED ACTIVE` in DB): PASS (6/6)
- Repeat scan deduplication idempotency (0 duplicates): PASS (6/6)

### 5.2 Regression Engine Suite
**Command:** `npx vitest run src/tests/collector-timeout-safety.test.ts src/tests/apply-action-semantics.test.ts`  
**Result:** **7 passed / 7 total** (Duration: 1.09s)  
- `apply-action-semantics.test.ts`: 4 passed (4)
- `collector-timeout-safety.test.ts`: 3 passed (3)

### 5.3 Backend Typecheck
**Command:** `npx tsc --noEmit` (from `backend/`)  
**Result:** **Exit Code 0** (0 diagnostic errors)

### 5.4 Frontend Production Build Check
**Command:** `npm --prefix frontend run build`  
**Result:** **Exit Code 0** (built in 9.86s, 2438 modules transformed, 0 errors)

---

## 6. Git Safety & Working Tree Audit

- **Remote Pushes:** **0** (`git push` strictly prohibited).
- **Branch:** `main` (cleanly tracking local commits).
- **Digest Remediation Files Invariant:** Strict preservation confirmed. The 3 files remain uncommitted and unstaged:
  - `backend/src/notifications/digest-worker.ts`
  - `backend/src/notifications/email/providers/smtp-provider.ts`
  - `backend/src/tests/digest-concurrency-integration.test.ts`
- **Batch 6 Files:**
  - `backend/src/sources/catalog.ts` (Modified: 6 candidate sources admitted)
  - `backend/src/scripts/probe-workday-batch6.ts` (Untracked: Discovery probe script)
  - `backend/src/tests/workday-batch6-integration.test.ts` (Untracked: Integration suite)
  - `docs/ROLERADAR_WORKDAY_BATCH6_ADMISSION_REPORT.md` (Untracked: Shareable report)

