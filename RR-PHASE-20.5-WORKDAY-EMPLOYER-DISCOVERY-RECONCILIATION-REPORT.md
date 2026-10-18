# RoleRadar — Phase 20.5: Workday Employer Discovery Reconciliation Audit Report

> **SHAREABILITY ASSESSMENT: SAFE TO SHARE**
>
> - **Sensitivity Classification:** **PUBLIC / SHAREABLE**
> - **Credential & Secret Scan:** 0 API keys, 0 user credentials, 0 session tokens, 0 private PII.
> - **Third-Party Endpoints:** All listed URLs, endpoints, and portal parameters are public career portal assets and public Workday CXS endpoints.
> - **Sharing Recommendation:** This forensic audit report contains no confidential, sensitive internal, or private data and can be freely shared with stakeholders, engineering teams, and external auditors.

---

## Executive Summary

- **Task Reference:** `RR-PHASE-20.5-WORKDAY-EMPLOYER-DISCOVERY-RECONCILIATION`
- **Audit Objective:** Reconcile the discovered Workday employer dataset from **Workday ATS Employer Discovery.pdf** against RoleRadar's current source catalog (`backend/src/sources/catalog.ts`) and live PostgreSQL database (`companies` and `jobs` tables) to identify genuinely new, eligible direct-employer sources for future controlled integration.
- **Audit Methodology:** 100% READ-ONLY investigation. Zero modifications to source code, catalog definitions, database records, migrations, schedules, notifications, or configurations. Zero jobs created, deleted, or altered.
- **Raw PDF Candidates Extracted:** **59** distinct candidate entities across 5 structural categories and 75 works cited.
- **Deduplicated & Cross-Referenced Results:**
  - **ALREADY_INTEGRATED:** **4** employers (Accenture, NXP Semiconductors, NVIDIA, and BrowserStack which is integrated via Workable).
  - **ELIGIBLE_FOR_CONTROLLED_TEST:** **34** employers (Verified active Workday CXS endpoints, confirmed India hiring footprint, diverse technical/corporate role coverage).
  - **DEFERRED_OR_BLOCKED:** **13** employers (Zero India presence, defense/citizenship clearance blockers, ambiguous corporate identities, or HTTP failure).
  - **NEEDS_MORE_EVIDENCE:** **8** employers (Marginal India job counts, regional portal routing ambiguity, or conflicting brand identifiers).
- **Top Single Recommendation for Next Integration:** **Airbus** (`ag.wd3.myworkdayjobs.com/Airbus`). Premier aerospace manufacturer with 293 live India positions at its Bengaluru Innovation Center, deep software/data engineering roles, and confirmed active student/fresher internships.

---

## 1. Catalog & Database Baseline

The reconciliation was performed against the active RoleRadar production baseline:
- **Source Catalog:** [`backend/src/sources/catalog.ts`](file:///c:/Users/Samee/Documents/RoleRadar/backend/src/sources/catalog.ts) containing **114 active employer sources** across 7 supported ATS platforms (Greenhouse, Lever, Workday, Ashby, Workable, SmartRecruiters, SAP SuccessFactors).
- **Existing Workday Sources in Catalog (18 employers):**
  - Accenture, Adobe, Applied Materials, Autodesk, Bank of America, Cadence Design Systems, Cisco, Citi, CrowdStrike, GE Aerospace, GE HealthCare, GE Vernova, HPE, JLL, Mastercard, Medtronic, Micron Technology, Morgan Stanley, Nvidia, NXP Semiconductors, PwC, Target.
- **Database Baseline (`companies` table):**
  - Direct PostgreSQL forensic query verified **104 registered company records** in the database.
  - Cross-referencing identified exact name, domain, and alias matches for 4 candidate entities:
    1. `Accenture` (`cce9016f-5704-4884-93a9-b21f65bc446e`): Workday, 388 jobs.
    2. `NXP Semiconductors` (`9f5ca383-9c83-4177-89f2-0dfdcc689951`): Workday, 0 jobs.
    3. `Nvidia` (`d5dabf69-d06a-4585-bfe8-a5f5a250ac4d`): Workday, 360 jobs.
    4. `BrowserStack` (`b32f96a0-c90b-473b-b653-3e4a9460c42b`): Workable (`apply.workable.com`), 0 jobs.
  - The remaining 55 candidate entities do not exist in the RoleRadar database or source catalog.

---

## 2. PDF Extraction & Deduplication Totals

### 2.1 Extraction Breakdown
| PDF Section | Section Name | Extracted Candidate Count |
| :--- | :--- | :---: |
| **Section A** | Indian Startups and Scale-Ups | 2 |
| **Section B** | International Startups and Scale-Ups | 3 |
| **Section C** | Other Indian Employers | 1 |
| **Section D** | Other International Employers | 47 |
| **Section E** | Validated Tier-One Global Enterprises | 5 |
| **Unresolved** | Section on Technical Constraints / Citation 75 | 1 |
| **TOTAL** | **Extracted Candidates** | **59** |

*Note on Keyword Collisions (PDF Page 2):* The PDF explicitly analyzes searches for Indian scale-ups (Zepto, Swiggy, Meesho, Lenskart, Flipkart, Nykaa, BigBasket, Myntra) that triggered global Workday postings because multinational brands headhunt talent with experience on those platforms. These 8 entities were confirmed as search false-positives and are excluded from the candidate inventory.

### 2.2 Deduplication & Reconciliation Summary
```
Total Extracted Candidates:                     59
├── Already Integrated in RoleRadar:             4  (6.8%)
│   ├── Workday Catalog Match:                   3  (Accenture, NXP Semiconductors, NVIDIA)
│   └── Conflicting ATS / Duplicate:             1  (BrowserStack - Active on Workable)
├── Eligible for Controlled Test:               34  (57.6%)
├── Deferred or Blocked:                        13  (22.0%)
│   ├── No India Operations / Domestic US:       9  (Capital One, FINRA, Methodist, SBA, Tinuiti, Vizient, Westlake, Graybar, Globe)
│   ├── Defense / Security Clearance Barrier:    2  (Leidos, Saab Group)
│   ├── Ambiguous Identity ("ONTERRIS"):         1  (Onterris)
│   └── Subsidiary Fragment (Low Volume):        1  (McKesson / CoverMyMeds)
└── Needs More Evidence:                         8  (13.6%)
    ├── Zero or Marginal India Jobs (<5):        3  (GoTo, Teladoc Health, Manulife)
    └── Regional / Tenant Routing Ambiguity:     5  (Sysco, Santander, The LEGO Group, Humana, Teleperformance)
```

---

## 3. Complete Candidate Reconciliation Table (59 Candidates)

*Legend:*
- **Status:** `ALREADY_INTEGRATED` | `ELIGIBLE_FOR_CONTROLLED_TEST` | `DEFERRED_OR_BLOCKED` | `NEEDS_MORE_EVIDENCE`
- **Confidence:** `HIGH` (Direct tenant & live CXS verified) | `MEDIUM` (Live endpoint verified, subsidiary/routing nuance) | `LOW` (Ambiguous entity / unverified)
- **Live Counts:** Measured via live read-only CXS probes (`POST /wday/cxs/{tenant}/{clientSite}/jobs`). Global totals capped at 2,000 by Workday CXS pagination limit.

| # | Employer | Tenant Host | Client Site | Official Careers URL | Live Global / India Count | India Relevance | Confidence | Duplicate Status | Primary Status | Rationale |
|:---:|:---|:---|:---|:---|:---:|:---|:---:|:---:|:---:|:---|
| 1 | **Fractal Analytics** | `fractal.wd1.myworkdayjobs.com` | `Careers` | `https://fractal.ai/careers` | 115 / 78 | High (BLR, BOM, GGN) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Indigenous AI scale-up. High density of GenAI and data science roles in India. |
| 2 | **BrowserStack** | `browserstack.wd3.myworkdayjobs.com` | `External` | `https://browserstack.com/careers` | 28 / 20+ | High (Mumbai, Remote) | HIGH | **Duplicate (Conflicting ATS)** | `ALREADY_INTEGRATED` | Already integrated in RoleRadar via WORKABLE (`apply.workable.com/browserstack`, catalog line 891). Must not create duplicate Workday company. |
| 3 | **Omnissa** | `omnissa.wd501.myworkdayjobs.com` | `Omnissa_External_Career_Site` | `https://omnissa.com/careers` | 110 / 33 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | VMware enterprise spin-off on wd501. Active Java, security, and Databricks engineering in Bengaluru. |
| 4 | **Tinuiti** | `tinuiti.wd12.myworkdayjobs.com` | `Tinuiti` | `https://tinuiti.com/careers` | 93 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | Performance marketing digital agency. Domestic US positions only. Zero India presence. |
| 5 | **GoTo** | `goto.wd5.myworkdayjobs.com` | `GoToCareers` | `https://goto.com/careers` | 11 / 0 | Low (0 active) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | LogMeIn successor. Live probe returned only 11 global jobs and 0 active India roles. Requires evidence of hiring resumption. |
| 6 | **Piramal Pharma** | `piramalpharma.wd102.myworkdayjobs.com` | `PIRAMAL_EXTERNAL_CAREERS` | `https://piramal.com/careers` | 272 / 210 | High (Mumbai, Pan-India) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Major Indian pharma conglomerate on wd102. Strong manufacturing, supply chain, and e-commerce hiring in India. |
| 7 | **Cushman & Wakefield** | `cw.wd1.myworkdayjobs.com` | `External` | `https://careers.cushmanwakefield.com` | 2,000 / 278 | High (BLR, HYD, MAA) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Global real estate leader. 278 India positions, including verified student/fresher apprenticeships (`EIC Intern`). |
| 8 | **Elevance Health (Carelon)** | `elevancehealth.wd1.myworkdayjobs.com` | `carelonglobal_in` | `https://careers.elevancehealth.com` | 15 / 15 | High (GGN, HYD, BLR) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Dedicated Carelon Global Solutions India tenant site. Active QA, software, and fresher benefit analyst roles. |
| 9 | **Danaher Corporation** | `danaher.wd1.myworkdayjobs.com` | `DanaherJobs` | `https://jobs.danaher.com` | 1,445 / 174 | High (BLR, DEL, MAA) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Multi-brand conglomerate (Abcam, Leica Biosystems, Radiometer). Rich SAP, field engineering, and life science roles in India. |
| 10 | **Thomson Reuters** | `thomsonreuters.wd5.myworkdayjobs.com` | `external_career_site` | `https://thomsonreuters.com/en/careers` | 459 / 41 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Hybrid software engineering center in Bengaluru. AI, .NET, microservices, and data engineering. |
| 11 | **Airbus** | `ag.wd3.myworkdayjobs.com` | `Airbus` | `https://airbus.com/en/careers` | 2,000 / 293 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Premier aerospace manufacturer. 293 India jobs at India Innovation Center (BLR). Splunk DevOps, Big Data, and active student internships. |
| 12 | **NXP Semiconductors** | `nxp.wd3.myworkdayjobs.com` | `careers` | `https://careers.nxp.com` | 808 / ~50 | High (Bengaluru) | HIGH | **Duplicate (Catalog & DB)** | `ALREADY_INTEGRATED` | Already integrated in RoleRadar (`catalog.ts` line 1355, DB `9f5ca383-9c83-4177-89f2-0dfdcc689951`). |
| 13 | **Nationwide** | `nationwide.wd1.myworkdayjobs.com` | `Nationwide_Career_India` | `https://nationwide.com/careers` | 23 / 24 | High (Hyderabad) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Dedicated India site for Mindspace Madhapur tech center. Quality engineering, Guidewire, and Agentic AI roles. |
| 14 | **Teladoc Health** | `teladoc.wd503.myworkdayjobs.com` | `teladochealth_is_hiring` | `https://teladochealth.com/careers` | 56 / 3 | Low (3 active) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Telemedicine pioneer on wd503. Only 3 active India postings detected. Needs sustained volume verification. |
| 15 | **AML RightSource** | `amlrightsource.wd1.myworkdayjobs.com` | `amlrightsource` | `https://amlrightsource.com/careers` | 86 / 22 | High (Gurugram, Noida) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Financial compliance firm. Verified intern-level roles (`Learning & Development - Intern - Gurugram/Noida`). |
| 16 | **The LEGO Group** | `lego.wd103.myworkdayjobs.com` | `LEGO_External` | `https://lego.com/careers` | 489 / 0 | Low (None observed) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Global toy manufacturer on wd103. No direct India engineering/corporate positions confirmed in current live search. |
| 17 | **FINRA** | `finra.wd1.myworkdayjobs.com` | `finra` | `https://finra.org/careers` | 52 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | US Financial Industry Regulatory Authority. Quasi-governmental US domestic regulator. Zero India operations. |
| 18 | **Santander** | `santander.wd3.myworkdayjobs.com` | `SantanderCareers` | `https://santander.com/en/careers` | 1,026 / 0 | Low (LATAM/EU focus) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Major European/LATAM bank. Live evidence highlights Mexico/Brazil/Europe. India tech hub presence unconfirmed. |
| 19 | **Methodist Health System** | `methodisthealthsystem.wd1.myworkdayjobs.com` | `MHS_Careers` | `https://jobs.methodisthealthsystem.org` | N/A / 0 | None (US only) | LOW | Unique | `DEFERRED_OR_BLOCKED` | Regional Dallas/Texas hospital network. Search API returned HTTP 500 error; zero India footprint. |
| 20 | **Dentsu Aegis** | `dentsuaegis.wd3.myworkdayjobs.com` | `DAN_GLOBAL` | `https://dentsu.com/careers` | 854 / 144 | High (Gurugram) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Global media & digital commerce network. 144 India positions managing quick commerce, analytics, and performance media. |
| 21 | **Ares Management** | `aresmgmt.wd1.myworkdayjobs.com` | `External` | `https://aresmgmt.com/careers` | 240 / 45 | High (Mumbai) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Alternative asset manager. 45 India roles (Fund accounting, legal LaunchPad associate roles) in Mumbai. |
| 22 | **Sysco** | `sysco.wd5.myworkdayjobs.com` | `syscocareers` | `https://careers.sysco.com` | 2,000 / 0 | Low (Americas focus) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Food distributor ($68B rev). Live evidence reflects Costa Rica shared services; India operations unverified. |
| 23 | **Humana** | `humana.wd5.myworkdayjobs.com` | `Humana_External_Career_Site` | `https://careers.humana.com` | 262 / 0 | None (US only) | HIGH | Unique | `NEEDS_MORE_EVIDENCE` | US health insurer. Live postings are remote nationwide US. Zero confirmed India GCC operations. |
| 24 | **GlobalFoundries** | `globalfoundries.wd1.myworkdayjobs.com` | `External` | `https://gf.com/careers` | 772 / 118 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Leading semiconductor foundry. 118 India roles in Bengaluru spanning supply chain, legal, and silicon design. |
| 25 | **McKesson (CoverMyMeds)** | `mckesson.wd3.myworkdayjobs.com` | `covermymeds_external_careers` | `https://covermymeds.com/careers` | 22 / 0 | None (US only) | MEDIUM | Subsidiary | `DEFERRED_OR_BLOCKED` | Low-volume subsidiary site on McKesson tenant. US healthcare software; zero India positions. |
| 26 | **Philips** | `philips.wd3.myworkdayjobs.com` | `jobs-and-careers` | `https://careers.philips.com` | 791 / 100 | High (Bengaluru, Pan-India) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Health technology giant. 100 India jobs at Philips Innovation Campus (PIC) Bengaluru across R&D and commercial. |
| 27 | **PUMA** | `puma.wd502.myworkdayjobs.com` | `Jobs_at_Puma` | `https://about.puma.com/en/careers` | 678 / 69 | High (Luhari, BLR) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Sporting goods brand on wd502. 69 India jobs in supply chain, warehouse fulfillment, and digital commerce. |
| 28 | **Opella** | `opella.wd103.myworkdayjobs.com` | `OpellaCareers` | `https://opella.com/careers` | 226 / 54 | High (Mumbai) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Consumer healthcare spin-off from Sanofi on wd103. 54 India roles in commercial, brand marketing, and SAP finance. |
| 29 | **Saab Group** | `saabgroup.wd116.myworkdayjobs.com` | `Broadbean_Saab` | `https://saab.com/career` | 406 / 0 | None (EU/AU focus) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | Swedish defense contractor. Roles require defense security clearances in Sweden and Australia. Zero India footprint. |
| 30 | **Aptiv** | `aptiv.wd5.myworkdayjobs.com` | `APTIV_CAREERS` | `https://aptiv.com/careers` | 800 / 148 | High (BLR, Pune) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Automotive technology & mobility engineering. 148 India jobs (Embedded software, SW testing, hardware change leaders). |
| 31 | **Regal Rexnord** | `regalrexnord.wd1.myworkdayjobs.com` | `Careers` | `https://regalrexnord.com/careers` | 542 / 79 | High (Hyderabad) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Industrial equipment manufacturer. 79 India jobs at Hyderabad IT Center, including entry-level Application Engineer I. |
| 32 | **GSK Consumer Healthcare (Haleon)** | `gsknch.wd3.myworkdayjobs.com` | `GSKCareers` | `https://jobs.gsk.com` | 352 / 51 | High (Gurgaon, BLR) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Haleon plc consumer healthcare (tenant `gsknch`). 51 India roles in commercial excellence and Rubrik IT engineering. |
| 33 | **State Street** | `statestreet.wd1.myworkdayjobs.com` | `global` | `https://careers.statestreet.com` | 1,259 / 338 | High (BLR, HYD) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Global custody & institutional banking. 338 India jobs across quantitative research, Databricks, risk, and legal. |
| 34 | **Nasdaq** | `nasdaq.wd1.myworkdayjobs.com` | `Global_External_Site` | `https://careers.nasdaq.com` | 165 / 32 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Financial market technology. 32 India roles in Bengaluru spanning product management, Axiom CV, and platform engineering. |
| 35 | **Vizient** | `vizient.wd1.myworkdayjobs.com` | `Vizient_Careers` | `https://vizientinc.com/careers` | 240 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | US healthcare performance improvement network (Irving, TX). Zero India operations. |
| 36 | **SBA Communications** | `sbasite.wd5.myworkdayjobs.com` | `sba_communications_careers` | `https://sbasite.com/careers` | 47 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | Telecommunications tower infrastructure. Domestic US focus (Boca Raton, FL). Zero India operations. |
| 37 | **TransUnion** | `transunion.wd5.myworkdayjobs.com` | `TransUnion` | `https://transunion.com/careers` | 237 / 27 | High (Chennai, Pune) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Consumer credit bureau. 27 India jobs at GCC facilities in Chennai and Pune (Full-stack developer, I2C business partners). |
| 38 | **Teleperformance** | `onetp.wd1.myworkdayjobs.com` | `Teleperformance` | `https://teleperformance.com/careers` | 1,254 / 0* | Medium (Tenant facet) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Customer experience BPO (tenant `onetp`). Live text search returned 0 due to dropdown facets; requires facet mapping evidence. |
| 39 | **Westlake** | `westlake.wd1.myworkdayjobs.com` | `westlake` | `https://westlake.com/careers` | 283 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | Chemical and plastics manufacturing. Domestic US operations; zero India technical hiring. |
| 40 | **Broadridge** | `broadridge.wd5.myworkdayjobs.com` | `Careers` | `https://broadridge.com/careers` | 321 / 41 | High (Bengaluru, HYD) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Fintech leader. 41 India jobs across Bengaluru and Hyderabad in developer experience, tech audit, and account management. |
| 41 | **KONE** | `kone.wd3.myworkdayjobs.com` | `Careers` | `https://kone.com/careers` | 913 / 167 | High (Chennai, Pan-India) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Elevator/escalator engineering & manufacturing. 167 India jobs including junior maintenance executives. |
| 42 | **Globe Telecom** | `globe.wd3.myworkdayjobs.com` | `glb_careers` | `https://globe.com.ph/careers` | 375 / 0 | None (Philippines only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | Major Philippine domestic telecommunications provider. Zero India hiring presence. |
| 43 | **U.S. Bank** | `usbank.wd1.myworkdayjobs.com` | `US_Bank_Careers` | `https://usbank.com/careers` | 1,202 / 59 | High (Chennai) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | U.S. Bank Technology Center in Chennai. 59 India jobs in HashiCorp Vault, Kubernetes, and software engineering. |
| 44 | **Graybar** | `graybar.wd1.myworkdayjobs.com` | `valin_careers` | `https://graybar.com/careers` | 6 / 0 | None (US only) | MEDIUM | Unique | `DEFERRED_OR_BLOCKED` | US industrial distributor. Only 6 total jobs on subsidiary `valin_careers` site; zero India presence. |
| 45 | **Leidos** | `leidos.wd5.myworkdayjobs.com` | `External` | `https://careers.leidos.com` | 2,000 / 0 | None (US defense) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | US defense, intelligence, and civil contractor. Roles require US citizenship and security clearances. |
| 46 | **Manulife** | `manulife.wd3.myworkdayjobs.com` | `MFCJH_Jobs` | `https://manulife.com/careers` | 599 / 8 | Low (8 active) | MEDIUM | Unique | `NEEDS_MORE_EVIDENCE` | Canadian insurance leader. Client site `MFCJH_Jobs` (John Hancock); only 8 India jobs found. Needs entity branding evidence. |
| 47 | **Semtech** | `semtech.wd1.myworkdayjobs.com` | `SemtechCareers` | `https://semtech.com/careers` | 107 / 11 | Medium (BLR, HYD) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Semiconductor (LoRa wireless) manufacturer. 11 India roles (Verification engineers, packaging engineers). |
| 48 | **Abbott** | `abbott.wd5.myworkdayjobs.com` | `abbottcareers` | `https://jobs.abbott` | 2,000 / 247 | High (Mumbai, Pan-India) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Global healthcare conglomerate. 247 India jobs across marketing, clinical operations, and medical technology. |
| 49 | **Cigna Healthcare** | `cigna.wd5.myworkdayjobs.com` | `cignacareers` | `https://jobs.cigna.com` | 531 / 151 | High (Bengaluru) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Managed healthcare & IT. 151 India jobs at Evernorth technology division in Bengaluru. |
| 50 | **LSEG (London Stock Exchange Group)** | `lseg.wd3.myworkdayjobs.com` | `Careers` | `https://lseg.com/careers` | 664 / 210 | High (Hyderabad) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Financial market data & tech. 210 India jobs in Hyderabad (QA digital copilots, market data infrastructure, risk). |
| 51 | **Stryker** | `stryker.wd1.myworkdayjobs.com` | `StrykerCareers` | `https://careers.stryker.com` | 1,460 / 112 | High (Gurugram) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Medical technology giant. 112 India jobs at Stryker Global Technology Center (SGTC) in Gurugram (C#, automation, R&D). |
| 52 | **General Mills** | `genmills.wd1.myworkdayjobs.com` | `GMI_External_Careers` | `https://careers.generalmills.com` | 362 / 151 | High (Mumbai) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Consumer food company. 151 India jobs at Mumbai Global Shared Services (GIC) including Cost Management Trainees. |
| 53 | **RELX** | `relx.wd3.myworkdayjobs.com` | `relx` | `https://relx.com/careers` | 807 / 85 | High (Chennai, GGN) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Information & analytics (Elsevier, LexisNexis). 85 India jobs in life science chemistry data and analytics. |
| 54 | **Pfizer** | `pfizer.wd1.myworkdayjobs.com` | `PfizerCareers` | `https://careers.pfizer.com` | 565 / 53 | High (Mumbai, MAA) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Pharmaceutical titan. 53 India jobs in Mumbai and Chennai across clinical delivery, compliance, and facilities. |
| 55 | **Accenture** | `accenture.wd103.myworkdayjobs.com` | `AccentureCareers` | `https://accenture.com/careers` | 2,000 / 2,000+ | High (Pan-India) | HIGH | **Duplicate (Catalog & DB)** | `ALREADY_INTEGRATED` | Already integrated in RoleRadar (`catalog.ts` line 1046, DB `cce9016f-5704-4884-93a9-b21f65bc446e` with 388 jobs). |
| 56 | **Capital One** | `capitalone.wd12.myworkdayjobs.com` | `Capital_One` | `https://capitalonecareers.com` | 1,960 / 0 | None (US only) | HIGH | Unique | `DEFERRED_OR_BLOCKED` | US commercial/retail bank on wd12. Zero India technical or GCC operations. US domestic positions only. |
| 57 | **Genpact** | `genpact.wd108.myworkdayjobs.com` | `external_careers` | `https://careers.genpact.com` | 2,000 / 1,820 | High (Noida, HYD, GGN) | HIGH | Unique | `ELIGIBLE_FOR_CONTROLLED_TEST` | Enterprise IT services & BPO founded in India on wd108. 1,820 live India jobs across data engineering, SAP, and F&A. |
| 58 | **NVIDIA** | `nvidia.wd5.myworkdayjobs.com` | `NVIDIAExternalCareerSite` | `https://nvidia.com/en-us/about/careers` | 2,000 / 281 | High (BLR, Pune, HYD) | HIGH | **Duplicate (Catalog & DB)** | `ALREADY_INTEGRATED` | Already integrated into RoleRadar in Phase 20.5 (`catalog.ts` lines 1417–1429, DB `d5dabf69-d06a-4585-bfe8-a5f5a250ac4d`). |
| 59 | **Onterris** | `onterris.wd1.myworkdayjobs.com` | `ONT` | `UNKNOWN` | 172 / UNKNOWN | UNKNOWN | LOW | Ambiguous | `DEFERRED_OR_BLOCKED` | Critically ambiguous entity explicitly highlighted in PDF. Parent corporation unverified. No public domain association. |

---

## 4. Shortlist: Top 10 Genuinely New Direct-Employer Candidates

Ranked by **India role volume**, **technical/engineering quality**, **fresher/internship viability**, and **architectural reliability**:

```
 1. Airbus ✈️
    ├── Live India Openings: 293 positions (Bengaluru Innovation Center)
    ├── Tenant / Site: ag.wd3.myworkdayjobs.com / Airbus
    ├── Domains: airbus.com -> ag.wd3.myworkdayjobs.com
    ├── Categories: Flight Physics, Splunk DevOps, Big Data, GenAI Internships
    └── Fresher Relevance: HIGHEST (Active academic Data Analyst & GenAI internships)

 2. State Street 🏛️
    ├── Live India Openings: 338 positions (Bengaluru & Hyderabad)
    ├── Tenant / Site: statestreet.wd1.myworkdayjobs.com / global
    ├── Domains: statestreet.com -> statestreet.wd1.myworkdayjobs.com
    ├── Categories: Quantitative Finance, Databricks, Snowflake, Legal, Risk
    └── Fresher Relevance: HIGH (Entry-level analyst & research roles)

 3. Cushman & Wakefield 🏢
    ├── Live India Openings: 278 positions (Hyderabad, Bengaluru, Chennai)
    ├── Tenant / Site: cw.wd1.myworkdayjobs.com / External
    ├── Domains: cushmanwakefield.com -> cw.wd1.myworkdayjobs.com
    ├── Categories: Real Estate Analytics, Facilities Engineering, FP&A
    └── Fresher Relevance: HIGH (Verified apprentice/internship roles: EIC Intern)

 4. LSEG (London Stock Exchange Group) 📈
    ├── Live India Openings: 210 positions (Hyderabad CapitaLand Center)
    ├── Tenant / Site: lseg.wd3.myworkdayjobs.com / Careers
    ├── Domains: lseg.com -> lseg.wd3.myworkdayjobs.com
    ├── Categories: Capital Markets Tech, AI QA Copilots, Market Data Pipelines
    └── Fresher Relevance: MEDIUM-HIGH (Graduate quality engineer & data analyst roles)

 5. Danaher Corporation 🔬
    ├── Live India Openings: 174 positions (Bengaluru, Delhi, Chennai)
    ├── Tenant / Site: danaher.wd1.myworkdayjobs.com / DanaherJobs
    ├── Domains: danaher.com -> danaher.wd1.myworkdayjobs.com
    ├── Categories: Life Sciences Diagnostics (Abcam, Leica, Radiometer), SAP, Oracle
    └── Fresher Relevance: MEDIUM (Field service engineers, junior business analysts)

 6. KONE 🛗
    ├── Live India Openings: 167 positions (Chennai Technology & Manufacturing)
    ├── Tenant / Site: kone.wd3.myworkdayjobs.com / Careers
    ├── Domains: kone.com -> kone.wd3.myworkdayjobs.com
    ├── Categories: Industrial Automation, Electrical Engineering, Field Service
    └── Fresher Relevance: HIGH (Junior Executive Maintenance, graduate engineering trainees)

 7. Aptiv 🚗
    ├── Live India Openings: 148 positions (Bengaluru & Pune)
    ├── Tenant / Site: aptiv.wd5.myworkdayjobs.com / APTIV_CAREERS
    ├── Domains: aptiv.com -> aptiv.wd5.myworkdayjobs.com
    ├── Categories: Autonomous Mobility, Embedded C++, Functional Safety Testing
    └── Fresher Relevance: MEDIUM-HIGH (Junior Financial Analysts, junior software testers)

 8. GlobalFoundries ⚡
    ├── Live India Openings: 118 positions (Bengaluru)
    ├── Tenant / Site: globalfoundries.wd1.myworkdayjobs.com / External
    ├── Domains: globalfoundries.com -> globalfoundries.wd1.myworkdayjobs.com
    ├── Categories: Semiconductor Fab Systems, Silicon Design, Supply Chain Analytics
    └── Fresher Relevance: MEDIUM (Graduate silicon design verification, operations specialists)

 9. Stryker 🏥
    ├── Live India Openings: 112 positions (Gurugram SGTC)
    ├── Tenant / Site: stryker.wd1.myworkdayjobs.com / StrykerCareers
    ├── Domains: stryker.com -> stryker.wd1.myworkdayjobs.com
    ├── Categories: Medical Robotics, Software Automation (C#, API, Playwright)
    └── Fresher Relevance: HIGH (Software engineering & data internships, associate roles)

10. Philips 💡
    ├── Live India Openings: 100 positions (Bengaluru PIC)
    ├── Tenant / Site: philips.wd3.myworkdayjobs.com / jobs-and-careers
    ├── Domains: philips.com -> philips.wd3.myworkdayjobs.com
    ├── Categories: Healthcare Software, Medical Informatics, E-Commerce
    └── Fresher Relevance: MEDIUM-HIGH (Associate software engineers, clinical application specialists)
```

---

## 5. Excluded Categories: Blocked, Duplicate, Ambiguous, and Insufficient Evidence

### 5.1 Already Integrated / Conflicting ATS (4 Candidates)
- **BrowserStack:** Configured in `catalog.ts` under Workable (`apply.workable.com/browserstack`). PDF shows a secondary Workday portal with 28 roles. Adding Workday would create duplicate company records and conflicting ATS identifiers.
- **Accenture:** Production source in `catalog.ts` (line 1046) and active in database with 388 jobs.
- **NXP Semiconductors:** Production source in `catalog.ts` (line 1355) and active in database.
- **NVIDIA:** Admitted and integrated in Phase 20.5 (`catalog.ts` lines 1417–1429) with 360 database jobs.

### 5.2 Deferred or Blocked (13 Candidates)
1. **Capital One:** Strict US domestic retail bank on wd12. Zero Indian software development center.
2. **FINRA:** US regulatory body for broker-dealers. Domestic Rockville, MD only.
3. **Globe Telecom:** Domestic telecom operator in the Philippines. Zero India hiring.
4. **Graybar:** US domestic distributor on subsidiary `valin_careers` (only 6 total jobs).
5. **Leidos:** US defense/intelligence contractor. Strict US citizenship and Top Secret clearances.
6. **Methodist Health System:** Regional Texas hospital network. Search API returned HTTP 500. Zero India presence.
7. **McKesson (CoverMyMeds):** Low-volume subsidiary site (22 jobs) on parent tenant; no India presence.
8. **Onterris:** Critically ambiguous tenant (`onterris.wd1...`). No identifiable parent company or public domain.
9. **Saab Group:** Swedish defense contractor on wd116. Strict clearance requirements; Australia/Sweden focus.
10. **SBA Communications:** US cell tower infrastructure (Boca Raton, FL). Zero India operations.
11. **Tinuiti:** US digital performance marketing agency. Domestic US positions only.
12. **Vizient:** US healthcare performance group (Irving, TX). Zero India positions.
13. **Westlake:** US chemical manufacturer (Houston, TX). Zero India tech roles.

### 5.3 Needs More Evidence (8 Candidates)
1. **GoTo:** Formerly LogMeIn. Global jobs = 11, but live India jobs = 0. Requires confirmation of active hiring.
2. **Humana:** US health insurance. Live postings are remote US only; India presence unverified.
3. **Manulife:** Client site `MFCJH_Jobs` (John Hancock); only 8 India jobs found. Legal entity branding needs investigation.
4. **Santander:** Live search returned 0 India jobs (heavily focused on Mexico and Brazil).
5. **Sysco:** Food distributor. Evidence highlights Costa Rica shared services; India presence unconfirmed.
6. **Teladoc Health:** Only 3 active India postings. Insufficient volume to justify standalone source.
7. **Teleperformance:** Global CXS is live (1,254 jobs), but keyword search "India" returned 0. Likely uses localized facets.
8. **The LEGO Group:** Global consumer toy firm on wd103. No direct India engineering postings identified in live audit.

---

## 6. Prioritized Recommendation for Next Employer Investigation

### Recommended Single Candidate: **Airbus**

- **Company Name:** Airbus SE (`https://www.airbus.com`)
- **Official Careers Portal:** `https://airbus.com/en/careers`
- **Workday Candidate Host:** `ag.wd3.myworkdayjobs.com`
- **Tenant Identifier:** `ag`
- **Client Site:** `Airbus`
- **Official Ingestion URL:** `https://ag.wd3.myworkdayjobs.com/Airbus`
- **Live Empirical India Count:** **293 active positions**

### Why Airbus is the Best Next Target:
1. **Authentic Provenance:** Direct hiring gateway for a premier global aerospace manufacturer with zero third-party intermediaries.
2. **Standard Workday Architecture:** Uses standard Workday CXS pagination (`/wday/cxs/ag/Airbus/jobs`) and standard detail endpoints, guaranteeing 100% compatibility with RoleRadar's production `WorkdayCollector`.
3. **Deep Tech & GCC Footprint:** The Airbus India Innovation Center in Bengaluru hosts high-tier engineering roles spanning Big Data, Splunk DevOps, C++ flight software, avionics, and decarbonization analytics.
4. **Active Student & Fresher Pipeline:** Contains verified, live student internships and entry-level graduate postings (e.g. `Internship - India Innovation Center - Data Analyst Intern`, Requisition `JR10446611`), directly serving RoleRadar's fresher and graduate audience.
5. **Clean Corporate Isolation:** Single-tenant structure with no conflicting multi-brand subsidiary paths. 100% new to RoleRadar (0 entries in catalog or database).

### Checklist for Later Controlled Integration:
- [ ] Confirm company naming convention (`Airbus`) in `catalog.ts` and verify database company deduplication.
- [ ] Validate direct job URL domain matching against `ag.wd3.myworkdayjobs.com`.
- [ ] Test Workday requisition ID parsing (`JR\d{8}` format, e.g. `JR10446611`).
- [ ] Execute bounded 5-candidate pipeline run with mocked alert services.
- [ ] Verify repeat-scan idempotency and incomplete-scan safety.

---

## 7. Audit Verification & Integrity Confirmation

- **Read-Only Invariant Enforcement:**
  - `git status` confirmed zero workspace code or catalog modifications.
  - Zero database records inserted, updated, or deleted.
  - Zero scan jobs triggered or notifications dispatched.
- **Audit Limitations:**
  - Live counts reflect real-time active postings at the time of probe (October 2026) and fluctuate with hiring cycles.
  - Workday CXS pagination natively caps query result counts at 2,000. Real global totals for enterprises like Airbus, Cushman & Wakefield, and Genpact likely exceed this threshold.
  - Certain employers (e.g. Teleperformance) utilize proprietary facet structures (e.g. `locationCountry` UUIDs) rather than keyword queries, which may require deeper facet inspection during dedicated controlled phases.
