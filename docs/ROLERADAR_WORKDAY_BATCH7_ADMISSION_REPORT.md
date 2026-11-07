# RoleRadar — Workday Batch 7 Controlled Discovery, Probing, and Source Ingestion Report

**Document Classification:** `[PUBLIC / EXTERNAL SHAREABLE]`  
**Execution Context:** Phase 20.5 Source Expansion — Workday Batch 7 Admission  
**Compliance Standard:** `docs/ENGINEERING_STANDARDS.md`  
**Security Sanitization Check:** PASS (0 secrets, 0 API keys, 0 user tokens, 0 PII)

---

## 1. Executive Summary

In accordance with RoleRadar's `docs/ENGINEERING_STANDARDS.md`, a bounded, controlled runtime discovery, probing, schema validation, and catalog admission was executed for **Workday Batch 7**:
1. **Santander** (`santander.wd3.myworkdayjobs.com`) — Admitted
2. **The LEGO Group** (`lego.wd103.myworkdayjobs.com`) — Admitted
3. **Humana** (`humana.wd5.myworkdayjobs.com`) — Admitted
4. **GoTo** (`goto.wd5.myworkdayjobs.com`) — Admitted
5. **Sysco** (`sysco.wd5.myworkdayjobs.com`) — Admitted (Reconciled from `Sysco_Careers`/404 to `syscocareers`/200)
6. **Teleperformance** (`teleperformance.wd1.myworkdayjobs.com`) — Admitted (Reconciled from wd3/`Teleperformance_Careers`/422 to wd1/`Teleperformance`/200)

All 6 candidate employers successfully completed end-to-end empirical verification, satisfying all admission invariants:
- Health check connectivity and CXS JSON schema validation
- Authoritative requisition ID extraction and regex classification
- Strict application URL provenance verification (HTTPS port 443 only, zero userinfo, non-generic slug, domain binding)
- Absence reconciliation guard (`isCompleteScan() === false` on bounded/truncated scans to prevent premature job closing)
- Full database ingestion pipeline execution (`VERIFIED ACTIVE` status)
- Deterministic deduplication idempotency (zero duplicates on repeat scan)
- Complete isolation with zero alert/notification leakage
- Full integration test pass (30/30 passed) and zero typecheck/build regressions

---

## 2. Live Probing & Endpoint Reconciliation Audit

Initial probing verified immediate 200 OK responses on 4 candidate targets and identified upstream endpoint routing discrepancies on 2 targets. In compliance with RoleRadar's zero-guessing policy, authoritative live endpoints were empirically identified and validated.

| Employer | Target Host | Tenant | Client Site | HTTP Status | Upstream Total | Status / Action |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Santander** | `santander.wd3.myworkdayjobs.com` | `santander` | `SantanderCareers` | **200 OK** | **1,025** | Exact match with candidate specification. |
| **The LEGO Group** | `lego.wd103.myworkdayjobs.com` | `lego` | `LEGO_External` | **200 OK** | **421** | Exact match with candidate specification. |
| **Humana** | `humana.wd5.myworkdayjobs.com` | `humana` | `Humana_External_Career_Site` | **200 OK** | **297** | Exact match with candidate specification. |
| **GoTo** | `goto.wd5.myworkdayjobs.com` | `goto` | `GoToCareers` | **200 OK** | **13** | Exact match with candidate specification. |
| **Sysco (Initial)** | `sysco.wd5.myworkdayjobs.com` | `sysco` | `Sysco_Careers` | **404 Not Found** | — | Upstream site identifier `Sysco_Careers` invalid. |
| **Sysco (Reconciled)** | `sysco.wd5.myworkdayjobs.com` | `sysco` | `syscocareers` | **200 OK** | **2,000** | Authoritative live career site discovered on tenant `sysco`. |
| **Teleperformance (Initial)** | `teleperformance.wd3.myworkdayjobs.com` | `teleperformance` | `Teleperformance_Careers` | **422 Unproc.** | — | Workday datacenter cluster mismatch (`wd3`). |
| **Teleperformance (Reconciled)** | `teleperformance.wd1.myworkdayjobs.com` | `teleperformance` | `Teleperformance` | **200 OK** | **6** | Authoritative live endpoint on `wd1` cluster discovered. |

---

## 3. Extraction, Normalization & Provenance Verification

| Employer | Requisition ID Pattern | Sample Requisition ID | Official URL Subpath | Upstream Total | Controlled Validation Count |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Santander** | `/^(?:Req\|REQ\|R)?\d+/i` | `Req1555604` | `santander.wd3.myworkdayjobs.com/SantanderCareers/job/` | 1,025 | 5 |
| **The LEGO Group** | `/^\d+/` | `0000039708` | `lego.wd103.myworkdayjobs.com/LEGO_External/job/` | 421 | 5 |
| **Humana** | `/^R-?\d+/i` | `R-425949` | `humana.wd5.myworkdayjobs.com/Humana_External_Career_Site/job/` | 297 | 5 |
| **GoTo** | `/^R\d+(?:-\d+)?/i` | `R26-2339` | `goto.wd5.myworkdayjobs.com/GoToCareers/job/` | 13 | 5 |
| **Sysco** | `/^R\d+/i` | `R258138` | `sysco.wd5.myworkdayjobs.com/syscocareers/job/` | 2,000 | 5 |
| **Teleperformance** | `/^(?:R\d+_)?\d+/i` | `R25_0000000429` | `teleperformance.wd1.myworkdayjobs.com/Teleperformance/job/` | 6 | 5 |

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

All 6 admitted employers have been registered in `backend/src/sources/catalog.ts`:

```typescript
  {
    companyName: 'Santander',
    officialDomain: 'santander.wd3.myworkdayjobs.com',
    careersUrl: 'https://santander.wd3.myworkdayjobs.com/SantanderCareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'santander.wd3.myworkdayjobs.com',
      tenant: 'santander',
      clientSite: 'SantanderCareers',
    },
  },
  {
    companyName: 'The LEGO Group',
    officialDomain: 'lego.wd103.myworkdayjobs.com',
    careersUrl: 'https://lego.wd103.myworkdayjobs.com/LEGO_External',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'lego.wd103.myworkdayjobs.com',
      tenant: 'lego',
      clientSite: 'LEGO_External',
    },
  },
  {
    companyName: 'Humana',
    officialDomain: 'humana.wd5.myworkdayjobs.com',
    careersUrl: 'https://humana.wd5.myworkdayjobs.com/Humana_External_Career_Site',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'humana.wd5.myworkdayjobs.com',
      tenant: 'humana',
      clientSite: 'Humana_External_Career_Site',
    },
  },
  {
    companyName: 'GoTo',
    officialDomain: 'goto.wd5.myworkdayjobs.com',
    careersUrl: 'https://goto.wd5.myworkdayjobs.com/GoToCareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'goto.wd5.myworkdayjobs.com',
      tenant: 'goto',
      clientSite: 'GoToCareers',
    },
  },
  {
    companyName: 'Sysco',
    officialDomain: 'sysco.wd5.myworkdayjobs.com',
    careersUrl: 'https://sysco.wd5.myworkdayjobs.com/syscocareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'sysco.wd5.myworkdayjobs.com',
      tenant: 'sysco',
      clientSite: 'syscocareers',
    },
  },
  {
    companyName: 'Teleperformance',
    officialDomain: 'teleperformance.wd1.myworkdayjobs.com',
    careersUrl: 'https://teleperformance.wd1.myworkdayjobs.com/Teleperformance',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'teleperformance.wd1.myworkdayjobs.com',
      tenant: 'teleperformance',
      clientSite: 'Teleperformance',
    },
  },
```

---

## 5. Verification Commands & Acceptance Gate Results

### 5.1 Batch 7 Integration Suite
**Command:** `cd backend; npx vitest run src/tests/workday-batch7-integration.test.ts`  
**Result:** **30 passed / 30 total** across 6 employer test suites (Duration: 77.42s)  
- Health check connectivity: PASS (6/6)
- URL validation & security attacks: PASS (6/6)
- Bounded discovery & req ID parsing: PASS (6/6)
- Full pipeline execution (`VERIFIED ACTIVE` in DB): PASS (6/6)
- Repeat scan deduplication idempotency (0 duplicates): PASS (6/6)

### 5.2 Regression Engine Suite
**Command:** `cd backend; npx vitest run src/tests/adobe-dual-domain-provenance.test.ts src/tests/collector-timeout-safety.test.ts src/tests/source-catalog.test.ts`  
**Result:** **21 passed / 21 total** (Duration: 1.48s)  
- `adobe-dual-domain-provenance.test.ts`: 14 passed (14)
- `collector-timeout-safety.test.ts`: 3 passed (3)
- `source-catalog.test.ts`: 4 passed (4)

### 5.3 Backend Typecheck
**Command:** `cd backend; npx tsc --noEmit`  
**Result:** **Exit Code 0** (0 diagnostic errors)

### 5.4 Frontend Production Build Check
**Command:** `npm --prefix frontend run build`  
**Result:** **Exit Code 0** (built in 11.66s, 2,438 modules transformed, 0 errors)

---

## 6. Git Safety & Working Tree Audit

- **Remote Pushes:** **0** (`git push` strictly prohibited).
- **Branch:** `main` (cleanly tracking local commits).
- **Digest Remediation Files Invariant:** Strict preservation confirmed. The 3 files remain uncommitted and unstaged:
  - `backend/src/notifications/digest-worker.ts`
  - `backend/src/notifications/email/providers/smtp-provider.ts`
  - `backend/src/tests/digest-concurrency-integration.test.ts`
- **Batch 7 Files for Controlled Commit:**
  - `backend/src/sources/catalog.ts` (Modified: 6 candidate sources admitted)
  - `backend/src/scripts/probe-workday-batch7.ts` (Untracked: Discovery probe script)
  - `backend/src/tests/workday-batch7-integration.test.ts` (Untracked: Integration suite)
  - `docs/ROLERADAR_WORKDAY_BATCH7_ADMISSION_REPORT.md` (Untracked: Shareable report)
