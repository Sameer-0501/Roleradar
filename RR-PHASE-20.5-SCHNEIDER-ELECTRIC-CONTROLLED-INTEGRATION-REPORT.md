# RoleRadar — Phase 20.5: Schneider Electric Official Employer Source Investigation & Controlled Integration Report

> **SHAREABILITY ASSESSMENT: SAFE TO SHARE**
>
> - **Sensitivity Classification:** PUBLIC / SHAREABLE
> - **Credential & Secret Scan:** 0 API keys, 0 user credentials, 0 session tokens, 0 private PII.
> - **Third-Party Endpoints:** All listed URLs, endpoints, and portal parameters are public Schneider Electric career portal assets.
> - **Sharing Recommendation:** This forensic report contains no confidential, sensitive internal, or private data and can be freely shared with stakeholders, engineering teams, and external auditors.

---

## Executive Summary

- **Task Reference:** `RR-PHASE-20.5-SCHNEIDER-ELECTRIC-CONTROLLED-INTEGRATION`
- **Candidate Employer:** Schneider Electric SE (`https://careers.se.com`)
- **Investigation Objective:** Investigate Schneider Electric as a potential direct-employer source for RoleRadar, establish its live ATS provenance, assess India/global category coverage, and evaluate against the admission gate without implementing an unsupported ATS adapter.
- **Authoritative ATS:** **iCIMS** (fronted by Jibe Apply / Candidate Experience Platform)
- **RoleRadar ATS Support Status:** **UNSUPPORTED** (RoleRadar natively supports `GREENHOUSE`, `LEVER`, `WORKDAY`, `ASHBY`, `WORKABLE`, `SMARTRECRUITERS`, and `SAP`).
- **Admission Gate Decision:** **DEFERRED**
- **Catalog & Inventory Actions:** Zero catalog additions, zero adapter modifications, zero database records created, and zero notification dispatches. Source isolation and database integrity are strictly maintained.

---

## 1. Catalog and Database Preflight

### 1.1 Pre-existing Source and Catalog Inspection
- Inspected [backend/src/sources/catalog.ts](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts).
- Checked for keys, aliases, and domains associated with Schneider Electric:
  - `Schneider` / `Schneider Electric`
  - `se.com` / `careers.se.com`
  - `careers-se.icims.com`
  - `jibe` / `jibeapply`
- **Result:** No existing entries found in `catalog.ts`. No conflicting or duplicate source configurations exist.

### 1.2 Database Company Records
- Inspected the database `companies` table for existing company names or aliases.
- **Result:** Zero matching company records or aliases found. No namespace collisions detected.

---

## 2. Official Careers Domain and Live ATS Provenance

### 2.1 Domain Resolution and Entrypoint
- Attempted initial candidate entrypoint `www.careers.se.com`:
  - Result: Failed DNS resolution (`getaddrinfo ENOTFOUND www.careers.se.com`).
- Inspected official corporate portal `https://www.se.com` hiring navigation links:
  - Canonical Careers Portal: `https://careers.se.com`
  - Canonical Job Search: `https://careers.se.com/jobs`
  - Live HTTP status: `200 OK`

### 2.2 Frontend Framework and Client Assets
Inspected live HTML and script headers on `https://careers.se.com/jobs`:
- Framework: AngularJS with Jibe Candidate Experience (`ng-app="jibeapply"`).
- Script bundle: `https://app.jibecdn.com/prod/search/4.11.225/app.min.js`
- Stylesheet bundle: `https://assets.jibecdn.com/prod/se/0.0.107/css/client.css`
- Client Configuration snippet:
  ```json
  window._jibe = {
    "cid": "se",
    "region": "eu",
    "portal": 17
  };
  ```

### 2.3 Authoritative ATS Identity (System of Record)
Inspection of live job payloads fetched directly from Schneider Electric's API confirmed:
```json
{
  "ats_code": "icims",
  "meta_data": {
    "icims": {
      "tenantId": "10923",
      "portalId": "17"
    }
  },
  "site": "careers-se"
}
```
- **Conclusion:** While Jibe Apply serves as the front-end CMS/search interface, **iCIMS** is the authoritative applicant tracking system and system of record managing requisitions, candidate profiles, and application workflows.

---

## 3. Endpoint, Pagination, Requisition Identity, and Application URLs

### 3.1 Public Job Search API Endpoint
- **Endpoint URL:** `https://careers.se.com/api/jobs`
- **Protocol & Method:** HTTPS `GET`
- **Supported Query Parameters:**
  - `page`: 1-based page index (e.g., `page=1`, `page=2`).
  - `limit`: Page size / items per page (e.g., `limit=10`, `limit=50`, `limit=100`).
  - `country`: Country filter (e.g., `country=India` or `country=IND`).
  - `lang`: Language locale (e.g., `lang=en-us`).
  - `sortBy`: Sort criterion (e.g., `relevance`, `posted_date`).
  - `categories`: Array / string filter for functional categories.

### 3.2 Requisition Identity
- **Identifier:** `req_id` (numeric string, e.g., `"95099"`, `"95147"`, `"95166"`).
- **Stability:** Globally unique and immutable within Schneider Electric's iCIMS portal instance.
- **Tracking IDs:** In addition to `req_id`, items contain `data.tracking_id` (e.g., `10923-95099`).

### 3.3 Direct Application URLs & Canonical Job URLs
- **Canonical Public View:** `https://careers.se.com/jobs/<req_id>?lang=en-us`
- **Direct Application URL (Authoritative):** `https://careers-se.icims.com/jobs/<req_id>/login`
  - In addition, regional subdomains are observed for specific localized jurisdictions (e.g., `https://zhcareers-se.icims.com/...`).
- **Domain Validation Analysis:**
  - Canonical view URL hostname: `careers.se.com` (First-party corporate subdomain).
  - Direct application URL hostname: `careers-se.icims.com` (Third-party ATS subdomain).
  - Passing RoleRadar's strict domain and employer-identity validation would require whitelisting `careers-se.icims.com` with strict tenant bound checking (`tenantId: 10923`).

---

## 4. Live Source Totals and Global vs India Coverage

### 4.1 Raw Live Totals (Authoritative Source Counts)
- **Global Total Open Postings:**
  - Raw `totalCount`: **3,717**
  - Active Postings in Index: **2,662**
- **India Total Open Postings:**
  - Raw `totalCount`: **572**
  - Active Postings in Index: **570**

*Note: Source totals represent live upstream counts and are kept strictly distinct from RoleRadar's discovered, ingested, pending, and ACTIVE + VERIFIED database inventory.*

### 4.2 Database Inventory State
- **Schneider Electric Ingested Postings:** **0**
- **Schneider Electric Pending Postings:** **0**
- **Schneider Electric ACTIVE + VERIFIED Postings:** **0**
- *Database inventory remains untouched and completely isolated.*

---

## 5. India Role-Category and Experience-Level Coverage

### 5.1 Category Distribution Across India (570 Active Roles)
India roles span 22 specialized functional disciplines across software, industrial automation, hardware, services, and corporate functions:

| Functional Category | Role Count | Core Focus Areas |
|:---|:---:|:---|
| **Innovation & Technology** | 107 | Firmware, Embedded Systems, Cloud, R&D Software, IoT Engineering |
| **Customer Projects & Execution** | 97 | Automation Commissioning, SCADA, Power Distribution Projects |
| **Sales, BD & Marketing** | 93 | B2B Solutions, Industrial Automation Sales, Account Management |
| **Quality, Safety & Environment** | 42 | QA/QC, Industrial Safety, ISO & Regulatory Compliance |
| **Manufacturing & Operations** | 37 | Smart Factory Operations, Lean Manufacturing, Tooling |
| **Information Technology Services** | 36 | Enterprise Applications, Infrastructure, DevOps, SAP |
| **Procurement & Sourcing** | 31 | Global Sourcing, Category Management, Component Sourcing |
| **Technical Support & Services** | 23 | Field Services, Grid Automation Support, Switchgear Maintenance |
| **Marketing & Communications** | 21 | Product Marketing, Brand Strategy, Digital Content |
| **Supply Chain** | 17 | Demand Planning, Inventory Management, Logistics Operations |
| **General Mgmt & Administration** | 16 | Facility Operations, PMO, Business Operations |
| **Legal, Risk & Compliance** | 10 | Contract Negotiation, Regulatory Compliance, IP |
| **Data Analytics & AI** | 9 | Predictive Maintenance Analytics, Machine Learning, Data Engineering |
| **Logistics & Warehousing** | 7 | Distribution Centers, Freight Management, Warehouse Automation |
| **Cybersecurity** | 6 | Operational Technology (OT) Security, Cloud SecOps, Product Security |
| **Human Resources** | 6 | Talent Acquisition, HRBP, Employee Relations |
| **Finance & Controlling** | 5 | Financial Planning & Analysis (FP&A), Audit, Cost Accounting |
| **Other / Specialized** | 7 | Cross-functional Transformation, Trainee Programs |

### 5.2 Key Geographic Hubs in India
- **Bengaluru (Bangalore):** 233 roles (Global R&D Hub, Schneider Electric Innovation Hub, Digital Energy software).
- **Ahmednagar:** 42 roles (Major Manufacturing Plant, Switchgear & Drives operations).
- **Gurugram / Gurgaon:** 32 roles (Corporate HQ, Commercial & Enterprise Sales).
- **Chennai:** 26 roles (Engineering & Project Execution, Smart Infrastructure).
- **Other Active Locations:** Mumbai, Vadodara, Kolkata, Pune, Hyderabad, Goa, Ahmedabad, Coimbatore.

### 5.3 Experience-Level Distribution & Classification Pitfalls

1. **Internship & Trainee Distinctions:**
   - Explicitly categorized with titles containing `Intern`, `Apprentice`, or `Trainee` (e.g., `R&D Intern - Power Systems`, `Graduate Apprentice Trainee`).
   - Cleanly distinct from professional graduate full-time requisitions.
2. **The "Entry Professional" Classification Pitfall:**
   - **Crucial Finding:** Multiple Schneider Electric requisitions carry external titles with suffix `- Entry Professional` (e.g., Req ID `95099`: *General Project Engineering - Entry Professional*).
   - Detailed inspection of the job description body reveals that internal grading maps this to `Deputy Manager – R&D` requiring **`3 - 7 years of prior relevant engineering experience`**.
   - **Classification Rule Enforced:** In strict accordance with RoleRadar's requirements (*"Do not infer fresher eligibility from location or a keyword alone"*), naive title parsing would produce catastrophic false positives. Any future integration of iCIMS/Schneider Electric must mandate JD body qualification extraction before assigning fresher eligibility.
3. **Senior and Leadership Roles:**
   - Readily identifiable through standard title hierarchy tokens (`Director`, `Principal Engineer`, `Lead Architect`, `Plant Head`, `General Manager`) and subject to RoleRadar's senior-title hard filters.

---

## 6. Admission Gate Evaluation

| Admission Requirement | Evaluation Criteria | Schneider Electric Live Evidence | Gate Status |
|:---|:---|:---|:---:|
| **Direct Hiring Provenance** | Authentic direct employer career portal, no third-party job aggregators | Official career site `https://careers.se.com` with direct backend API | **PASS** |
| **Stable Job Identity** | Persistent, immutable requisition identity across scans | Numeric `req_id` (e.g., `95099`) bound to tenant `10923` | **PASS** |
| **Live Detail Verification** | Individual job details resolvable via stable HTTP endpoint | Direct API details accessible at `https://careers.se.com/api/jobs/<req_id>` | **PASS** |
| **Application URL Validation** | Direct application URLs pass domain and employer identity checks | Applications direct to `careers-se.icims.com/jobs/<req_id>/login` | **PASS (Conditional on whitelisting)** |
| **Supported ATS Adapter** | Must match existing supported collector (`Greenhouse`, `Lever`, `Workday`, `Ashby`, `Workable`, `SmartRecruiters`, `SAP`) | Authoritative ATS is **iCIMS** | **FAIL (Unsupported ATS)** |

### Admission Gate Decision: **DEFERRED**
Section 2 of the Phase 20.5 specification states:
> *"If the ATS is unsupported, stop and produce the forensic report. Do not build a new adapter, force an unsupported schema into CustomCollector, or add a placeholder catalog entry."*

Because Schneider Electric's underlying ATS is **iCIMS**, and iCIMS is not currently implemented in RoleRadar's production collector fleet, Schneider Electric is formally **DEFERRED**.

---

## 7. Files Changed and Source Isolation

### 7.1 Codebase Changes
- **Catalog (`backend/src/sources/catalog.ts`):** **0 changes**. No entry added for Schneider Electric.
- **Collectors (`backend/src/collectors/`):** **0 changes**. No new collector created, no existing collector modified.
- **Database Schema & Migrations:** **0 changes**.
- **Workspace Governance:** Documented mandatory shareability status policy in `.agents/rules/` and `PROJECT_RULES.md` as instructed by the user.

### 7.2 Safety & Isolation Validation
- **Database Records Mutated:** **0**
- **Existing Employer Scans Affected:** **0** (GitLab, Stripe, Figma, Palantir, Medtronic, Western Digital, etc. remain 100% unaffected).
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
  - **Duration:** 18.30 seconds
  - **Regressions:** Zero regressions detected across pipeline, URL validator, matching, preferences, job lifecycle, and security controls.

### 8.3 Sequential Integration Test Suite
- Command: `npm run test:integration` (in `backend/`)
- Targeted Suites: `greenhouse-integration.test.ts`, `lever-integration.test.ts`, `workday-integration.test.ts`, `custom-integration.test.ts`, `ashby-integration.test.ts`.
- Result: All shared collectors continue to adhere to existing production defaults, pagination limits, and idempotent deduplication semantics.

---

## 9. Final Decision and Roadmap Recommendations

### 9.1 Final Decision: **DEFERRED**
Schneider Electric SE has been thoroughly investigated and verified as a high-quality direct-employer source with exceptional India coverage (570 active roles across Bangalore, Ahmednagar, Gurgaon, Chennai, etc.). However, because its authoritative ATS is **iCIMS**, admission is deferred until an official `iCIMSCollector` adapter is designed, specified, and scheduled on the engine roadmap.

### 9.2 Technical Recommendations for Future iCIMS Milestone
When an iCIMS integration milestone is scheduled:
1. **Develop Dedicated `iCIMSCollector`:**
   - Support both pure iCIMS portals (`*.icims.com/jobs/...`) and CMS-fronted endpoints such as Jibe Apply (`/api/jobs`).
   - Implement pagination with `limit` (standardizing at 50 or 100) and 1-based `page` indexing.
2. **Strict Experience Level Guardrails:**
   - Implement mandatory qualification extraction to prevent "Entry Professional" titles (e.g., Req 95099 requiring 3–7 years) from being misclassified as fresher roles.
3. **Domain Whitelist Configuration:**
   - Ensure the URL validator whitelists both the first-party candidate view domain (`careers.se.com`) and the tenant-scoped apply domain (`careers-se.icims.com`).
