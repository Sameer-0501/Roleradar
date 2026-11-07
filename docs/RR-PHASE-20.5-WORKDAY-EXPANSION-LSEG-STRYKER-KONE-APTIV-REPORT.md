# RoleRadar — Phase 20.5 Consolidated Workday Employer Expansion Report (LSEG, Stryker, KONE & Aptiv)

> 🛡️ **SHAREABILITY ASSESSMENT: SAFE TO SHARE**  
> **Status:** `SAFE TO SHARE`  
> **Details:** This document contains technical integration benchmarks, empirical test results, and public Workday career portal configurations. No sensitive credentials, API keys, database secrets, internal tokens, or personal identifiers are present.

---

## Executive Summary

| Candidate Employer | ATS Host & Client Site | Upstream India Postings | Facet Parameter & ID | Integration Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **LSEG (London Stock Exchange Group)** | `lseg.wd3.myworkdayjobs.com` / `Careers` | **209 live postings** | `locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e']` | **`INTEGRATED`** |
| **Stryker** | `stryker.wd1.myworkdayjobs.com` / `StrykerCareers` | **84 live postings** | `Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e']` | **`INTEGRATED`** |
| **KONE** | `kone.wd3.myworkdayjobs.com` / `Careers` | **47 live postings** | `Country: ['c4f78be1a8f14da0ab49ce1162348a5e']` | **`INTEGRATED`** |
| **Aptiv** | `aptiv.wd5.myworkdayjobs.com` / `APTIV_CAREERS` | **135 live postings** | `Country: ['c4f78be1a8f14da0ab49ce1162348a5e']` | **`INTEGRATED`** |

All four candidates were investigated, validated via live endpoints, configured with verified declarative facets, tested with full pipeline discovery and verification, and successfully registered into RoleRadar's active source catalog and scheduler.

---

## 1. Candidate Investigation & Verified Configurations

### 1. LSEG (London Stock Exchange Group)
- **Entity**: London Stock Exchange Group plc (Global Financial Markets Infrastructure & Data)
- **Official Careers Page**: `https://lseg.com/careers`
- **Workday Tenant Host**: `lseg.wd3.myworkdayjobs.com`
- **Client Site**: `Careers`
- **Tenant**: `lseg`
- **Live Endpoint**: `https://lseg.wd3.myworkdayjobs.com/wday/cxs/lseg/Careers/jobs`
- **Upstream Volume (Dynamic Snapshot)**:
  - Global Total: **665 postings**
  - India Faceted Pool: **209 postings** (Bengaluru, Hyderabad)
- **Declarative Facet Configuration**:
  ```typescript
  appliedFacets: {
    locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
  }
  ```
  *(Note: LSEG nests `locationCountry` under its `locationMainGroup` hierarchy, but accepts `locationCountry` directly in `appliedFacets`.)*
- **Requisition Identity Pattern**: `R\d+` (e.g., `R0122760`, `R0123636`, `R0121953`)
- **Direct Application URL Format**:
  `https://lseg.wd3.myworkdayjobs.com/Careers/job/{Location-Slug}/{Title-Slug}_{ReqId}`
- **Role Diversity & Experience Profile**:
  - Content Infrastructure Owner, Reporting & Data Operations, Software Engineering (C++, Java, .NET).
  - Fresher / Junior viability: Graduate quality engineering and content associate positions in Bengaluru and Hyderabad.

### 2. Stryker
- **Entity**: Stryker Corporation (Medical Technologies & Healthcare Systems)
- **Official Careers Page**: `https://careers.stryker.com`
- **Workday Tenant Host**: `stryker.wd1.myworkdayjobs.com`
- **Client Site**: `StrykerCareers`
- **Tenant**: `stryker`
- **Live Endpoint**: `https://stryker.wd1.myworkdayjobs.com/wday/cxs/stryker/StrykerCareers/jobs`
- **Upstream Volume (Dynamic Snapshot)**:
  - Global Total: **1,472 postings**
  - India Faceted Pool: **84 postings** (Gurugram Stryker Global Technology Center - SGTC)
- **Declarative Facet Configuration**:
  ```typescript
  appliedFacets: {
    Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
  }
  ```
- **Requisition Identity Pattern**: `R\d+` (e.g., `R575176`, `R574210`)
- **Direct Application URL Format**:
  `https://stryker.wd1.myworkdayjobs.com/StrykerCareers/job/{Location-Slug}/{Title-Slug}_{ReqId}`
- **Role Diversity & Experience Profile**:
  - Medical device software automation, QA test engineering (Playwright/C#), embedded firmware.
  - Fresher / Junior viability: Software test engineering and data analyst associate openings at Gurugram SGTC.

### 3. KONE
- **Entity**: KONE Corporation (Elevators, Escalators & Smart Building Flow)
- **Official Careers Page**: `https://kone.com/careers`
- **Workday Tenant Host**: `kone.wd3.myworkdayjobs.com`
- **Client Site**: `Careers`
- **Tenant**: `kone`
- **Live Endpoint**: `https://kone.wd3.myworkdayjobs.com/wday/cxs/kone/Careers/jobs`
- **Upstream Volume (Dynamic Snapshot)**:
  - Global Total: **918 postings**
  - India Faceted Pool: **47 postings** (Chennai, Kalyan, Mumbai, Pune, Pan-India)
- **Declarative Facet Configuration**:
  ```typescript
  appliedFacets: {
    Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
  }
  ```
- **Requisition Identity Pattern**: `R\d+` (e.g., `R0663359`, `R0665495`)
- **Direct Application URL Format**:
  `https://kone.wd3.myworkdayjobs.com/Careers/job/{Location-Slug}/{Title-Slug}_{ReqId}`
- **Role Diversity & Experience Profile**:
  - Technical Service Engineers, Maintenance Specialists, R&D Mechanical & Electrical Engineers.
  - Fresher / Junior viability: Junior Executive Maintenance, Graduate Trainees, and field service apprentice roles.

### 4. Aptiv
- **Entity**: Aptiv PLC (Automotive Technology, Autonomous Mobility & Electrical Architectures)
- **Official Careers Page**: `https://aptiv.com/careers`
- **Workday Tenant Host**: `aptiv.wd5.myworkdayjobs.com`
- **Client Site**: `APTIV_CAREERS`
- **Tenant**: `aptiv`
- **Live Endpoint**: `https://aptiv.wd5.myworkdayjobs.com/wday/cxs/aptiv/APTIV_CAREERS/jobs`
- **Upstream Volume (Dynamic Snapshot)**:
  - Global Total: **801 postings**
  - India Faceted Pool: **135 postings** (Bengaluru, Pune)
- **Declarative Facet Configuration**:
  ```typescript
  appliedFacets: {
    Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
  }
  ```
- **Requisition Identity Pattern**: `J\d+` (e.g., `J000705057`, `J000705138`, `J000705502`)
- **Direct Application URL Format**:
  `https://aptiv.wd5.myworkdayjobs.com/APTIV_CAREERS/job/{Location-Slug}/{Title-Slug}_{ReqId}`
- **Role Diversity & Experience Profile**:
  - Embedded Software (C/C++), AUTOSAR, ECAD layout design, functional safety testing.
  - Fresher / Junior viability: Junior financial analysts and junior software verification engineers.

---

## 2. Scan-Closure Safety & Incomplete Scan Safeguards

### Incomplete-Scan Guarantee
All four newly integrated employers configure `appliedFacets` in `backend/src/sources/catalog.ts`.
By contract:
1. `WorkdayCollector.isCompleteScan()` evaluates to `false`:
   ```typescript
   public isCompleteScan(): boolean {
     return !this.config.appliedFacets || Object.keys(this.config.appliedFacets).length === 0;
   }
   ```
2. In `backend/src/scheduler/scheduler.ts`, `isCompleteScan` is dynamically evaluated and passed to `runPipeline(candidates, companyId, sourceConfig, isCompleteScan)`.
3. In `backend/src/pipeline/pipeline.ts`:
   ```typescript
   if (isCompleteScan) {
     const closedCount = await reconcileAbsentJobs(companyId, seenJobIds);
     stats.closed = closedCount;
   }
   ```
4. **Result**: Scoped scans for LSEG, Stryker, KONE, and Aptiv **cannot trigger absence-based closure**. Pre-existing jobs from other regions or untargeted business units are permanently protected against accidental deletion or premature closure.

---

## 3. Controlled Integration & Runtime Acceptance Evidence

### Automated Test Suite: `phase20-5-four-employers-integration.test.ts`
A dedicated 24-test integration suite was authored and executed with live CXS network connectivity:

| Employer | Test Description | Assertions & Behavior Verified | Status |
| :--- | :--- | :--- | :--- |
| **LSEG** | Health check & connectivity | CXS returned HTTP 200, latency ~1.7s | **PASSED** |
| **LSEG** | `isCompleteScan()` contract | Evaluated to `false` (regional scan protection) | **PASSED** |
| **LSEG** | Bounded candidate discovery | Retrieved 5 valid India jobs; IDs match `R\d+` | **PASSED** |
| **LSEG** | URL validation & security | Validated `lseg.wd3.myworkdayjobs.com`; rejected aggregators | **PASSED** |
| **LSEG** | Pipeline persistence & verification | 5 jobs persisted to PostgreSQL and verified `ACTIVE` | **PASSED** |
| **LSEG** | Repeat-scan idempotency | Re-running scan created **0 duplicate jobs** | **PASSED** |
| **Stryker** | Health check & connectivity | CXS returned HTTP 200, latency ~1.5s | **PASSED** |
| **Stryker** | `isCompleteScan()` contract | Evaluated to `false` (regional scan protection) | **PASSED** |
| **Stryker** | Bounded candidate discovery | Retrieved 5 valid India jobs; IDs match `R\d+` | **PASSED** |
| **Stryker** | URL validation & security | Validated `stryker.wd1.myworkdayjobs.com`; rejected aggregators | **PASSED** |
| **Stryker** | Pipeline persistence & verification | 5 jobs persisted to PostgreSQL and verified `ACTIVE` | **PASSED** |
| **Stryker** | Repeat-scan idempotency | Re-running scan created **0 duplicate jobs** | **PASSED** |
| **KONE** | Health check & connectivity | CXS returned HTTP 200, latency ~1.3s | **PASSED** |
| **KONE** | `isCompleteScan()` contract | Evaluated to `false` (regional scan protection) | **PASSED** |
| **KONE** | Bounded candidate discovery | Retrieved 5 valid India jobs; IDs match `R\d+` | **PASSED** |
| **KONE** | URL validation & security | Validated `kone.wd3.myworkdayjobs.com`; rejected aggregators | **PASSED** |
| **KONE** | Pipeline persistence & verification | 5 jobs persisted to PostgreSQL and verified `ACTIVE` | **PASSED** |
| **KONE** | Repeat-scan idempotency | Re-running scan created **0 duplicate jobs** | **PASSED** |
| **Aptiv** | Health check & connectivity | CXS returned HTTP 200, latency ~1.6s | **PASSED** |
| **Aptiv** | `isCompleteScan()` contract | Evaluated to `false` (regional scan protection) | **PASSED** |
| **Aptiv** | Bounded candidate discovery | Retrieved 5 valid India jobs; IDs match `J\d+` | **PASSED** |
| **Aptiv** | URL validation & security | Validated `aptiv.wd5.myworkdayjobs.com`; rejected aggregators | **PASSED** |
| **Aptiv** | Pipeline persistence & verification | 5 jobs persisted to PostgreSQL and verified `ACTIVE` | **PASSED** |
| **Aptiv** | Repeat-scan idempotency | Re-running scan created **0 duplicate jobs** | **PASSED** |

**Summary**: 24 tests run, **24 passed (100%)** in 51.94s.

### Notification Suppression
Alert service evaluation methods (`evaluateAndCreateInstantAlerts` and `evaluateAndCreateRecentJobAlerts`) were completely mocked using Vitest spies. **Zero real email notifications were generated.**

---

## 4. Regression & Production Build Checks

| Test Suite / Command | Execution Scope | Result | Empirical Proof |
| :--- | :--- | :--- | :--- |
| **Phase 20.5 4-Employer Integration** | `npx vitest run src/tests/phase20-5-four-employers-integration.test.ts` | **24 / 24 PASSED** | 100% pass across LSEG, Stryker, KONE, Aptiv |
| **Phase 20.5 Prior Expansion** | `npx vitest run src/tests/phase20-5-expansion-integration.test.ts` | **10 / 10 PASSED** | 100% pass across State Street & Cushman & Wakefield |
| **Airbus Integration** | `npx vitest run src/tests/airbus-integration.test.ts` | **12 / 12 PASSED** | 100% pass across Airbus Workday India & Europe |
| **Full Backend Regression Suite** | `npm test` | **61 / 61 Files PASSED (893 / 893 tests)** | Zero regression across lifecycle, matching, and collectors |
| **Production TypeScript Build** | `npm run build` (`tsc`) | **EXIT CODE 0** | Clean compile; zero type or export errors |

---

## 5. Catalog, Database & Scheduler Baselines

### Exact Post-Integration Metrics
- **Catalog Sources in `catalog.ts`**: **121 sources** (up from 117).
  - Workday: **17 sources** (Airbus, State Street, Cushman & Wakefield, LSEG, Stryker, KONE, Aptiv, Nvidia, CrowdStrike, Micron, Autodesk, Adobe, Accenture, HPE, JLL, Salesforce, Schneider Electric)
  - SmartRecruiters: 22 sources
  - Greenhouse: 45 sources
  - Lever: 23 sources
  - Ashby / Custom: 14 sources
- **Companies in PostgreSQL**: **132 records** (121 catalog employers + 11 test fixture companies).
  - `LSEG`: `322646e4-47d2-4873-947e-9d70a770afe8`
  - `Stryker`: `6cc2a38f-7133-40e0-8863-509c0790d5bb`
  - `KONE`: `c40b0812-e673-4fba-ac2b-e90ca586cfcb`
  - `Aptiv`: `535211c8-361d-43f7-9936-4958e0b36993`
- **Scheduler Engine State (`/api/jobs/engine/sources/health`)**:
  All **121 sources** registered and actively tracked by the scheduling loop with 0 consecutive failure states.

---

## 6. Candidates Deferred & Concrete Rationale

No candidates from the assigned four (LSEG, Stryker, KONE, Aptiv) were deferred. All four passed every technical, provenance, and runtime acceptance gate.

---

## 7. Final Verdict

### `ACCEPTED`

- **LSEG**: `INTEGRATED` (209 upstream India postings verified)
- **Stryker**: `INTEGRATED` (84 upstream India postings verified)
- **KONE**: `INTEGRATED` (47 upstream India postings verified)
- **Aptiv**: `INTEGRATED` (135 upstream India postings verified)
- **Total Combined Live India Postings Added**: **475 positions**
- **Catalog Baseline**: 121 active direct-employer sources
- **All Automated Integration & Regression Suites**: 100% Passed
- **TypeScript Production Build**: Passing (Exit code 0)
