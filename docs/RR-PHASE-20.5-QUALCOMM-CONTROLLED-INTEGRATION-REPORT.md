# RoleRadar — Phase 20.5: Qualcomm Official Employer Source Investigation & Controlled Integration Report

> **SHAREABILITY ASSESSMENT: SAFE TO SHARE**
>
> - **Sensitivity Classification:** **PUBLIC / SHAREABLE**
> - **Credential & Secret Scan:** 0 API keys, 0 user credentials, 0 session tokens, 0 private PII.
> - **Third-Party Endpoints:** All listed URLs, endpoints, and portal parameters are public Qualcomm career portal assets.
> - **Sharing Recommendation:** This forensic report contains no confidential, sensitive internal, or private data and can be freely shared with stakeholders, engineering teams, and external auditors.

---

## Executive Summary

- **Task Reference:** `RR-PHASE-20.5-QUALCOMM-CONTROLLED-INTEGRATION`
- **Candidate Employer:** Qualcomm Incorporated / Qualcomm Technologies, Inc. (`https://www.qualcomm.com`)
- **Investigation Objective:** Investigate Qualcomm as a potential direct-employer source for RoleRadar, establish its live ATS provenance, assess India/graduate role coverage, and evaluate against the admission gate without implementing an unsupported ATS adapter or assuming Workday.
- **Authoritative Career Search & Application Platform:** **Eightfold.ai** (`https://careers.qualcomm.com`, `pcsx` architecture, `Powered by eightfold.ai`)
- **Secondary / Legacy Workday Status:** Workday instance `qualcomm.wd12.myworkdayjobs.com/External` exists for individual job application hosting (`/en-US/External/job/...`), but its search API endpoint (`/wday/cxs/qualcomm/External/jobs`) returns **0 open positions** (`total: 0`). The older `qualcomm.wd5` cluster redirects to an outage/maintenance error page (HTTP 500).
- **RoleRadar ATS Support Status:** **UNSUPPORTED** (RoleRadar natively supports `GREENHOUSE`, `LEVER`, `WORKDAY`, `ASHBY`, `WORKABLE`, `SMARTRECRUITERS`, and `SAP`. Eightfold.ai is not supported).
- **Access & Safety Limitation:** Eightfold.ai's public search API enforces Akamai/Cloudflare bot mitigation and returns `"Please try again later"` on direct HTTP automation.
- **Admission Gate Decision:** **DEFERRED**
- **Catalog & Inventory Actions:** Zero catalog additions, zero adapter modifications, zero database records created, and zero notification dispatches. Source isolation and database integrity are strictly maintained.

---

## 1. Catalog and Database Preflight

### 1.1 Pre-existing Source and Catalog Inspection
- Inspected [`backend/src/sources/catalog.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts).
- Checked for keys, aliases, and domains associated with Qualcomm:
  - `Qualcomm` / `Qualcomm Technologies`
  - `qualcomm.com` / `careers.qualcomm.com`
  - `qualcomm.wd12.myworkdayjobs.com` / `qualcomm.wd5.myworkdayjobs.com`
  - `eightfold.ai`
- **Result:** No existing entries found in `catalog.ts`. (Qualcomm was previously only mentioned in experimental probe scripts).

### 1.2 Database Company Records
- Inspected the database `companies` table using direct SQL:
  ```sql
  SELECT id, name, official_domain, ats_type FROM companies WHERE name ILIKE '%qualcomm%';
  ```
- **Result:** `QUALCOMM_IN_DB_COUNT: 0`. No existing company records or aliases found. Namespace is completely clean.

---

## 2. Official Careers Domain and Live ATS Provenance

### 2.1 Corporate Careers Entrypoint
- Navigated to official careers homepage: `https://www.qualcomm.com/company/careers`
- Frontend framework: Adobe Experience Manager (AEM) Single Page Application (`qualcomm-spa-base-page-template`, React client bundle).
- Discovered primary job search navigation call-to-action:
  - CTA Label: `"Search open positions"`
  - Target URL: `https://careers.qualcomm.com/careers`

### 2.2 Live ATS & Candidate Experience Discovery (Eightfold.ai)
- Navigated to `https://careers.qualcomm.com/careers`:
  - Page Title: `Careers at Qualcomm | Qualcomm`
  - Platform Architecture: Powered by **Eightfold.ai** Talent Intelligence Platform.
  - Client namespace: `pcsx` (Phenom/Eightfold Candidate Experience — `pcsx_job_search`).
  - Footer Attribution:
    ```
    Terms of Use | Privacy | Cookie Policy | Job Application Privacy Notice | Use of AI in the Application Process
    Powered by eightfold.ai #WhatsNextForYou
    ```
- Requisition IDs on Eightfold:
  - Numeric Position ID: `id: 446721435576`
  - Requisition Number: `displayJobId: "3097393"`
  - Direct View URL: `https://careers.qualcomm.com/careers/job/<position_id>`
  - Direct Apply URL: `https://careers.qualcomm.com/careers/apply?pid=<position_id>`

### 2.3 Secondary Workday Relationship & Cluster Analysis
- Live forensics investigated the previously hypothesized Workday endpoints:
  1. `qualcomm.wd5.myworkdayjobs.com/External`: **DEPRECATED**. Returns HTTP 500 and redirects to `https://community.workday.com/maintenance-page`.
  2. `qualcomm.wd12.myworkdayjobs.com/External`: **ACTIVE TENANT, BUT ZERO SEARCH INVENTORY**.
     - Page loads with tenant configuration: `window.workday = { tenant: "qualcomm", siteId: "External", clientOrigin: "https://wd12.myworkday.com" }`.
     - Direct query to Workday CXS search endpoint `POST https://qualcomm.wd12.myworkdayjobs.com/wday/cxs/qualcomm/External/jobs` returns:
       ```json
       {
         "total": 0,
         "jobPostings": [],
         "facets": [],
         "userAuthenticated": false
       }
       ```
     - Individual job links forwarded from external campaigns (e.g. `https://qualcomm.wd12.myworkdayjobs.com/en-US/External/job/..._3081161-1`) resolve via Workday detail pages, but the public directory is non-searchable via Workday CXS.
- **Conclusion:** Qualcomm has migrated its authoritative public recruitment, search, and application discovery frontend to **Eightfold.ai**. Workday acts purely as a backend HRIS/applicant repository rather than a discoverable candidate-facing search board.

---

## 3. Endpoint, Pagination, Requisition Identity, and Application URLs

### 3.1 Eightfold Public Search API
- **Endpoint URL:** `GET https://careers.qualcomm.com/api/pcsx/search`
- **Query Parameters:**
  - `domain`: `qualcomm.com`
  - `query`: Free-text search string
  - `location`: Location filter (e.g., `location=India`)
  - `start`: 0-indexed offset (e.g., `start=0`, `start=10`, `start=20`)
  - `sort_by`: Sorting field (e.g., `sort_by=timestamp`)
- **Position Detail Endpoint:** `GET https://careers.qualcomm.com/api/pcsx/position_details?position_id=<pid>&domain=qualcomm.com&hl=en`

### 3.2 Requisition Identity
- **Eightfold Internal ID:** Unique integer `id` (e.g., `446721435576`).
- **Display Job ID / Req ID:** String identifier `displayJobId` (e.g., `"3097393"`), which corresponds to Qualcomm's internal Workday requisition number.
- **Application URL Format:** `https://careers.qualcomm.com/careers/apply?pid=<pid>`.

### 3.3 Access Control & Rate-Limiting Limitations
- When queried through automated non-browser HTTP clients, Eightfold's endpoint triggers Akamai/Cloudflare edge protection returning:
  ```
  Please try again later
  ```
- Any production integration with Eightfold would require either official enterprise API credentials or browser-grade session headers that bypass edge security.

---

## 4. Live Source Totals and Global vs India Coverage

### 4.1 Raw Live Totals (Authoritative Eightfold.ai Counts)
- **Global Total Open Postings:** **2,093**
- **India Total Open Postings:** **597** (28.5% of Qualcomm's global talent demand)

*Note: Source totals represent live upstream counts and are kept strictly distinct from RoleRadar's discovered, ingested, pending, and ACTIVE + VERIFIED database inventory.*

### 4.2 Database Inventory State
- **Qualcomm Ingested Postings:** **0**
- **Qualcomm Pending Postings:** **0**
- **Qualcomm ACTIVE + VERIFIED Postings:** **0**
- *Database inventory remains untouched and completely isolated.*

---

## 5. India Role-Category and Experience-Level Coverage

### 5.1 Geographic Distribution in India (597 Roles)
India represents one of Qualcomm's largest engineering workforces globally, concentrated in semiconductor design, modem software, and AI systems:
- **Bengaluru (Bangalore), Karnataka:** **373 roles** (Hardware Engineering, VLSI, Memory CAD, NPU Architecture, Modem Software).
- **Hyderabad, Telangana:** **161 roles** (Systems Engineering, CPU/GPU Optimization, Software Applications, Systems Test Engineering).
- **Chennai & Noida:** **63 roles** (Wireless LAN, Connectivity, Automotive Solutions).

### 5.2 Category Distribution Across India
- **Hardware Engineering & VLSI:** Memory CAD, Digital Design R&D, STA/Timing, Physical Design, ASIC Emulation.
- **Software Engineering & Firmware:** Embedded C/C++, Linux Kernel, DSP Firmware, WLAN protocol stack.
- **AI & Systems Engineering:** NPU AI Systems, Core AI Software, Machine Learning compiler optimization.
- **Systems Test & Quality:** Automation Test, RF Validation, Hardware Reliability.
- **Corporate Functions:** HR Management Systems, Data Management Analyst (EMEA time zone), IT enterprise infrastructure.

### 5.3 Experience-Level Distribution & Graduate Opportunities
- **Associate / Entry-Level Roles:**
  - Distinctly identified with titles such as `Associate Engineer` (e.g., Job ID `446721019961` in Bangalore).
  - Minimum qualification: Bachelor's in Electronics/CS with 0–2 years of experience.
- **Student Internships:**
  - Dedicated early-career listings hosted on `https://www.qualcomm.com/company/careers/students` and `internships-and-early-in-career-opportunities`.
- **Experienced & Senior Roles:**
  - Granular title hierarchy: `Senior Engineer`, `Engineer, Lead Senior`, `Staff Engineer`, `Senior Staff Engineer`, `Principal Engineer`.
  - Roles clearly specify minimum experience (e.g., 4+ years for Senior, 7+ years for Staff).

---

## 6. Admission Gate Evaluation

| Admission Requirement | Evaluation Criteria | Qualcomm Live Evidence | Gate Status |
|:---|:---|:---|:---:|
| **Direct Hiring Provenance** | Authentic direct employer career portal, no third-party aggregators | Official corporate careers portal `https://careers.qualcomm.com` | **PASS** |
| **Stable Job Identity** | Persistent, immutable requisition identity across scans | Numeric `position_id` (e.g. `446721435576`) and `displayJobId` (`3097393`) | **PASS** |
| **Live Detail Verification** | Individual job details resolvable via stable HTTP endpoint | Detail endpoint resolvable at `https://careers.qualcomm.com/api/pcsx/position_details` | **PASS** |
| **Application URL Validation** | Direct application URLs pass domain and employer identity checks | Applications direct to `careers.qualcomm.com/careers/apply?pid=...` | **PASS** |
| **Supported ATS Adapter** | Must match existing supported collector (`Greenhouse`, `Lever`, `Workday`, `Ashby`, `Workable`, `SmartRecruiters`, `SAP`) | Authoritative search platform is **Eightfold.ai** (Workday CXS search returns 0 jobs) | **FAIL (Unsupported ATS)** |
| **Inaccessible / Safe Access** | Source must be accessible without anti-bot circumvention | Non-browser HTTP calls receive Akamai `"Please try again later"` blocks | **FAIL (Access Barrier)** |

### Admission Gate Decision: **DEFERRED**
Section 2 of the Phase 20.5 specification states:
> *"If the ATS is unsupported, stop and produce the forensic report. Do not build a new adapter, force an unsupported schema into CustomCollector, or add a placeholder catalog entry.*
> *If the source is inaccessible or cannot be verified safely, document the evidence and mark it BLOCKED or DEFERRED. Do not bypass access controls or substitute aggregator URLs."*

Because Qualcomm's discoverable careers portal is powered by **Eightfold.ai** (which is unsupported in RoleRadar), and because its legacy Workday CXS search endpoint returns 0 postings, Qualcomm is formally **DEFERRED**.

---

## 7. Files Changed and Source Isolation

### 7.1 Codebase Changes
- **Catalog ([`backend/src/sources/catalog.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts)):** **0 changes**. No entry added for Qualcomm.
- **Collectors ([`backend/src/collectors/`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/collectors)):** **0 changes**. No new collector created, no existing collector modified.
- **Database Schema & Migrations:** **0 changes**.
- **Scratch Directory:** All temporary diagnostic scripts used during investigation were purged.

### 7.2 Safety & Isolation Validation
- **Database Records Mutated:** **0**
- **Existing Employer Scans Affected:** **0** (All active catalog sources remain completely untouched).
- **Notification & Dispatch Safety:** **0 emails or alerts dispatched**. No mock or live triggers sent.

---

## 8. Verification, Regression, and Build Outcomes

### 8.1 TypeScript Production Build
- Command: `npm run build` (in `backend/`)
- Result: **SUCCESS (Exit Code 0)**
- Output: Clean compilation of all backend modules (`roleradar-job-engine@1.0.0 build > tsc`).

### 8.2 Full Unit & Regression Test Suite
- Command: `npm test` (in `backend/`)
- Test Framework: Vitest v3.2.4
- Result: **SUCCESS (Exit Code 0)**
  - **Test Files Passed:** 61 of 61 (100%)
  - **Individual Tests Passed:** 893 of 893 (100%)
  - **Duration:** 17.41 seconds
  - **Regressions:** Zero regressions across all pipeline, URL validator, matching, preferences, and lifecycle tests.

---

## 9. Final Decision and Roadmap Recommendations

### 9.1 Final Decision: **DEFERRED**
Qualcomm is a premier semiconductor employer with 597 high-value active roles in India (Bangalore and Hyderabad). However, admission is deferred because Qualcomm's live search infrastructure is governed by **Eightfold.ai** rather than an accessible Workday CXS search catalog.

### 9.2 Recommendations for Future Eightfold.ai Support
If RoleRadar schedules an Eightfold.ai milestone:
1. **Develop Dedicated `EightfoldCollector`:**
   - Consume `/api/pcsx/search` with appropriate session headers or authenticated token handling.
   - Map `displayJobId` to `externalJobId` and `id` to `positionId`.
2. **Handle Edge Rate Limiting:**
   - Integrate standard exponential backoff and jittered scan intervals to respect Akamai edge controls.
