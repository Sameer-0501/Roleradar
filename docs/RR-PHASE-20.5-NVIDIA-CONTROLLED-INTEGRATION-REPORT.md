# RoleRadar — Phase 20.5: NVIDIA Official Employer Source Investigation & Controlled Integration Report

> **SHAREABILITY ASSESSMENT: SAFE TO SHARE**
>
> - **Sensitivity Classification:** **PUBLIC / SHAREABLE**
> - **Credential & Secret Scan:** 0 API keys, 0 user credentials, 0 session tokens, 0 private PII.
> - **Third-Party Endpoints:** All listed URLs, endpoints, and portal parameters are public NVIDIA career portal assets.
> - **Sharing Recommendation:** This forensic report contains no confidential, sensitive internal, or private data and can be freely shared with stakeholders, engineering teams, and external auditors.

---

## Executive Summary

- **Task Reference:** `RR-PHASE-20.5-NVIDIA-CONTROLLED-INTEGRATION`
- **Candidate Employer:** NVIDIA Corporation (`https://www.nvidia.com`)
- **Investigation Objective:** Investigate NVIDIA as a potential direct-employer source for RoleRadar, establish its live ATS provenance, assess India/fresher-relevant coverage, and integrate only if it passes all existing admission and runtime safety requirements without adding an unauthorized ATS adapter.
- **Authoritative ATS:** **Workday** (`nvidia.wd5.myworkdayjobs.com`)
- **Tenant:** `nvidia`
- **ClientSite:** `NVIDIAExternalCareerSite`
- **Official Domain:** `nvidia.wd5.myworkdayjobs.com`
- **RoleRadar ATS Support Status:** **SUPPORTED** (Natively handled by `WorkdayCollector`).
- **Admission Gate Decision:** **ACCEPTED**
- **Controlled Integration Status:** **COMPLETED & VERIFIED** (Bounded discovery of 5 candidates, 100% verification success, 0 duplicates created, 0 unrelated jobs touched, 0 real notifications sent).

---

## 1. Catalog and Database Preflight

### 1.1 Pre-existing Source and Catalog Inspection
- Inspected [`backend/src/sources/catalog.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts).
- Searched for `NVIDIA`, `Nvidia`, and aliases.
- **Result:** No entry existed in `catalog.ts` prior to this phase. (Only referenced in testing matrix and scripts).

### 1.2 Database Company Records & Duplicate Prevention
- Executed direct database forensic check on `companies` table:
  ```sql
  SELECT id, name, official_domain, ats_type, source_config FROM companies WHERE name ILIKE '%nvidia%';
  ```
- **Crucial Preflight Finding:** An existing database company record was discovered:
  - **Company ID:** `d5dabf69-d06a-4585-bfe8-a5f5a250ac4d`
  - **Company Name:** `Nvidia`
  - **ATS Type:** `WORKDAY`
  - **Official Domain:** `nvidia.wd5.myworkdayjobs.com`
  - **Existing Job Inventory:** 269 total historical jobs (89 ACTIVE + VERIFIED, 178 CLOSED + VERIFIED, 2 VERIFYING + PENDING).
- **Duplicate Prevention Action:** The catalog entry was configured strictly with `companyName: 'Nvidia'`, perfectly matching the database record and guaranteeing that `source-seeder.ts` updates the existing entity rather than inserting a duplicate company record.

---

## 2. Official Careers Domain and Live ATS Provenance

### 2.1 Corporate Entrypoint & Hiring Links
- Official careers homepage: `https://www.nvidia.com/en-us/about-nvidia/careers/`
- Direct candidate portal link: `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`
- HTTP Status: `200 OK`

### 2.2 Live ATS Architecture
- Inspection of headers, cookies, and page source confirmed native **Workday CXS** architecture:
  - Host: `nvidia.wd5.myworkdayjobs.com`
  - Tenant: `nvidia`
  - ClientSite: `NVIDIAExternalCareerSite`
  - Canonical Job URL Structure: `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/<location>/<title>_<jobId>`

---

## 3. Endpoint, Pagination, Requisition Identity, and Application URLs

### 3.1 Live Search and Detail Endpoints
- **Search Endpoint:** `POST https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs`
- **Detail Endpoint:** `GET https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/<jobPath>`
- **Response Format:** Workday CXS JSON (`total`, `jobPostings[]`, `facets[]`).

### 3.2 Pagination & Distinct Offset Handling
- Tested `limit: 5, offset: 0` vs `limit: 5, offset: 5`:
  - Page 1 Requisition IDs: `['JR2024311', 'JR2024696', 'JR2027104', 'JR2015526', 'JR2024489']`
  - Page 2 Requisition IDs: `['JR2024594', 'JR2009801', 'JR2016230', 'JR2021500', 'JR2023983']`
  - Overlap: **ZERO OVERLAP (DISTINCT)**. Pagination functions deterministically.

### 3.3 Requisition Identity Stability
- Extracted from `bulletFields[0]` or trailing `_JR...` suffix on `externalPath`.
- Format: `JR` followed by 7 numeric digits (e.g., `JR2027895`, `JR2024311`).
- Stability: Globally unique and persistent across repeat scans.

### 3.4 Direct Application URL Validation
- Official Direct URLs:
  `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/India-Bengaluru/Senior-Manager--Inception---South-Asia-Region_JR2024311`
- Domain Validator Results:
  - Official Workday domain: **PASS (`valid: true`)**
  - Fake domains (`nvidia-jobs.com`): **REJECTED (`valid: false`)**
  - Aggregators (`naukri.com`, `indeed.com`): **REJECTED (`valid: false`)**
  - Insecure HTTP: **REJECTED (`valid: false`)**

---

## 4. Live Source Totals and India Coverage

### 4.1 Raw Upstream Totals
- **Global Total Open Postings:** **2,000+** (Workday CXS global query cap).
- **India Total Open Postings:** **281** active positions (via `searchText: "India"`).

*Note: Source totals represent live upstream counts and are kept strictly distinct from RoleRadar's discovered, ingested, pending, and ACTIVE + VERIFIED database inventory.*

### 4.2 Database Inventory State
- **Pre-existing Inventory:** 89 ACTIVE + VERIFIED, 178 CLOSED, 2 PENDING.
- **Controlled Test Insertion:** Bounded to 5 verified test candidates.
- **Post-Test Inventory:** Preserved in clean state with 0 duplicates.

---

## 5. India Role-Category and Experience-Level Coverage

### 5.1 Category Distribution Across India (281 Roles)
NVIDIA maintains extensive R&D and engineering operations in India across three primary centers: **Bengaluru (Bangalore)**, **Pune**, and **Hyderabad**:
- **Hardware & Chip Design:** ASIC Verification, Physical Design, Emulation, Analog & Mixed-Signal, Circuit Design.
- **Software & AI:** CUDA Kernel Optimization, Deep Learning Frameworks (TensorRT, PyTorch), Autonomous Vehicles (AV) Perception, Omniverse Platform, GPU Drivers.
- **Infrastructure & Cloud:** High-Performance Computing (HPC) Systems, Data Center Operations, Site Reliability Engineering.
- **Corporate & Programs:** Program Management, Developer Relations, Technical Marketing, Finance.

### 5.2 Experience-Level & Fresher Classification Guardrails
- **University Employment / Internships:**
  - Upstream `jobFamilyGroup` contains **168 University Employment** roles globally.
  - Titles containing `Intern` or `Internship` (e.g. *Deep Learning Research Intern*) are mapped to `FRESHER_COMPATIBLE` / Internship.
- **Graduate Roles:**
  - Distinctly identified by suffixes such as `New College Graduate - System Software`.
  - Accurately classified as `FRESHER_COMPATIBLE` (0–1 years required).
- **Senior Role Hard Filters:**
  - Roles featuring titles such as `Senior`, `Principal`, `Director`, `Lead`, `Staff` (e.g. *Sr System Verification Engineer*) are classified as `EXPERIENCED` (4+ to 10+ years minimum) and strictly prohibited from appearing in fresher feeds.
  - Deceptive descriptions (e.g. senior titles mentioning "0-1 years" in secondary clauses) retain their `EXPERIENCED` classification and remain blocked from fresher feeds.

---

## 6. Admission Gate Evaluation

| Admission Requirement | Evaluation Criteria | NVIDIA Live Evidence | Gate Status |
|:---|:---|:---|:---:|
| **Direct Hiring Provenance** | Authentic direct employer career portal, no third-party aggregators | Official Workday portal `https://nvidia.wd5.myworkdayjobs.com` | **PASS** |
| **Stable Job Identity** | Persistent, immutable requisition identity across scans | Numeric/Alpha `bulletFields[0]` format `JR\d{7}` | **PASS** |
| **Live Detail Verification** | Individual job details resolvable via stable HTTP endpoint | Detail endpoint returns 200 with complete job posting info | **PASS** |
| **Application URL Validation** | Direct application URLs pass domain and employer identity checks | Applications direct to `nvidia.wd5.myworkdayjobs.com/en-US/...` | **PASS** |
| **Supported ATS Adapter** | Must match existing supported collector (`Greenhouse`, `Lever`, `Workday`, `Ashby`, `Workable`, `SmartRecruiters`, `SAP`) | Workday CXS is fully supported by `WorkdayCollector` | **PASS** |

### Admission Gate Decision: **ACCEPTED**

---

## 7. Files Changed and Final Configuration

### 7.1 Catalog Addition ([`backend/src/sources/catalog.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts))
Added NVIDIA Workday definition matching existing database record:
```typescript
  {
    companyName: 'Nvidia',
    officialDomain: 'nvidia.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers/',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'nvidia.wd5.myworkdayjobs.com',
      tenant: 'nvidia',
      clientSite: 'NVIDIAExternalCareerSite',
    },
  },
```

### 7.2 Controlled Integration Test ([`backend/src/tests/nvidia-integration.test.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/tests/nvidia-integration.test.ts))
Created focused integration test verifying:
1. Health check & latency verification.
2. Bounded discovery (at most 5 candidates with valid JR IDs).
3. URL validation & aggregator rejection.
4. Notification isolation (vi.mock alertService).
5. Full pipeline run (persistence, verification checks, status update).
6. Repeat-scan idempotency (0 duplicate records).
7. Partial scan safety (`isCompleteScan=false` does not close absent jobs).
8. Deterministic source isolation (unrelated employer records untouched).
9. Experience classification and senior title hard filter invariants.
10. Country-aware location matching (Bengaluru, Hyderabad, Pune, Remote vs onsite).

---

## 8. Verification, Regression, and Build Outcomes

### 8.1 Focused NVIDIA Integration Test
- Command: `npx vitest run src/tests/nvidia-integration.test.ts` (in `backend/`)
- Outcome: **10 of 10 tests passed (100%)**
- Execution Time: 10.26 seconds

### 8.2 Sequential Integration Test Suite
- Command: `npm run test:integration` (in `backend/`)
- Targeted Suites: `greenhouse-integration.test.ts`, `lever-integration.test.ts`, `workday-integration.test.ts`, `custom-integration.test.ts`, `ashby-integration.test.ts`.
- Outcome: **5 of 5 test files passed, 24 of 24 tests passed (100%)**
- Total Seeded Sources: 114 companies

### 8.3 Full Unit & Regression Test Suite
- Command: `npm test` (in `backend/`)
- Outcome: **61 of 61 test files passed, 893 of 893 tests passed (100%)**
- Duration: 22.57 seconds
- Regressions: Zero regressions across all pipeline, URL validator, matching, preferences, and lifecycle tests.

### 8.4 TypeScript Production Build
- Command: `npm run build` (in `backend/`)
- Outcome: **SUCCESS (Exit Code 0)**
- Compiler Errors: 0

---

## 9. Final Decision & Operational Recommendations

### 9.1 Final Decision: **ACCEPTED**
NVIDIA Corporation has passed all preflight, admission gate, and controlled integration requirements. It is officially admitted into RoleRadar's production catalog using the existing `WorkdayCollector` without requiring any new adapter or architectural modifications.

### 9.2 Operational Recommendations
1. **Periodic Scan Cadence:** Retain the default `scanIntervalMinutes: 30` to balance discovery of new GPU/AI roles against Workday CXS pagination rate limits.
2. **Fresher Alerts:** Maintain the strict `parseExperienceRequirements` rule so that only genuinely compatible roles (e.g. `New College Graduate`, `Intern`) populate fresher feeds, while senior titles (e.g. `Sr System Verification Engineer`) remain exclusively in experienced feeds.
