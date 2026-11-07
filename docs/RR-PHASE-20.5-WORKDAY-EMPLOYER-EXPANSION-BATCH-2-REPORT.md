# RoleRadar — Phase 20.5: Consolidated Workday Employer Expansion Batch 2 Report

**STATUS: SAFE TO SHARE**  
*Document Version: 1.0.0*  
*Date: 2026-10-17*  
*Scope: Strategic Source Expansion Batch 2 (Fractal Analytics, Omnissa, Piramal Pharma, Elevance Health / Carelon, Thomson Reuters)*

---

## Executive Summary

Phase 20.5 — Strategic Source Expansion continues RoleRadar's direct-employer Workday onboarding using the authoritative reconciliation data from `Workday ATS Employer Discovery.pdf`. This batch systematically processed the next five candidate employers in exact sequence:

1. **Fractal Analytics** (`fractal.wd1.myworkdayjobs.com`): **`INTEGRATED`**
2. **Omnissa** (`omnissa.wd501.myworkdayjobs.com`): **`DEFERRED/BLOCKED`** (Workday tenant returns HTTP 303 Redirect to maintenance page; public portal uses private authenticated AWS gateway)
3. **Piramal Pharma** (`piramalpharma.wd102.myworkdayjobs.com`): **`INTEGRATED`**
4. **Elevance Health / Carelon** (`elevancehealth.wd1.myworkdayjobs.com`): **`INTEGRATED`**
5. **Thomson Reuters** (`thomsonreuters.wd5.myworkdayjobs.com`): **`INTEGRATED`** (Configured with declarative India location facet `Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e']`)

The four admitted employers were cataloged, seeded into PostgreSQL, and verified through live CXS connectivity, bounded controlled discovery, requisition ID extraction, official domain validation, deduplication idempotency, and clean lifecycle management. A small collector enhancement was implemented to ensure multi-bullet Workday layouts (e.g. Thomson Reuters `[city, state, reqId]`) always extract the authoritative requisition token rather than preceding location text.

All 26 tests in the new Batch 2 integration suite passed (100%), full backend test suites passed (62/62 files, 952/952 tests), and TypeScript compiled with zero errors (`tsc` exit code 0). Zero real user notifications were dispatched.

---

## 1. Candidate Employer Status Summary

| # | Candidate Employer | Workday Host | Tenant / Client Site | Status | Empirical Rationale |
|---|---|---|---|---|---|
| 1 | **Fractal Analytics** | `fractal.wd1.myworkdayjobs.com` | `fractal` / `Careers` | **`INTEGRATED`** | CXS endpoint 200 OK. 117 upstream jobs. Requisition pattern `SR-\d+`. Strong India presence (Bengaluru, Mumbai, Gurugram). |
| 2 | **Omnissa** | `omnissa.wd501.myworkdayjobs.com` | `omnissa` / `Omnissa_External_Career_Site` | **`DEFERRED/BLOCKED`** | Host returns HTTP 303 Redirect to Workday maintenance page (`community.workday.com/maintenance-page`). Front-end requires proprietary AWS API gateway authorization token (`HTTP 403 Forbidden`). Inaccessible via standard collector without guessing. |
| 3 | **Piramal Pharma** | `piramalpharma.wd102.myworkdayjobs.com` | `piramalpharma` / `PIRAMAL_EXTERNAL_CAREERS` | **`INTEGRATED`** | CXS endpoint 200 OK. 272 upstream jobs. Requisition pattern `R\d{8}`. Predominantly India operational roles (Ennore TN, Mumbai, Pan-India). |
| 4 | **Elevance Health / Carelon** | `elevancehealth.wd1.myworkdayjobs.com` | `elevancehealth` / `carelonglobal_in` | **`INTEGRATED`** | Dedicated Carelon Global Solutions India client site. 14 upstream jobs, 100% India-based (Bengaluru, Hyderabad, Gurugram). Requisition pattern `JR\d{6}`. |
| 5 | **Thomson Reuters** | `thomsonreuters.wd5.myworkdayjobs.com` | `thomsonreuters` / `external_career_site` | **`INTEGRATED`** | CXS endpoint 200 OK. 466 global upstream jobs. Declarative facet `Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e']` pinpoints 36 India technology openings. Requisition pattern `JREQ\d{6}`. |

---

## 2. Admitted Source Configurations

### 2.1 Fractal Analytics
```typescript
{
  companyName: 'Fractal Analytics',
  officialDomain: 'fractal.wd1.myworkdayjobs.com',
  careersUrl: 'https://fractal.ai/careers',
  atsType: 'WORKDAY',
  isActive: true,
  scanIntervalMinutes: 30,
  config: {
    host: 'fractal.wd1.myworkdayjobs.com',
    tenant: 'fractal',
    clientSite: 'Careers',
  },
}
```
- **Requisition ID Pattern:** `SR-\d+` (e.g., `SR-42743`, `SR-46361`)
- **Official Job URL Pattern:** `https://fractal.wd1.myworkdayjobs.com/Careers/job/<title-slug>_<reqId>`
- **Scan Incompleteness:** `isCompleteScan() === true` (global catalog scan within bounded limits; 117 total jobs)

### 2.2 Piramal Pharma
```typescript
{
  companyName: 'Piramal Pharma',
  officialDomain: 'piramalpharma.wd102.myworkdayjobs.com',
  careersUrl: 'https://piramal.com/careers',
  atsType: 'WORKDAY',
  isActive: true,
  scanIntervalMinutes: 30,
  config: {
    host: 'piramalpharma.wd102.myworkdayjobs.com',
    tenant: 'piramalpharma',
    clientSite: 'PIRAMAL_EXTERNAL_CAREERS',
  },
}
```
- **Requisition ID Pattern:** `R\d{8}` (e.g., `R00004022`, `R00004460`)
- **Official Job URL Pattern:** `https://piramalpharma.wd102.myworkdayjobs.com/PIRAMAL_EXTERNAL_CAREERS/job/<title-slug>_<reqId>`
- **Scan Incompleteness:** `isCompleteScan() === true` (global catalog scan; 272 total jobs)

### 2.3 Elevance Health (Carelon Global Solutions)
```typescript
{
  companyName: 'Elevance Health',
  officialDomain: 'elevancehealth.wd1.myworkdayjobs.com',
  careersUrl: 'https://careers.elevancehealth.com',
  atsType: 'WORKDAY',
  isActive: true,
  scanIntervalMinutes: 30,
  config: {
    host: 'elevancehealth.wd1.myworkdayjobs.com',
    tenant: 'elevancehealth',
    clientSite: 'carelonglobal_in',
  },
}
```
- **Requisition ID Pattern:** `JR\d{6}` (e.g., `JR208922`, `JR207365`, `JR207490`)
- **Official Job URL Pattern:** `https://elevancehealth.wd1.myworkdayjobs.com/carelonglobal_in/job/<title-slug>_<reqId>`
- **Scan Incompleteness:** `isCompleteScan() === true` (dedicated India portal with 14 active requisitions)

### 2.4 Thomson Reuters
```typescript
{
  companyName: 'Thomson Reuters',
  officialDomain: 'thomsonreuters.wd5.myworkdayjobs.com',
  careersUrl: 'https://www.thomsonreuters.com/en/careers',
  atsType: 'WORKDAY',
  isActive: true,
  scanIntervalMinutes: 30,
  config: {
    host: 'thomsonreuters.wd5.myworkdayjobs.com',
    tenant: 'thomsonreuters',
    clientSite: 'external_career_site',
    appliedFacets: {
      Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
    },
  },
}
```
- **Requisition ID Pattern:** `JREQ\d{6}` (e.g., `JREQ199503`, `JREQ203312`, `JREQ202062`, `JREQ204042`)
- **Official Job URL Pattern:** `https://thomsonreuters.wd5.myworkdayjobs.com/external_career_site/job/<location-slug>/<title-slug>_<reqId>`
- **Scan Incompleteness:** `isCompleteScan() === false` (strictly protected against absence-based closure because it operates under declarative country facet filtering)

---

## 3. Inventory and Controlled Ingestion Accounting

| Employer | Raw Upstream Reported | Ingested in Test Run | Verified Active Jobs | Pending Verification | Closed Jobs | Notes |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Fractal Analytics** | 117 | 5 | 5 | 0 | 0 | Controlled limit: 5 jobs per test run. 100% verified. |
| **Omnissa** | N/A | 0 | 0 | 0 | 0 | Deferral maintained; 0 phantom records in DB. |
| **Piramal Pharma** | 272 | 5 | 5 | 0 | 0 | Controlled limit: 5 jobs per test run. 100% verified. |
| **Elevance Health** | 14 | 5 | 5 | 0 | 0 | Controlled limit: 5 jobs per test run. 100% verified. |
| **Thomson Reuters** | 36 (India) / 466 (Global) | 5 | 5 | 0 | 0 | Controlled limit: 5 jobs per test run. 100% verified. |

*Accounting Invariant:* Upstream counts represent raw postings reported by the employer's CXS search index. Stored database records are bounded, validated, and verified active through RoleRadar's verification pipeline.

---

## 4. Evidence of India-Based Openings & Graduate Roles

Empirical inspection of live postings confirmed actual India-based tech and corporate openings:

1. **Fractal Analytics**:
   - `Product Analytics Insights Leader` (Bengaluru, Karnataka)
   - `Account Growth Manager` (Gurgaon, Haryana)
   - `Senior Data Scientist / Consultant` (Mumbai, Maharashtra)
   - Evidence: Direct domestic hiring in AI and predictive analytics.

2. **Piramal Pharma**:
   - `Manager - Technical Services` (`R00004022`, Ennore, TN)
   - `Senior Research Scientist – R&D` (`R00004026`, Ennore, TN)
   - `Research Associate - AR&D` (`R00000604`, India R&D Center)
   - `Area Sales Officer` (`R00004460`, Chhattisgarh)
   - Evidence: Active pharmaceutical research and analytical chemistry openings in India.

3. **Elevance Health (Carelon Global Solutions)**:
   - `Software Engineer II (IND)` (`JR208922`, Bengaluru Bagmane Solarium City)
   - `Mainframe Testing - Senior QA Engineer II` (`JR207365`, Hyderabad / Gurugram)
   - `Enterprise Architecture - Senior Manager` (`JR207490`, Hyderabad)
   - Evidence: 100% of jobs hosted on `carelonglobal_in` are stationed at Indian global delivery centers.

4. **Thomson Reuters**:
   - `Senior Software Engineer - AI I` (`JREQ199503`, Hyderabad / Bengaluru)
   - `Lead Service Data Engineer` (`JREQ203312`, Bengaluru)
   - `Senior BI & AI Engineer` (`JREQ202062`, Hyderabad)
   - `Senior Manager, Technology Sourcing` (`JREQ204042`, Bengaluru)
   - `Senior Process Associate - U.S Tax (1040/1041)` (`JREQ201558`, Hyderabad)
   - Evidence: Substantial Indian engineering and data operations across Karnataka and Telangana.

*Rule Compliance:* Job experience classifications were not guessed or inferred from titles. RoleRadar's matching and experience engine parses detailed job requirements only when evaluating candidates.

---

## 5. Architectural Improvements

### Authoritative Requisition ID Extraction (`workday-collector.ts`)
Prior implementations extracted the first element of `posting.bulletFields`. While sufficient for tenants where `bulletFields: ['26WD100698']`, Thomson Reuters returned `bulletFields: ['Frisco; Eagan', 'Texas; Minnesota', 'JREQ204609']`, causing the city text to be incorrectly chosen as the job ID.

`extractJobReqId()` was upgraded with the following priority logic:
1. Scan `bulletFields` for an authoritative requisition token matching alphanumeric identifier format containing digits (e.g. `JREQ199503`, `SR-42743`, `R00004022`, `JR208922`), filtering out location strings containing spaces, commas, or semicolons.
2. Fall back to regex extraction from `externalPath` (e.g. `_JREQ199503`).
3. Fall back to first non-empty bullet field if no structured token matches.

This resolved requisition extraction across all multi-bullet Workday configurations while remaining 100% backward-compatible with all existing integrations.

---

## 6. Test Suite and Build Results

### 6.1 Test Summary
- **New Batch 2 Integration Suite (`phase20-5-batch2-expansion-integration.test.ts`):**
  - **26 passed / 26 total (100% green)**
  - Omnissa deferral and non-JSON maintenance response: Verified
  - Connectivity & health check for 4 admitted employers: 4/4 Verified
  - Bounded discovery & authoritative requisition IDs: 4/4 Verified
  - Phishing & aggregator URL rejection: 4/4 Verified
  - Full pipeline execution (candidate -> persisted -> verified ACTIVE): 4/4 Verified
  - Scan idempotency (0 duplicates on repeat scan): 4/4 Verified
  - Complete vs incomplete scan semantics: 4/4 Verified
  - Clean test data teardown in `afterAll`: 4/4 Verified

- **Existing Workday Integration Suite (`phase20-5-four-employers-integration.test.ts`):**
  - **24 passed / 24 total (100% green)** (LSEG, Stryker, KONE, Aptiv regression verified)

- **Post-Integration Security Audit (`post-integration-security-audit.test.ts`):**
  - **59 passed / 59 total (100% green)**

- **Full Backend Test Suite (`npm run test`):**
  - **62 passed / 62 test files (100% green)**
  - **952 passed / 952 tests (100% green)**

- **Integration Test Suite (`npm run test:integration`):**
  - **5 passed / 5 test files (100% green, 24 tests)**

- **TypeScript Compilation:**
  - `npm run build` (`tsc`): **Exit Code 0, 0 errors**

### 6.2 Production Safety Invariants Maintained
- **Zero Real Notifications:** Alert service mocked during all test executions. No real emails dispatched.
- **Idempotency:** Re-running discovery on identical upstream candidates created 0 duplicate database entries.
- **Absence Closure Safety:** Thomson Reuters correctly marked `isCompleteScan() === false`, preventing absence-based closure of uncollected roles.
- **No Aggregator URLs:** Every persisted job references the direct Workday career domain.

---

## 7. Catalog & Database Changes

### Catalog (`catalog.ts`)
- Added **Fractal Analytics** (`fractal.wd1.myworkdayjobs.com`)
- Added **Piramal Pharma** (`piramalpharma.wd102.myworkdayjobs.com`)
- Added **Elevance Health** (`elevancehealth.wd1.myworkdayjobs.com`)
- Added **Thomson Reuters** (`thomsonreuters.wd5.myworkdayjobs.com`)
- Total active catalog sources increased from 121 to **125**.

### Database Seeding (`companies` table)
- Run dynamically via `seedSources()`.
- Four new company records added with UUIDs, correct `official_domain`, `careers_url`, and `source_config`.
- Zero duplicate company records created.

---

## 8. Concise Next-Employer Shortlist

Drawn from the remaining un-integrated eligible candidates in `Workday ATS Employer Discovery.pdf` and its reconciliation report (excluding candidates already integrated or blocked):

1. **Danaher Corporation**
   - Host: `danaher.wd1.myworkdayjobs.com`
   - Client site: `DanaherJobs`
   - Official careers URL: `https://jobs.danaher.com`
   - Notes: Conglomerate with ~174 active India engineering and life-science positions.

2. **Nationwide**
   - Host: `nationwide.wd1.myworkdayjobs.com`
   - Client site: `Nationwide_Career_India`
   - Official careers URL: `https://nationwide.com/careers`
   - Notes: Dedicated India career site for Mindspace Madhapur Hyderabad tech center.

3. **AML RightSource**
   - Host: `amlrightsource.wd1.myworkdayjobs.com`
   - Client site: `amlrightsource`
   - Official careers URL: `https://amlrightsource.com/careers`
   - Notes: Financial compliance and tech operations in Gurugram and Noida.

4. **Dentsu Aegis**
   - Host: `dentsuaegis.wd3.myworkdayjobs.com`
   - Client site: `DAN_GLOBAL`
   - Official careers URL: `https://dentsu.com/careers`
   - Notes: Digital commerce network with ~144 India positions.

5. **Ares Management**
   - Host: `aresmgmt.wd1.myworkdayjobs.com`
   - Client site: `External`
   - Official careers URL: `https://aresmgmt.com/careers`
   - Notes: Alternative asset manager with ~45 finance and legal positions in Mumbai.

---

## 9. Conclusion

Phase 20.5 Batch 2 has been completed with high technical fidelity. Four high-value employers with active India operations were integrated into RoleRadar without introducing regressions or unsafe state changes. Omnissa was documented and deferred safely due to upstream Workday maintenance redirect behavior. The entire codebase builds cleanly and passes all test suites.
