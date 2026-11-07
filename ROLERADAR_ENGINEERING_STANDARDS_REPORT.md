# RoleRadar — Permanent Engineering Standards & Acceptance Governance Audit Report

**Classification:** `[PUBLIC / EXTERNAL SHAREABLE]`  
**Date:** November 7, 2026  
**Document Reference:** `RR-AUDIT-2026-ENG-STANDARDS`  
**Governance Standard:** [`docs/ENGINEERING_STANDARDS.md`](file:///c:/Users/Samee/Documents/RoleRadar/docs/ENGINEERING_STANDARDS.md)  
**Security & Privacy:** Fully sanitized. Zero credentials, secrets, internal IPs, database connection strings, personal emails, or candidate PII.

---

## Executive Summary

This report documents the formal establishment and adoption of the **RoleRadar Permanent Engineering Standards & Acceptance Gate**. 

Following the completion of the 141-source catalog admission audit, the Omnissa Workday integration, and the 31-point Performance Engineering finalization, this governance standard establishes a mandatory, permanent quality gate that applies to every future feature, adapter, and architectural modification in RoleRadar.

The standards are directly anchored in the actual production architecture of RoleRadar:
- **Backend Core:** Node.js 20+ / Express / TypeScript runtime with Pino structured logging, OpenTelemetry tracing SDK, and Redis/in-memory LRU caching.
- **Database Engine:** PostgreSQL 16 managed via Drizzle ORM, with composite B-Tree indexing, strict unique constraints, and atomic row-level locks (`FOR UPDATE SKIP LOCKED`).
- **Frontend Dashboard:** React 19 / Vite / Tailwind v4 Single Page Application with asynchronous SkeletonLoaders, debounced search filters, virtualized DOM list rendering, and optimistic UI updates.

---

## 1. Governance Objectives & Principles

RoleRadar's core value proposition is **absolute job authenticity and candidate data safety**. Traditional job boards suffer from phantom listings, expired roles, aggregator redirects, affiliate tracking, and mismatched seniority classifications. 

The Engineering Standards enforce six inviolable governance pillars:

```mermaid
flowchart TD
    G1[1. Source Provenance & Anti-Aggregator] --> Gate{Permanent Acceptance Gate}
    G2[2. Absence Safety & Scan Completeness] --> Gate
    G3[3. Authoritative Lifecycle Closure] --> Gate
    G4[4. Fresher Safety & Hard Filter Pre-Check] --> Gate
    G5[5. Notification Throttling & Idempotency] --> Gate
    G6[6. Non-Destructive Test Isolation] --> Gate
    Gate --> Release[Production Release / PR Merge]
```

---

## 2. Technical Invariants & Architectural Alignment

### 2.1 Classification Standard
To ensure absolute transparency across all audits, pull requests, and investor deliverables, five standardized operational maturity classifications are defined and enforced:

| Classification | Definition | Verification Requirement |
| :--- | :--- | :--- |
| **`IMPLEMENTED`** | Code, schema definitions, and configs are fully authored without placeholder stubs. | Static typecheck (`npx tsc --noEmit`) passes with exit code 0. |
| **`TESTED`** | Automated tests execute against isolated synthetic fixtures. | Automated test run logs with pass counts, duration, and exit code 0. |
| **`VERIFIED`** | Empirically demonstrated against live upstream systems or realistic network conditions. | Bounded live upstream HTTP 200 response, latency metrics, and database state snapshots. |
| **`PRODUCTION-READY`** | Component satisfies all resilience, monitoring, graceful shutdown, and error bounds. | Health checks active, zero external secret leaks, bounded memory profiles. |
| **`DEFERRED`** | Scope, integration, or infrastructure intentionally postponed. | Explicit architectural justification and tracked follow-up ticket. |

---

### 2.2 Source Governance & URL Provenance
Every collector and adapter feeding the RoleRadar pipeline must comply with strict source governance:

1. **Official Career Portals Only:** Accept jobs exclusively from verified employer ATS platforms (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, SAP, Workable, and verified custom employer sites). Zero tolerance for aggregators (Indeed, LinkedIn, Naukri).
2. **Centralized URL Validation (`backend/src/collectors/url-validator.ts`):**
   - **Protocol:** Strict HTTPS enforcement. Plain HTTP is rejected.
   - **Anti-Credential Check:** Disallow embedded userinfo credentials (`https://user:pass@host` or `https://official@evil.com`).
   - **Port Enforcement:** Only standard HTTPS port 443 is permitted; non-standard ports (`:8443`, `:8080`) are rejected.
   - **Domain & Subdomain Matching:** Hostname must match the configured official domain; lookalike prefix/suffix spoofing is rejected.
   - **Individual Job Path:** Rejects generic company roots, search homepages, or empty slugs.
3. **Canonical Identity:** Requisitions are uniquely identified by `(company_id, source_system, external_job_id)` with authoritative ATS identifiers (e.g. `R-102118`, `26WD100698`).

---

### 2.3 Data Safety & Incomplete Scan Invariants
RoleRadar features automated absence reconciliation: active jobs missing from a complete authoritative scan are safely transitioned to `CLOSED`. To prevent accidental mass closures during upstream outages or rate limiting, strict invariants are enforced:

- **The `isCompleteScan` Guard:** In `backend/src/pipeline/pipeline.ts`, absence reconciliation runs *only* when `isCompleteScan === true`.
- **Automatic Incomplete Classification:**
  - Scans truncated by `maxPages` before enumerating all jobs assert `isCompleteScan = false` (`TRUNCATED_BY_MAX_PAGES`).
  - Scans with active query facets assert `isCompleteScan = false` (`CONFIGURED_FACETS`).
  - Scans encountering HTTP 5xx, 429 rate limiting, 303 maintenance redirects, or socket timeouts assert `isCompleteScan = false`.
- **Authoritative Closure:** A job is marked `CLOSED` *only* upon conclusive evidence (authoritative HTTP 404 or complete scan absence). Transient errors trigger backoff, never closure.

---

### 2.4 Candidate Matching & Fresher Safety
RoleRadar's matching engine (`backend/src/matching/experience-parser.ts`, `matcher.ts`) enforces strict candidate safety:

1. **Hard Eligibility Constraints:** Experience level, country/geography, and workplace type must be evaluated before relevance ranking algorithms execute.
2. **Fresher Feed Integrity:**
   - Any job title containing senior, lead, principal, manager, director, architect, executive, staff, or L2-L6 markers is classified as `EXPERIENCED` with high confidence.
   - Senior keywords must **never** leak into fresher-compatible feeds.
   - Roles requiring 2+ years of professional experience are strictly excluded from fresher feeds.
3. **Conservative `UNKNOWN` Handling:** If a role's experience requirements cannot be determined with confidence, it defaults to `UNKNOWN`. RoleRadar strictly enforces: **`UNKNOWN` is never assumed to be Fresher**.

---

### 2.5 Notification & Digest Integrity
RoleRadar's notification system (`backend/src/notifications/digest-worker.ts`) enforces delivery trust:

1. **Daily User Alert Budget:** Hard caps on alerts per user per day prevent candidate inbox fatigue.
2. **Atomic Row-Level Locking:** All digest processing queries use `FOR UPDATE SKIP LOCKED` to prevent duplicate processing across concurrent workers.
3. **Zero-Job Digest Suppression:** Scheduled digest windows with 0 matching jobs for a user produce no email and dispatch no notifications.
4. **Deterministic Idempotency Keys:** Every notification intent carries an `idempotency_key` (e.g., `digest:{userId}:{windowStart}:{windowEnd}`) enforced by PostgreSQL unique constraints.

---

### 2.6 Testing & Verification Standard
To avoid false claims of operational readiness:

1. **Mandatory Engine Execution Rule:** Any code change affecting job discovery, parsing, URL validation, matching, or notifications requires real runtime engine execution verification. Mocked unit tests alone are insufficient for phase gate clearance.
2. **Non-Destructive Test Teardown:**
   - Tests must create synthetic fixtures with tracked UUIDs.
   - Teardown must never drop, truncate, or delete seeded employer records (`companies`) or live catalog sources.
   - Deletions must cascade in reverse dependency order (`job_verifications` -> `user_job_interactions` -> `jobs`).
   - Cleanup must execute in `afterAll` blocks to guarantee isolation even if assertions fail.

---

## 3. Integration with the 31-Point Performance Engineering Framework

The engineering standard incorporates the core tenets of the 31-point Performance Engineering Framework established in Phase 20.5:

- **Explicit Projections:** Avoid `SELECT *`. All Drizzle ORM queries must explicitly project required columns.
- **N+1 Prevention:** Related entities must be joined in a single SQL query (`leftJoin(schema.companies)`).
- **Bounded Pagination:** All listing endpoints must enforce a strict maximum limit (`limit <= 100`).
- **Composite Indexing:** High-traffic queries on `jobs`, `notifications`, and `job_verifications` must utilize composite B-tree indexes aligned with `WHERE` and `ORDER BY` clauses.
- **Slow Request Budget:** Requests exceeding 200ms must be logged as `SLOW_REQUEST` warnings with OpenTelemetry trace context.
- **Background Queuing:** Operations exceeding 300ms must be dispatched to `backgroundJobQueue` with ACK/NACK mechanics.
- **Frontend Responsiveness:** All views must use `SkeletonLoader` during data fetch, debounced inputs (200-300ms), and virtualized lists for large collections.

---

## 4. Verification & Validation Evidence

### Backend Compilation Check
```powershell
PS C:\Users\Samee\Documents\RoleRadar\backend> npx tsc --noEmit
Exit code: 0 (Zero type errors)
```

### Frontend Production Build Check
```powershell
PS C:\Users\Samee\Documents\RoleRadar\frontend> npm run build
vite v7.3.1 building client environment for production...
✓ 2438 modules transformed.
dist/index.html                          4.03 kB │ gzip:  1.51 kB
dist/assets/index-D-0f_6JT.css         154.00 kB │ gzip: 27.29 kB
dist/assets/vendor-react-BhCj5pxB.js   217.34 kB │ gzip: 69.89 kB
dist/assets/vendor-charts-Cp1LghQS.js  317.59 kB │ gzip: 95.18 kB
dist/assets/index-wK54b9Ot.js          325.62 kB │ gzip: 83.07 kB
✓ built in 10.82s (Exit code: 0)
```

---

## 5. Adoption & Governance Gate Clearance

With the authoring of [`docs/ENGINEERING_STANDARDS.md`](file:///c:/Users/Samee/Documents/RoleRadar/docs/ENGINEERING_STANDARDS.md) and this governance audit report:

1. **Mandatory Acceptance Gate Established:** Future Phase 20.5 Workday Batch 6 features and adapters must pass all 8 acceptance checks before merge.
2. **Zero Regressions:** Performance engineering, Omnissa Workday admission, and teardown safety remain intact.
3. **Controlled Scope:** Only these two documentation deliverables are staged and committed; the three Digest remediation files remain safely preserved in the working tree.
