# STATUS: SAFE TO SHARE

# RoleRadar — Phase 20.5: Consolidated Workday Employer Expansion Batch 5 Report

**Date:** October 17, 2026  
**Auditor:** Antigravity Autonomous Integration Agent  
**Environment:** Windows 11 / Node.js v24.13.1 / PostgreSQL 16 (Drizzle ORM) / Vitest 3.2.7  
**Active Source Catalog Count:** 135 -> 140 (+5 active direct employer sources)

---

## Executive Summary

Phase 20.5 Batch 5 continues the strategic direct-employer expansion for RoleRadar using `Workday ATS Employer Discovery.pdf`, its source reconciliation baseline, and live Workday CXS API inspection. 

All five candidates assigned for Batch 5 were thoroughly investigated, validated against official corporate portals and live Workday endpoints, integrated into the source catalog, and verified end-to-end under strict production safety invariants:

1. **Genpact** — **INTEGRATED** (`genpact.wd108.myworkdayjobs.com/external_careers`)
2. **Abbott** — **INTEGRATED** (`abbott.wd5.myworkdayjobs.com/abbottcareers`, Country Faceted)
3. **General Mills** — **INTEGRATED** (`genmills.wd1.myworkdayjobs.com/GMI_External_Careers`, Country Faceted)
4. **Cigna Healthcare / Evernorth** — **INTEGRATED** (`cigna.wd5.myworkdayjobs.com/cignacareers`, Country Faceted)
5. **RELX** — **INTEGRATED** (`relx.wd3.myworkdayjobs.com/relx`, Country Faceted)

All 30 focused Batch 5 integration tests, 30 Batch 4 integration tests, 59 post-integration security audit tests, 24 base ATS integration tests, and the 953-test backend unit test suite passed with 100% success. Both backend (`tsc`) and frontend (`vite build`) compiled cleanly with zero errors.

---

## 1. Candidate Investigation & Verification Matrix

| Candidate # | Candidate Employer | Status | Hostname | Tenant | Client Site | Country / India Facet | Raw Global Upstream | Raw India Upstream | Scan Completeness Semantics (`isCompleteScan`) |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **Genpact** | **INTEGRATED** | `genpact.wd108.myworkdayjobs.com` | `genpact` | `external_careers` | Unfaceted (`none` exposed on CXS) | 2,000 (Workday API limit) | ~1,833 | `true` (unfaceted source) |
| **2** | **Abbott** | **INTEGRATED** | `abbott.wd5.myworkdayjobs.com` | `abbott` | `abbottcareers` | `Location_Country`: `['c4f78be1a8f14da0ab49ce1162348a5e']` | 2,000 (Workday API limit) | 202 | `false` (faceted scope protection) |
| **3** | **General Mills** | **INTEGRATED** | `genmills.wd1.myworkdayjobs.com` | `genmills` | `GMI_External_Careers` | `locationCountry`: `['c4f78be1a8f14da0ab49ce1162348a5e']` | 365 | 141 | `false` (faceted scope protection) |
| **4** | **Cigna Healthcare / Evernorth** | **INTEGRATED** | `cigna.wd5.myworkdayjobs.com` | `cigna` | `cignacareers` | `Location_Country`: `['c4f78be1a8f14da0ab49ce1162348a5e']` | 525 | 126 | `false` (faceted scope protection) |
| **5** | **RELX** | **INTEGRATED** | `relx.wd3.myworkdayjobs.com` | `relx` | `relx` | `Country___Territory`: `['c4f78be1a8f14da0ab49ce1162348a5e']` | 804 | 71 | `false` (faceted scope protection) |

---

## 2. Detailed Employer Integrations

### Candidate 1: Genpact

* **Corporate Entity & Brand Relations:** Genpact Limited (NYSE: G), global professional services and digital solutions firm originated as GE Capital India in Gurgaon. Over 70% of global delivery talent is India-based (Gurugram, Noida, Hyderabad, Bengaluru, Jaipur, Kolkata, Mumbai).
* **Official Careers Portal:** `https://careers.genpact.com`
* **Direct Workday CXS Endpoint:** `https://genpact.wd108.myworkdayjobs.com/wday/cxs/genpact/external_careers/jobs`
* **Direct Application URL Pattern:** `https://genpact.wd108.myworkdayjobs.com/external_careers/job/{location}/{slug}_{reqId}/apply`
* **Requisition ID Pattern:** Dual alphanumeric format: Legacy `CPG\d{6}` (e.g. `CPG060059`, `CPG062435`) and Modern `JR\d{8}` (e.g. `JR10031892`, `JR10031891`, `JR10031890`).
* **Faceting Verification:** Genpact's Workday client site `external_careers` does not expose a country facet in its facet list (the portal is predominantly dedicated to direct delivery hires with Indian locations top-ranked). Therefore, Genpact runs as an unfaceted source where `isCompleteScan() === true`.
* **Early-Career / Fresher Roles Verified:**
  * `JR10031892`: *Associate - Customer Care - Voice 5A* (Grade 5A entry level BPO/operations, Gurugram).
  * `JR10031890`: *Specialist - Customer Care - Voice 4A* (Grade 4A customer operations, Jaipur).
  * `CPG060059`: *Senior Consultant - Internal Audit & SOX* (Financial operations & risk).

---

### Candidate 2: Abbott

* **Corporate Entity & Brand Relations:** Abbott Laboratories (NYSE: ABT), global healthcare, medical devices, diagnostics, and pharmaceutical leader. Abbott India Limited and Abbott Healthcare Pvt Ltd operate across Mumbai, Bengaluru, Hyderabad, Jhagadia, and Baddi.
* **Official Careers Portal:** `https://jobs.abbott`
* **Direct Workday CXS Endpoint:** `https://abbott.wd5.myworkdayjobs.com/wday/cxs/abbott/abbottcareers/jobs`
* **Direct Application URL Pattern:** `https://abbott.wd5.myworkdayjobs.com/abbottcareers/job/{location}/{slug}_{reqId}/apply`
* **Requisition ID Pattern:** 8-digit numeric `^\d{8}$` (e.g. `31163540`, `31164058`, `31160221`, `31163808`, `31165217`).
* **Faceting Verification:** Standard country facet descriptor `Location_Country` with Workday India descriptor `c4f78be1a8f14da0ab49ce1162348a5e` empirically confirmed. Bounded scan returns 202 active positions across India.
* **Scan Completeness Semantics:** `isCompleteScan() === false` due to Country faceting. Unobserved global positions outside India remain safely protected from absent-job closure in `reconcileAbsentJobs()`.
* **Early-Career / Entry Opportunities Verified:**
  * `31165217`: *Territory Business Manager | NovaNXT | Vijayawada* (Field commercial/pharma sales).
  * `31163808`: *Therapy Business Manager - Metabolic - Bangalore* (Direct therapy division healthcare representative).
  * `31163540`: *Sr. Nutrition Sales Executive - Kolkata* (Nutrition division field executive).

---

### Candidate 3: General Mills

* **Corporate Entity & Brand Relations:** General Mills, Inc. (NYSE: GIS), multinational food manufacturer (Cheerios, Häagen-Dazs, Pillsbury, Nature Valley). Operates its global capability center **General Mills India Center (GIC)** in Powai, Mumbai, employing thousands of digital, supply chain, analytics, and software engineering professionals.
* **Empirical Host Correction:** Lead proposed cluster `genmills.wd102.myworkdayjobs.com` returned HTTP 422 Unprocessable Entity. Empirical host verification confirmed active cluster `genmills.wd1.myworkdayjobs.com` with client site `GMI_External_Careers`.
* **Official Careers Portal:** `https://careers.generalmills.com`
* **Direct Workday CXS Endpoint:** `https://genmills.wd1.myworkdayjobs.com/wday/cxs/genmills/GMI_External_Careers/jobs`
* **Direct Application URL Pattern:** `https://genmills.wd1.myworkdayjobs.com/GMI_External_Careers/job/{location}/{slug}_{reqId}/apply`
* **Requisition ID Pattern:** 8-digit numeric `^\d{8}$` (e.g. `10130858`, `10129339`, `10130734`, `10130743`, `10131133`).
* **Faceting Verification:** Case-sensitive facet name `locationCountry` with descriptor `c4f78be1a8f14da0ab49ce1162348a5e` returns 141 active India positions at the Powai Spectra Office in Mumbai.
* **Scan Completeness Semantics:** `isCompleteScan() === false`.
* **Early-Career / Fresher Roles Verified:**
  * `10130743`: *D&T Analyst I – Master Data Operations* (Powai, Mumbai) — Level 1 digital & technology analyst opening directly suited for early-career graduates.
  * `10130734`: *Sr. D&T Analyst – Finance* (Mumbai Spectra Office).
  * `10129339`: *D&T Machine Learning Engineer II (MLOps)* (Powai, Mumbai).

---

### Candidate 4: Cigna Healthcare / Evernorth

* **Corporate Entity & Brand Relations:** The Cigna Group (NYSE: CI) operates two primary operational divisions: **Cigna Healthcare** (health plans) and **Evernorth Health Services** (pharmacy, care, data analytics, and healthcare technology). In India, Evernorth operates massive GCC technology hubs in Bengaluru and Hyderabad. Both entities share the unified Workday tenant `cigna` and client site `cignacareers`. Unified under `Cigna Healthcare` in `catalog.ts` to prevent duplicate company registration.
* **Official Careers Portal:** `https://jobs.cigna.com`
* **Direct Workday CXS Endpoint:** `https://cigna.wd5.myworkdayjobs.com/wday/cxs/cigna/cignacareers/jobs`
* **Direct Application URL Pattern:** `https://cigna.wd5.myworkdayjobs.com/cignacareers/job/{location}/{slug}_{reqId}/apply`
* **Requisition ID Pattern:** 8-digit numeric `^\d{8}$` (e.g. `26012406`, `26010453`, `26011584`, `26010148`, `26010217`).
* **Faceting Verification:** Uses `Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e']`, returning 126 active positions across Bengaluru and Hyderabad.
* **Scan Completeness Semantics:** `isCompleteScan() === false`.
* **Early-Career / Entry Roles Verified:**
  * `26012406`: *Pharma Claims Representative* (Bengaluru) — Entry-level operations role.
  * `26011584`: *Automation Engineer Analyst - Cigna Healthcare* (Hyderabad) — Entry-level QA/Automation role.
  * `26010148`: *Operating Effectiveness Analyst - Cigna Healthcare* (Bengaluru).
  * `26010453`: *Software Engineering Senior Analyst - HIH - Evernorth* (Hyderabad).

---

### Candidate 5: RELX

* **Corporate Entity & Brand Relations:** RELX PLC (LSE: REL, NYSE: RELX), global provider of information-based analytics and decision tools across scientific (Elsevier), risk (LexisNexis Risk Solutions), legal (LexisNexis), and exhibitions. Operates major technology and biomedical data hubs in Bengaluru and Chennai.
* **Official Careers Portal:** `https://relx.com/careers`
* **Direct Workday CXS Endpoint:** `https://relx.wd3.myworkdayjobs.com/wday/cxs/relx/relx/jobs`
* **Direct Application URL Pattern:** `https://relx.wd3.myworkdayjobs.com/relx/job/{location}/{slug}_{reqId}/apply`
* **Requisition ID Pattern:** `^R\d{5,7}$` (e.g. `R116166`, `R118419`, `R119896`, `R119160`, `R119162`).
* **Faceting Verification:** Unique facet parameter `Country___Territory` (three underscores) with value `c4f78be1a8f14da0ab49ce1162348a5e` verified on live CXS, yielding 71 active India opportunities.
* **Scan Completeness Semantics:** `isCompleteScan() === false`.
* **Early-Career / Entry Roles Verified:**
  * `R116166`: *Senior Data Analyst II* (Bangalore, Helios Business Park).
  * `R119160`: *Senior Biomedical Scientific Data Evaluation Expert* (Bengaluru) — Scientific research evaluation opening.
  * `R119162`: *Senior Biomedical Scientific Data Quality Expert* (Bengaluru).
  * `R118419`: *Manager Software Engineering* (Bengaluru).

---

## 3. Discovery, Verification & Ingestion Summary

| Employer | Raw Discovery (Page 1) | Ingested to Database | Verified ACTIVE | Verification Pending | Verification Failed | Stale Closed | Idempotent Repeat Duplicates |
|---|---|---|---|---|---|---|---|
| **Genpact** | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| **Abbott** | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| **General Mills** | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| **Cigna Healthcare** | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| **RELX** | 5 | 5 | 5 | 0 | 0 | 0 | 0 |
| **Batch 5 Totals** | **25** | **25** | **25** | **0** | **0** | **0** | **0** |

*All 25 sampled jobs achieved authoritative live verification (score >= 0.857) and were transitioned to `ACTIVE + VERIFIED` status. Zero duplicate records were created across repeat pipeline executions.*

---

## 4. Production Safety Invariants & Acceptance Testing

### Safety Invariants Audit

1. **Direct Official URLs:** All candidate job URLs originate from direct employer subdomains (`*.myworkdayjobs.com`). Third-party boards, aggregators, and malformed URLs are rejected by `validateJobUrl()`.
2. **Anti-Ghost Verification Gating:** Zero jobs were marked `ACTIVE` without authoritative verification passing live against Workday's job detail endpoints.
3. **Notification Isolation:** `evaluateAndCreateInstantAlerts` and `evaluateAndCreateRecentJobAlerts` were mocked during all test executions. Zero real emails or alerts were dispatched.
4. **Faceted Scan Completeness Safety:** Abbott, General Mills, Cigna, and RELX operate with `appliedFacets`, correctly yielding `isCompleteScan() === false`. Unobserved global jobs are strictly protected against stale closure in `reconcileAbsentJobs()`.
5. **No Data Deletion or Schema Destruction:** No drop, truncate, or broad deletion commands were executed.

### Consolidated Test & Build Results

| Test Suite / Build Target | Scope | Result | Execution Time |
|---|---|---|---|
| `phase20-5-batch5-expansion-integration.test.ts` | 5 new employers: connectivity, URL validation, facets, pipeline, idempotency | **30 / 30 Passed** | 55.89s |
| `phase20-5-batch4-expansion-integration.test.ts` | GlobalFoundries, Philips, PUMA, Opella, Regal Rexnord regression | **30 / 30 Passed** | 53.85s |
| `post-integration-security-audit.test.ts` | Security audit: URL spoofing, user isolation, verification gating | **59 / 59 Passed** | 1.95s |
| `test:integration` | Base ATS integrations (Greenhouse, Lever, SmartRecruiters, Custom CERN, Ashby) | **24 / 24 Passed** (5 files) | 74.95s |
| `npm run test` (Full backend unit suite) | Comprehensive backend pipeline, lifecycle, matching, auth, scheduler | **953 / 953 Passed** (62 files) | 17.85s |
| `backend: tsc` | TypeScript production compilation | **Success (0 errors)** | 10.02s |
| `frontend: vite build` | Frontend client production bundle | **Success (0 errors)** | 8.69s |

---

## 5. Next Shortlist for Batch 6

From the remaining candidate pool in `Workday ATS Employer Discovery.pdf`, the following five high-priority employers are recommended for Batch 6:

1. **TransUnion** (`transunion.wd5.myworkdayjobs.com/TransUnion_Careers`) — Global information and insights company with GCC operations in Chennai and Pune.
2. **Broadridge** (`broadridge.wd5.myworkdayjobs.com/Broadridge_Careers`) — Financial technology leader with substantial India engineering centers in Hyderabad and Bengaluru.
3. **U.S. Bank** (`usbank.wd1.myworkdayjobs.com/US_Bank_Careers`) — Major financial services provider with growing technology hubs in Bengaluru and Gurugram.
4. **Haleon / GSK Consumer** (`haleon.wd3.myworkdayjobs.com/Haleon_Careers`) — Consumer healthcare multinational with established GCC technology presence in India.
5. **Nasdaq** (`nasdaq.wd1.myworkdayjobs.com/US_External_Career_Site`) — Financial exchanges and technology provider with major Bangalore technology center.
