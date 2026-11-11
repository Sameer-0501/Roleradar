# RoleRadar — Engine 3 Critical Stabilization & Candidate Evidence Integrity Report
## Stage 1 Stabilization: Career Evidence Profile & Resume Studio 2.0

**Document Reference:** `ROLERADAR_ENGINE3_CRITICAL_STABILIZATION_REPORT.md`  
**Execution Date:** November 11, 2026  
**Status:** **STAGE 1 COMPLETE — ALL 13 DOM ACCEPTANCE SCENARIOS PASSED (100%)**  
**Engineering Standards Compliance:** Full compliance with `docs/ENGINEERING_STANDARDS.md` and `ROLERADAR_PRODUCT_MASTER_BLUEPRINT.md` (Sections 5 & 6).  
**Stop Gate Policy:** Strictly enforced. No remote pushes performed. No Stage 2 architectural changes initiated.

---

## 1. Executive Summary & Change Authorization

Following the forensic DOM audit documented in `ROLERADAR_ENGINE2_ENGINE3_DOM_FORENSIC_REPORT.md`, this implementation cycle addressed all confirmed **Stage 1 user-facing defects** across **Engine 3 (Master Career Evidence Profile & Resume Studio 2.0)** and **Candidate Profile Management**:

1. **P0 — Resume Studio Initialization Crash Resolved:** Eliminated the runtime exception (`TypeError: jobsService.listVerifiedJobs is not a function at ResumeStudioView.ts:160`). Decoupled verified job fetching from essential profile/evidence loading so job network delays or empty sets cannot crash Resume Studio. Added explicit empty states, inline retry triggers, and tab descriptive banners.
2. **P0 — Candidate Education Removal & Direct Controls:** Implemented authenticated, user-isolated deletion and addition of candidate education records (`DELETE /candidate/educations/:id`, `POST /candidate/educations`). Added visible, accessible `.btn-delete-profile-edu` action buttons with native confirmation prompts and inline completeness recalculation. Designed and enforced bullet-unlinking semantics to cleanly downgrade referencing resume bullets to `UNLINKED` and remove backing evidence without leaving orphaned foreign keys.
3. **P1 — Deterministic Education Deduplication in Resume Parser:** Replaced unconditional `INSERT INTO candidate_educations` in `uploadAndParseResume()` with normalized, deterministic duplicate detection. Canonicalized degree titles (`b.tech / b.e.`, `m.tech / m.e.`, `bca`, `mca`, `b.sc`, `m.sc`), normalized institutions with Indian college acronym expansion (e.g. `IIT` ↔ `Indian Institute of Technology`), and preserved distinct legitimate qualifications from the same university. Repeated uploads of identical resumes now execute idempotently with zero duplicate rows.
4. **P1 — Evidence Vault Synchronization Granularity & Auto-Sync:** Automated Evidence Vault synchronization upon resume parsing with graceful error containment. Enhanced `syncProfileToEvidence()` to prune orphaned evidence claims, unlink affected resume bullets, and return a granular breakdown (`syncedCount`, `updatedCount`, `alreadyUpToDateCount`, `totalActiveClaims`). Replaced confusing "0 claims" toasts with accurate, reassuring status feedback.

Every modification was verified through automated unit/integration test suites (55 passed tests) and live Playwright browser acceptance tests across **13 distinct end-to-end DOM scenarios**.

---

## 2. Initial Git & Runtime State

### 2.1 Git Status
- **Branch:** `main` (ahead of `origin/main` by 13 commits, local uncommitted workspace).
- **Target Repository:** `RoleRadar` (`c:\Users\Samee\Documents\RoleRadar`).
- **Remote Push Policy:** Strictly forbidden during this phase. No pushes performed.

### 2.2 Preserved Files Verified
The three previously identified Notification Digest worker files were checked and confirmed clean and unmodified:
- `backend/src/notifications/digest-worker.ts` — **Unmodified**
- `backend/src/notifications/email/providers/smtp-provider.ts` — **Unmodified**
- `backend/src/tests/digest-concurrency-integration.test.ts` — **Unmodified**

### 2.3 Runtime Services
- **Backend API:** Node.js / Express running on `http://localhost:4000` (PID 13076).
- **Frontend Dashboard:** Vite v7.3.1 running on `http://localhost:5173`.
- **Database:** PostgreSQL on `localhost:5433` (`roleradar`).

---

## 3. Confirmed Defects & Root Causes

| Defect ID | Priority | Description | Root Cause | Implemented Solution |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-E3-01** | **P0** | Resume Studio 2.0 crashed on initial load with red error card: `jobsService.listVerifiedJobs is not a function`. | `ResumeStudioView.ts` called nonexistent method `jobsService.listVerifiedJobs()`. The actual exported method in `jobs.service.ts` is `getVerifiedJobs(page, limit, days)`. Furthermore, failure to load jobs halted entire Studio initialization. | Replaced call with `jobsService.getVerifiedJobs(1, 50)`. Wrapped in independent try/catch block to decouple job loading from essential profile and evidence data. Added inline retry button `#btn-retry-studio-jobs`. |
| **DEF-E3-02** | **P0** | No mechanism for candidates to delete education records. Stale or duplicate education cards remained permanently in UI. | `candidate_educations` had no delete endpoint, no frontend API method, and `CandidateProfileView.ts` rendered education cards with zero action controls. | Created `DELETE /candidate/educations/:id`, wired frontend `deleteEducation()`, added `.btn-delete-profile-edu` button with confirmation dialog, and safely unlinked any linked resume bullets. |
| **DEF-E3-03** | **P1** | Re-uploading a resume created duplicate education rows unconditionally. Four identical degrees appeared in database. | `uploadAndParseResume()` in `profile-service.ts` mapped extracted degrees and executed unconditional `insert(schema.candidateEducations).values(...)` without matching existing rows. | Implemented `isSameEducation()` with canonical degree normalizers (`normalizeDegree`), institution normalizers (`normalizeInstitution`), and field normalizers. Uploads now deduplicate idempotently. |
| **DEF-E3-04** | **P1** | Deleting uploaded resume document left extracted education and skills behind with no way to remove stale education. | Expected platform architecture separates the raw PDF document from candidate career profile data, but lacked direct controls on education. | Added direct candidate controls for education (Add & Delete) while preserving the deliberate separation between raw document storage and structured profile records. |
| **DEF-E3-05** | **P1** | Evidence Vault sync button reported "Vault synced: 0 atomic claims up to date!", confusing candidates. | `syncProfileToEvidence()` only counted newly inserted rows (`insertedCount`). When claims were already synced, it returned 0 without reporting existing active claims. | Updated `syncProfileToEvidence()` to calculate and return `SyncEvidenceResult` (`syncedCount`, `updatedCount`, `alreadyUpToDateCount`, `totalActiveClaims`). Updated UI toast to report "all N claims are synchronized". |
| **DEF-E3-06** | **P1** | Automatic Evidence Vault synchronization was missing upon resume parsing. | Resume parser populated `candidate_educations` and `candidate_skills`, but did not trigger `syncProfileToEvidence()`. Candidates had to manually locate Resume Studio and click Sync. | Integrated automatic post-parse vault sync in `uploadAndParseResume()` with error containment, ensuring immediate reflection of extracted credentials in the Evidence Vault. |

---

## 4. Architectural & Code Modifications

### 4.1 Backend Services

#### `backend/src/resumes/career-evidence-service.ts`
- **Granular Synchronization Return:**
  ```typescript
  export interface SyncEvidenceResult {
    syncedCount: number;
    updatedCount: number;
    alreadyUpToDateCount: number;
    totalActiveClaims: number;
  }
  ```
- **Pruning & Bullet Unlinking:** When `syncProfileToEvidence(userId)` runs, claims referencing removed source entities are identified. Referencing `resume_bullets` are safely updated (`provenance_state = 'UNLINKED'`, `evidence_id = null`), and orphaned claims are deleted from `candidate_evidence`.
- **`addCandidateEducation(userId, eduInput)`:** Inserts new education row and immediately reflects it as a `SELF_REPORTED` claim in `candidate_evidence`.
- **`deleteCandidateEducation(userId, educationId)`:**
  1. Verifies ownership (`where(and(eq(id, educationId), eq(user_id, userId)))`).
  2. Finds corresponding `candidate_evidence` claim.
  3. Updates any `resume_bullets` linked to that claim to `provenance_state = 'UNLINKED'`.
  4. Deletes claim from `candidate_evidence`.
  5. Deletes education record from `candidate_educations`.
  6. Recalculates candidate profile completeness.

#### `backend/src/resume/profile-service.ts`
- **`normalizeInstitution(name: string): string`:** Strips prefixes ("from", "at"), special characters, collapses whitespace, and ignores case.
- **`normalizeDegree(deg: string): string`:** Maps colloquial or ATS-extracted variations to canonical degrees:
  - `btech`, `b.tech`, `be`, `b.e.`, `bachelor of technology`, `bachelor of engineering` → `'b.tech / b.e.'`
  - `mtech`, `m.tech`, `me`, `m.e.`, `master of technology`, `master of engineering` → `'m.tech / m.e.'`
  - `bca`, `bachelor of computer applications` → `'bca'`
  - `mca`, `master of computer applications` → `'mca'`
  - `bsc`, `b.sc`, `bachelor of science` → `'b.sc'`
  - `msc`, `m.sc`, `master of science` → `'m.sc'`
- **`normalizeFieldOfStudy(field?: string | null): string`:** Normalizes major specializations (e.g. `cse`, `computer science and engineering` → `'computer science & engineering'`).
- **`isSameEducation(existing, candidate): boolean`:** Multi-factor deterministic comparison:
  1. Normalized degree must match (preserves B.Tech and M.Tech from the same college).
  2. Normalized institution matches with Indian college acronym expansion (e.g. `IIT` ↔ `Indian Institute of Technology`).
  3. Start and graduation years must not conflict.
  4. Field of study must not conflict.
- **`uploadAndParseResume(...)`:** Checks parsed education items against existing database rows. If identical, enriches missing fields (e.g. institution or graduation year) without duplicate insertion. Automatically triggers `syncProfileToEvidence()` post-parse.

#### `backend/src/api/resumes.ts` & `backend/src/api/router.ts`
- Mounted authenticated endpoints:
  - `POST /candidate/educations` → `addCandidateEducationHandler`
  - `DELETE /candidate/educations/:id` → `deleteCandidateEducationHandler`
  - `DELETE /profile/educations/:id` (alias for backward compatibility)
  - `POST /candidate/evidence/sync` → Returns extended `{ syncedCount, updatedCount, alreadyUpToDateCount, totalActiveClaims, profile }`

### 4.2 Frontend Services & Views

#### `frontend/src/services/api/resumes.service.ts`
- Added `SyncEvidenceResponse` interface with detailed counts.
- Added `addEducation(data: CandidateEducationInput): Promise<CandidateEducation>`.
- Added `deleteEducation(educationId: string): Promise<{ success: boolean; message: string }>`.

#### `frontend/src/views/profile/CandidateProfileView.ts`
- Added visible `.btn-delete-profile-edu` button alongside degree cards in `eduHtml`:
  ```html
  <button type="button" class="btn-delete-profile-edu" data-edu-id="${e.id}">Delete</button>
  ```
- Added collapsible `+ Add Education` form box (`#form-add-edu-box`) supporting degree, institution, field of study, start year, and end year.
- Wired native confirmation dialog (`window.confirm("Delete this education record from your profile?")`), optimistic button state, toast feedback, and immediate profile reload.
- Enhanced resume file reader to support both Base64 DataURL and raw text fallbacks across all file formats (.pdf, .docx, .txt).

#### `frontend/src/views/resume/ResumeStudioView.ts`
- Replaced nonexistent `jobsService.listVerifiedJobs()` call with `jobsService.getVerifiedJobs(1, 50)`.
- Decoupled verified jobs loading from core evidence profile loading.
- Added descriptive tab headers:
  - **Tailoring Studio:** *"Tailor truth-preserving resume bullets grounded in verified candidate claims."*
  - **Master Evidence Vault:** *"Single source of career truth. All claims are verified and backed by uploaded credentials or demonstrated projects."*
  - **Role Variants:** *"Maintain role-specific resume documents without duplicating candidate profile data."*
- Added empty-state messaging and `#btn-retry-studio-jobs` retry control.
- Updated sync toast feedback to clearly distinguish newly added claims from existing synchronized claims.

---

## 5. Education Deduplication & Normalization Algorithm

```
                  ┌──────────────────────────────────────────────┐
                  │       Incoming Parsed Education Entry        │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                     Normalize Degree: canonicalize degree
                    ('b.tech / b.e.', 'm.tech / m.e.', etc.)
                                         │
                                         ▼
                     Normalize Institution & Field of Study:
                       Expand Indian Acronyms (IIT, NIT, BITS)
                                         │
                                         ▼
                 ┌─────────────────────────────────────────────────┐
                 │ For each existing candidate_education in DB:    │
                 │ 1. Degree exact match?                          │
                 │    NO ──► Keep Distinct (e.g. B.Tech vs M.Tech) │
                 │    YES ──► Continue                             │
                 │ 2. Institution Match?                           │
                 │    (Exact, Substring, or Acronym Expanded)      │
                 │ 3. Field of Study Conflict? (None allowed)      │
                 │ 4. Graduation Year Conflict? (None allowed)     │
                 └───────────────────────┬─────────────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [MATCH FOUND]                   [NO MATCH FOUND]
            Enrich missing fields in DB.       Insert new row into
            Skip duplicate insert.             candidate_educations.
```

### Acronym & Text Normalization Table
| Raw Input A | Raw Input B | Match Result | Reason |
| :--- | :--- | :--- | :--- |
| `IIT Bombay` | `Indian Institute of Technology, Bombay` | **IDENTICAL** | Acronym expansion `IIT` ↔ `Indian Institute of Technology`. |
| `B.Tech in CSE` | `Bachelor of Technology in Computer Science & Engg` | **IDENTICAL** | Canonical degree `b.tech / b.e.` & normalized field `computer science & engineering`. |
| `BITS Pilani (2018 - 2022)` | `BITS Pilani, Goa Campus (2018 - 2022)` | **IDENTICAL** | Substring / campus match with identical graduation year. |
| `IIT Madras (B.Tech)` | `IIT Madras (M.Tech)` | **DISTINCT** | Degrees differ (`b.tech / b.e.` ≠ `m.tech / m.e.`). Preserved. |
| `Anna University (2020)` | `Anna University (2024)` | **DISTINCT** | Graduation years conflict (2020 ≠ 2024). Preserved. |

---

## 6. Education Deletion & Evidence Retention Semantics

When a candidate removes an education record via direct control:
1. **User Isolation:** The database query asserts `user_id = authUser.id`. Cross-candidate deletion attempts fail with HTTP 404/403.
2. **Evidence Pruning:** The backing record in `candidate_evidence` where `evidence_type = 'EDUCATION'` and `reference_id = educationId` is located and deleted.
3. **Bullet Unlinking (Zero Dangling Pointers):** Any `resume_bullets` pointing to this `evidence_id` are automatically updated:
   - `provenance_state` set to `'UNLINKED'`
   - `evidence_id` set to `NULL`
4. **Zero Fact Invention Guarantee:** Bullets are not silently deleted (preserving candidate customization), but their truth-preservation badge in Resume Studio immediately updates to `⚠ UNLINKED CLAIM`.
5. **Completeness Recalculation:** `completeness_score` is deterministically recalculated (deducting the 20 education points if no other education exists) and updated in `candidate_profiles`.

---

## 7. Automated Test Results

### 7.1 Vitest Backend Test Suites
All 4 targeted test suites passed with **100% success rate (55 passed tests)**:

| Test Suite | File | Tests | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **Engine 3 Stabilization Suite** | `src/tests/engine3-critical-stabilization.test.ts` | **12** | **PASS** | 1.04s |
| **Career Evidence & Resume Studio** | `src/tests/career-evidence-resume.test.ts` | **23** | **PASS** | 1.20s |
| **Profile & Account Views Decoupling** | `src/tests/wave2h-profile-account-views.test.ts` | **16** | **PASS** | 0.86s |
| **Candidate Profile Service API** | `src/tests/profile-api.test.ts` | **4** | **PASS** | 0.86s |
| **Total** | | **55** | **PASS** | **3.96s** |

#### Key Assertions Verified in `engine3-critical-stabilization.test.ts`:
- ✅ Adds education entry and automatically reflects in Evidence Vault.
- ✅ Prevents `userCandidate2` from deleting `userCandidate1` education record (Strict Isolation Guarantee).
- ✅ Returns `false` when attempting to delete a nonexistent education ID.
- ✅ Deletes candidate education, cleans vault evidence, and safely unlinks resume bullets.
- ✅ Normalizes institution variations (`from IIT Bombay` → `iit bombay`).
- ✅ Normalizes degree titles canonically across abbreviations.
- ✅ Detects identical qualifications across text formatting differences.
- ✅ Preserves distinct legitimate qualifications from the same institution.
- ✅ Detects duplicates even when optional start year is missing in one record.
- ✅ Repeated resume uploads do not duplicate education rows (Idempotency).
- ✅ Automatically synchronizes Master Evidence Vault upon resume upload.
- ✅ Returns accurate newly added vs already up-to-date claim counts.

### 7.2 Frontend Production Build
- Command: `cd frontend; npm run build`
- Modules Transformed: **2445 modules**
- Compilation Status: **0 errors, 0 warnings**
- Output: `dist/assets/index-DBqFQ913.js` (393.67 kB), `dist/assets/index-COz-m9_U.css` (175.71 kB).

---

## 8. Live Playwright DOM Acceptance Verification

The acceptance test script (`backend/src/scripts/dom-acceptance-engine3.ts`) was executed against the live application using a dedicated synthetic fixture (`synth_acceptance_candidate@roleradar.test`).

### Acceptance Summary Table (13 / 13 Passed)

| Scenario | Name | Status | Observed DOM Evidence |
| :---: | :--- | :---: | :--- |
| **1** | Candidate profile renders without errors | **PASS** | Profile loaded with heading "Candidate Profile & Resumes", score displayed, and sidebar rendered. |
| **2** | Education records visible with delete buttons | **PASS** | Rendered 2 education cards, each containing an active `.btn-delete-profile-edu` button. |
| **3** | Remove one education record with confirmation prompt | **PASS** | Native confirmation dialog accepted; deletion API succeeded (`DELETE /candidate/educations/:id`); DOM cards reduced to 1; DB rows reduced to 1. |
| **4** | Verify deletion persistence after page reload | **PASS** | Hard page reload performed; education count remained 1. Removed record did not reappear. |
| **5** | Other candidate information remains intact | **PASS** | Rendered skills count remained 3; DB skills count remained 3; profile completeness recalculated. |
| **6** | Upload same resume twice; assert no duplicates | **PASS** | Upload 1 resulted in 2 DB educations; Upload 2 of identical resume resulted in 2 DB educations (0 duplicates created). DOM displayed 2 deduplicated cards. |
| **7** | Resume Studio opens on first click without errors | **PASS** | Clicked "⚡ Resume Studio 2.0" button; navigated cleanly to `#/dashboard/resume`. Zero runtime exceptions; no `listVerifiedJobs` crash; workbench loaded. |
| **8** | Master Evidence Vault displays correct claims | **PASS** | Vault rendered all 7 claims with status badges (`DOCUMENT_SUPPORTED`, `SELF_REPORTED`) and filter tabs. |
| **9** | Repeated synchronization is idempotent | **PASS** | Clicked `#btn-sync-evidence` twice; database evidence count remained exactly 7 without duplicate claims. |
| **10** | Synchronization reports accurate totals in toast | **PASS** | Toast displayed: *"Vault up to date: all 7 claims are synchronized."* No confusing "0 claims" messaging. |
| **11** | Resume deletion preserves profile information | **PASS** | Deleted uploaded resume; 7 extracted skills and 2 educations remained intact in candidate profile. |
| **12** | Tailoring Studio handles verified jobs gracefully | **PASS** | Job dropdown (`#select-target-job`) populated with verified jobs; decoupled loading prevented blank screen. |
| **13** | Role Variants tab remains functional | **PASS** | Variants tab rendered description and functional controls (`#btn-goto-studio` visible). |

---

## 9. Database Integrity & Multi-Tenant Isolation Audit

1. **Isolation Check:** Attempting to issue a DELETE against an education ID belonging to another candidate returned 404/403 with zero modifications to the database row.
2. **Foreign Key Integrity:** Deleting an education record cleanly cascaded to `candidate_evidence` and nullified `evidence_id` in `resume_bullets`. No foreign key constraint violations occurred.
3. **Synthetic Teardown:** All synthetic candidates (`synth_acceptance_candidate@roleradar.test`, `synth_candidate1@roleradar.test`, `synth_candidate2@roleradar.test`) were completely removed in test teardown hooks. Real candidate data was completely untouched.

---

## 10. Known Limitations & Stage 2 Roadmap Handoff

The following non-blocking architectural items are reserved for **Stage 2 (Engine 2 Proof-Based Job Fit Architectural Integration)**:

1. **Engine 2 Transition to `candidate_evidence`:** Currently, Engine 2 evaluates candidate fit using `candidate_skills` and `candidate_profiles`. In Stage 2, Engine 2 will be transitioned to evaluate directly against the immutable `candidate_evidence` vault to leverage provenance verification levels (`DOCUMENT_SUPPORTED`, `PROJECT_SUPPORTED`).
2. **Direct Inline Education Editing:** Stage 1 implemented Education Add and Delete. Editing an existing education record is currently achieved by deleting and re-adding. Inline modal editing for education can be added in a future polish wave.
3. **Multi-Page Resume Variant PDF Export:** Resume Studio generates tailored bullets and ATS simulations; PDF rendering for variants is scheduled for Product Release 3.

---

## 11. Final Uncommitted Git Status

```
Changes not staged for commit:
	modified:   backend/src/api/resumes.ts
	modified:   backend/src/api/router.ts
	modified:   backend/src/resume/profile-service.ts
	modified:   backend/src/resumes/career-evidence-service.ts
	modified:   frontend/src/services/api/resumes.service.ts
	modified:   frontend/src/views/profile/CandidateProfileView.ts
	modified:   frontend/src/views/resume/ResumeStudioView.ts

Untracked files:
	backend/src/scripts/dom-acceptance-engine3.ts
	backend/src/tests/engine3-critical-stabilization.test.ts
```

- **Preserved Uncommitted Work:** Notification Digest worker files (`digest-worker.ts`, `smtp-provider.ts`, `digest-concurrency-integration.test.ts`) are 100% intact and clean.
- **Remote Push:** **ZERO** git pushes performed.
- **Stop Gate:** **STOPPED**. Awaiting user review and authorization for Stage 2.

