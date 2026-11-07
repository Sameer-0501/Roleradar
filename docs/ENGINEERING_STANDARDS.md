# RoleRadar — Permanent Engineering Standards & Acceptance Governance

**Document ID:** `RR-STD-2026-V1`  
**Effective Date:** November 7, 2026  
**Status:** Mandatory Engineering Gate  
**Target Architecture:** Node.js 20+ / Express / TypeScript Backend, PostgreSQL 16 / Drizzle ORM, React 19 / Vite / Tailwind v4 Frontend

---

## 1. Purpose & Scope

This document defines the permanent, non-negotiable engineering standards and acceptance gates for the RoleRadar platform. Every future feature, adapter, collector, pipeline stage, and architectural enhancement must comply with this standard before merging.

RoleRadar is an authentic job discovery, verification, and candidate readiness engine. Its foundational value proposition is absolute trust: zero phantom jobs, zero third-party aggregators, zero unverified links, and zero data leakage.

---

## 2. Terminology & Maturity Classification Standard

All status declarations across technical reports, pull requests, code reviews, and audits must strictly adhere to the following operational definitions:

| Classification | Strict Operational Definition | Evidence Requirement |
| :--- | :--- | :--- |
| **`IMPLEMENTED`** | Code, configuration, or database migrations are fully written and committed in the repository without placeholder stubs. | Complete source code, passing syntax checks, and type validation (`tsc --noEmit`). |
| **`TESTED`** | Feature has automated test coverage (unit, integration, or regression) executed against hermetic or synthetic fixtures. | Automated test run logs with command string, duration, pass counts, and exit code 0. |
| **`VERIFIED`** | Feature has been empirically demonstrated against live upstream systems or realistic runtime environments under authentic load/network conditions. | Live runtime output, network latency logs, database record snapshots, and end-to-end trace confirmation. |
| **`PRODUCTION-READY`** | Component satisfies all resilience, security, monitoring, rollback, and error-handling standards, ready for production traffic. | Bounded memory/CPU behavior, structured logging, graceful shutdown, health check endpoint, and zero credential dependencies. |
| **`DEFERRED`** | Scope, integration, or optimization intentionally postponed to a subsequent phase or awaiting external infrastructure. | Explicitly documented architectural rationale, deferred boundaries, and tracked follow-up ticket. |

---

## 3. Architecture & Source Governance

### 3.1 Official Employer Career Sources Only
1. **Direct ATS / Employer Career Sites Only:** RoleRadar accepts postings *only* directly from verified employer Applicant Tracking Systems (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, SAP Fieldglass/SuccessFactors, Workable, and verified custom employer career portals).
2. **Zero Aggregator Tolerance:** Job URLs from third-party aggregators, scraping boards, search indexes, or affiliate networks (e.g., Indeed, LinkedIn Jobs, Naukri, Monster, ZipRecruiter) are strictly rejected.
3. **No Intermediary Redirection:** Candidate apply URLs must link directly to the employer's official ATS requisition page without tracking query redirects or affiliate hops.

### 3.2 URL Provenance & Protocol Security
All job URLs must pass through the centralized URL validator (`backend/src/collectors/url-validator.ts`) enforcing:
- **Rule 1 (Syntax):** Must parse cleanly under standard RFC 3986 URI specifications.
- **Rule 2 (Protocol):** HTTPS is strictly mandatory (`parsed.protocol === 'https:'`). Plain HTTP is rejected.
- **Rule 2a (Anti-Credential / Userinfo):** URLs containing embedded username or password credentials (e.g. `https://admin:pass@host/...` or `https://official.com@evil.com`) are rejected.
- **Rule 2b (Standard Port Enforcement):** Non-standard ports (e.g. `:8443`, `:8080`) are rejected; only standard HTTPS port 443 is permitted.
- **Rule 3 (Hostname Provenance):** Hostname must exactly match the configured official domain or a valid subdomain thereof (`hostname === domain || hostname.endsWith('.' + domain)`). Hostname prefix/suffix lookalike spoofing (e.g., `evil-company.wd1...` or `company.wd1...evil.com`) is rejected.
- **Rule 4 (Individual Job Path):** URLs must identify an individual job posting via requisition ID or UUID. Root portals, general search pages, or empty slugs are rejected.

### 3.3 Deterministic Canonical Deduplication
1. **Composite Identity Constraint:** Every job is uniquely identified in PostgreSQL by the composite key `(company_id, source_system, external_job_id)`.
2. **Idempotency Guarantee:** Multiple pipeline runs over the same ATS candidate set must produce 0 duplicate database rows and 0 unhandled status transitions.
3. **Canonical ID Stability:** The `external_job_id` extracted from the ATS must reflect the employer's authoritative requisition identifier (e.g., `R-102118`, `26WD100698`, `744000145967675`), never a transient session ID or timestamp.

---

## 4. Data Safety & Lifecycle Invariants

### 4.1 Strict Source Isolation
- **Fault Domain Containment:** A network timeout, upstream 5xx error, rate-limiting (429), maintenance redirect (303), or schema drift on one source must never crash the engine or impede discovery on other sources.
- **Bounded Resource Allocations:** Each collector execution must be wrapped in timeout guards (`DEFAULT_TIMEOUT_MS = 10_000`) and max-retry bounds (`MAX_RETRIES = 2`).

### 4.2 Absence Reconciliation Protection
- **Global Scan Completeness Invariant:** RoleRadar safely closes absent jobs *only* when a scan is authoritatively 100% complete across the employer's entire listing.
- **`isCompleteScan` Requirement:** In `pipeline.ts`, absence reconciliation (`reconcileAbsentJobs()`) is strictly gated behind `if (isCompleteScan)`.
- **Automatic Completeness Suppression:** A scan must assert `isCompleteScan = false` whenever:
  1. Pagination is truncated by `maxPages` before exhausting all upstream records (`TRUNCATED_BY_MAX_PAGES`).
  2. Search query filters or location facets are active (`CONFIGURED_FACETS`).
  3. Any HTTP error (500, 429, 303) or network abort/timeout occurs on any page.
  4. Malformed JSON or unexpected schema is returned upstream.
- **State Leakage Prevention:** Multi-scan collector instances must reset scan state (`lastScanComplete = false`) on every `discoverJobs()` invocation.

### 4.3 Authoritative Closure Handling
- **Conclusive Evidence Only:** A job's status transitions to `CLOSED` *only* upon receiving definitive proof:
  1. An authoritative HTTP 404 response on the official requisition URL during active verification.
  2. A verified global scan (`isCompleteScan === true`) from which the job requisition is absent.
- **Transient Error Safety:** Temporary HTTP 5xx responses, 429 throttling, socket timeouts, or DNS resolution glitches leave the job in its existing status (or `VERIFYING` retry queue); they must **never** mark a job closed.

---

## 5. Candidate Matching & Fresher Safety Invariants

### 5.1 Hard Eligibility Constraints Before Ranking
Candidate feeds and alerts must evaluate hard constraints before applying ML or relevance ranking algorithms:
1. **Experience Classification:** Jobs must be parsed via `parseExperienceRequirements()`.
2. **Country & Location Scope:** Strict geographical boundary matching; international roles must not contaminate domestic candidate feeds.
3. **Workplace Type:** Remote vs Onsite vs Hybrid requirements must be evaluated against candidate preferences.

### 5.2 Fresher Feed Integrity
- **Keyword Leakage Prevention:** Roles with titles or descriptions containing senior, lead, principal, manager, director, architect, executive, staff, or L2-L6 markers (`seniorTitleRegex`) are classified as `EXPERIENCED` with high confidence. They must **never** leak into fresher-compatible feeds.
- **Experience Range Invariant:** Any role requiring 2+ years of professional experience is excluded from fresher feeds.
- **Conservative `UNKNOWN` Handling:** If a job's experience requirements cannot be determined with confidence, its classification must default to `UNKNOWN`. RoleRadar strictly enforces: **`UNKNOWN` is never assumed to be Fresher**.

---

## 6. Notification & Digest Delivery Governance

### 6.1 User Alert Budget & Throttling
- **Daily Budget Enforcement:** Notification workers must enforce strict per-user daily alert caps.
- **Concurrency & Atomic Locking:** All batch digest processing must use PostgreSQL row-level locks (`FOR UPDATE SKIP LOCKED`) to prevent race conditions across concurrent workers.

### 6.2 Zero-Job Digest Suppression
- **No Empty Alerts:** If a scheduled digest window contains 0 matching jobs for a user, no email notification or empty placeholder may be sent.
- **Atomic Transition:** Notifications must transition atomically: `PENDING -> PROCESSING -> DELIVERED`. Retried digests must claim existing pending records in-place.

### 6.3 Idempotency Guarantees
- Every notification intent must carry a deterministic `idempotency_key` (e.g., `digest:{userId}:{windowStart}:{windowEnd}`). Duplicate dispatch attempts must be caught at the database engine level via unique index constraints.

---

## 7. Performance & Infrastructure Standards (31-Point Framework)

### 7.1 Backend API & Database Performance
1. **Explicit Projections:** Avoid `SELECT *`. Drizzle ORM queries must project explicit column lists.
2. **N+1 Prevention:** Related entities must be joined in a single SQL query (e.g. `leftJoin(companies)`).
3. **Bounded Pagination:** All listing endpoints must enforce a strict maximum limit (`limit <= 100`).
4. **Composite Indexing:** High-traffic queries on `jobs`, `notifications`, and `job_verifications` must utilize composite B-tree indexes aligned with `WHERE` and `ORDER BY` clauses.
5. **Slow Request Budget:** Requests exceeding 200ms must be logged as `SLOW_REQUEST` warnings with OpenTelemetry trace context.
6. **Background Queuing:** Operations exceeding 300ms must be dispatched to `backgroundJobQueue` with ACK/NACK mechanics.

### 7.2 Frontend UX & Responsiveness
1. **Skeleton Loading:** All asynchronous views must render skeleton loaders (`SkeletonLoader`) during data fetch.
2. **Search Debouncing:** User input in search and filter controls must be debounced with 200–300ms delays.
3. **Optimistic UI:** State updates (save, apply, dismiss) must update the DOM immediately (0ms latency) and automatically revert on API error.
4. **List Virtualization:** Large collections (>50 items) must utilize virtualized DOM rendering (`virtualList.ts`).
5. **Bundle Optimization:** Production builds must isolate vendor chunks (`vendor-react`, `vendor-charts`).

---

## 8. Testing & Verification Standards

### 8.1 Mandatory Engine Execution Rule
- **Runtime Execution Proof:** Changes affecting discovery collectors, HTML/JSON parsing, matching logic, URL validation, or alert dispatch **require real engine execution verification**. Mocked unit tests alone are insufficient for phase gate clearance.
- **Bounded Live Smoke Testing:** Live upstream integrations must include bounded smoke tests (e.g., `pageSize: 5`, `maxPages: 1`) asserting real HTTP 200 responses, schema normalization, and latency compliance.

### 8.2 Non-Destructive Test Teardown
- **Synthetic Test Fixtures:** Integration tests must operate strictly on synthetic test jobs created with distinct UUID prefixes.
- **Preservation of Seed Data:** Teardown routines must never drop, delete, or modify seeded company records (`companies`) or live catalog sources.
- **Reverse-Dependency Deletion:** Teardown must delete records in reverse foreign key order (`job_verifications -> user_job_interactions -> jobs`).
- **Mid-Test Failure Resilience:** Cleanup must execute in `afterAll` blocks to guarantee isolation even when test assertions fail midway.

---

## 9. Feature Acceptance Gate Checklist

Every pull request or major feature commit must be evaluated against this gate:

```markdown
### RoleRadar Feature Acceptance Gate
- [ ] 1. Architecture: Direct ATS source only; URL validator rules 1-4 pass; zero aggregator links.
- [ ] 2. Classification: Scope clearly categorized (IMPLEMENTED, TESTED, VERIFIED, PRODUCTION-READY, DEFERRED).
- [ ] 3. Lifecycle Safety: Incomplete scans assert isCompleteScan = false; absence reconciliation suppressed.
- [ ] 4. Matching Safety: Experience hard filter evaluated; fresher feed protected against senior keywords.
- [ ] 5. Performance: Explicit ORM projections; bounded pagination; debounced UI; skeleton loader present.
- [ ] 6. Notification: Idempotency key present; atomic locking; zero-job digest suppression.
- [ ] 7. Verification: Backend tsc --noEmit (Exit 0); Frontend npm run build (Exit 0); Vitest suite passes.
- [ ] 8. Test Isolation: Synthetic fixtures used; reverse teardown clean; production/catalog data untouched.
```
