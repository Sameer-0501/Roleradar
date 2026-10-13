# RoleRadar Job Engine — Backend

> **Phase 1: Foundation only.** No real company scrapers, no email sending, no fake data.

The RoleRadar Job Engine is a standalone Node.js/TypeScript backend service that will automatically discover, verify, and track genuine job openings from companies' official career sources.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Installation](#installation)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Running the Backend](#running-the-backend)
6. [Running Tests](#running-tests)
7. [API Endpoints](#api-endpoints)
8. [Scheduler](#scheduler)
9. [Adding a Collector (Phase 2+)](#adding-a-collector)
10. [Verification System](#verification-system)
11. [Inspecting Scan Status](#inspecting-scan-status)

---

## Architecture

```
backend/
├── src/
│   ├── api/               # Express route handlers
│   │   ├── health.ts      # GET /api/health
│   │   ├── engine-status.ts # GET /api/jobs/engine/status
│   │   └── router.ts
│   ├── ats/
│   │   └── types.ts       # AtsType enum + SourceConfig interface
│   ├── collectors/        # Collector interface + registry
│   │   ├── types.ts       # ICollector, JobCandidate interfaces
│   │   ├── base-collector.ts # Abstract base class for scrapers
│   │   └── registry.ts    # Collector registry singleton
│   ├── config/
│   │   └── env.ts         # Typed env config loader
│   ├── database/
│   │   ├── schema.ts      # Drizzle ORM schema (all tables)
│   │   ├── connection.ts  # PostgreSQL pool + health check
│   │   ├── migrate.ts     # Migration runner script
│   │   └── index.ts       # Re-exports
│   ├── jobs/
│   │   └── job-service.ts # Job lifecycle state machine
│   ├── scheduler/
│   │   ├── scheduler.ts   # Scheduler singleton
│   │   └── types.ts
│   ├── tests/             # Vitest test suites
│   ├── utils/
│   │   └── logger.ts      # Pino structured logger
│   └── index.ts           # Server entry point
├── drizzle/               # Generated migration SQL files
├── .env.example
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Design Principles

- **Zero fake data** — the database starts empty. Jobs only enter when real collectors are configured (Phase 2+).
- **PENDING not VERIFIED** — in Phase 1, no job reaches `VERIFIED` status. The verification pipeline is architecturally in place but requires live source confirmation.
- **Isolated from frontend** — the backend runs on port `4000`; the Vite frontend on `5173`. They do not share code or configuration.
- **Pluggable collectors** — any company's ATS can be added by implementing `ICollector` and registering it.

---

## Installation

### Prerequisites

- Node.js 20+
- npm 10+
- Docker (for local PostgreSQL) **or** an existing PostgreSQL 15+ instance

### Steps

```bash
# From the project root
cd backend
npm install
```

---

## Environment Configuration

```bash
cp .env.example .env
```

Edit `backend/.env`:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://kcarrier:kcarrier_dev_password@localhost:5432/kcarrier_jobs

# Application environment
NODE_ENV=development

# Backend API port
API_PORT=4000

# How often the scheduler runs job scans (minutes)
JOB_SCAN_INTERVAL_MINUTES=30
```

**Never commit `.env`** — it is listed in `.gitignore`.

---

## Database Setup

### Option A: Docker Compose (recommended for local dev)

From the **project root** (not `backend/`):

```bash
# Start PostgreSQL
docker compose up -d

# Verify it's healthy
docker compose ps
```

Default credentials (set in `docker-compose.yml`):
- **Host**: `localhost:5432`
- **Database**: `kcarrier_jobs`
- **User**: `kcarrier`
- **Password**: `kcarrier_dev_password`

These match the defaults in `.env.example` for zero-config local setup.

### Option B: Existing PostgreSQL

Update `DATABASE_URL` in `backend/.env` to point to your instance. Create the database manually:

```sql
CREATE DATABASE kcarrier_jobs;
```

### Running Migrations

```bash
cd backend

# Generate migrations from schema (only needed when schema changes)
npm run migrate:generate

# Apply migrations to the database
npm run migrate:run
```

Migrations are stored in `backend/drizzle/`. They are SQL files and safe to inspect.

---

## Running the Backend

### Development (with hot reload)

```bash
cd backend
npm run dev
```

Output:
```
[server] RoleRadar Job Engine API started on http://localhost:4000
[server]   GET /api/health
[server]   GET /api/jobs/engine/status
```

### Production build

```bash
cd backend
npm run build
npm start
```

---

## Running Tests

```bash
cd backend
npm test
```

Tests do **not** require a live database — all DB interactions are mocked.

Test suites:
| File | What it tests |
|------|---------------|
| `database.test.ts` | Schema exports, column presence |
| `verification.test.ts` | PENDING/FAILED invariant, domain check, content hash |
| `job-lifecycle.test.ts` | State machine transitions, deduplication |
| `scheduler.test.ts` | Start/stop, registration, scan_run recording |
| `health.test.ts` | Health endpoint shape, 200/503 responses |
| `collector.test.ts` | Registry, BaseCollector, safeDiscover |

---

## API Endpoints

### `GET /api/health`

Returns server health.

```json
{
  "status": "ok",
  "environment": "development",
  "timestamp": "2026-08-26T15:00:00.000Z",
  "database": "connected",
  "scheduler": "running"
}
```

Returns `200` if healthy, `503` if the database is unreachable.

### `GET /api/jobs/engine/status`

Returns operational status of the job engine.

```json
{
  "engine": {
    "enabled": true,
    "scanIntervalMinutes": 30
  },
  "scheduler": {
    "status": "running",
    "registeredCollectors": 0,
    "jobs": []
  },
  "companies": { "configured": 0 },
  "jobs": { "activeVerified": 0, "totalActive": 0 },
  "lastScan": null,
  "lastSuccessfulScan": null
}
```

---

## Scheduler

The scheduler manages periodic execution of job collectors.

**Phase 1**: Zero collectors are registered. The scheduler starts but does nothing. This is intentional — no real data sources are configured yet.

**Configuration**:
- `JOB_SCAN_INTERVAL_MINUTES` — how often each collector runs (default: 30)
- `JOB_ENGINE_ENABLED` — set to `false` to disable the scheduler entirely

**Architecture**: The scheduler uses `setInterval` in Phase 1. In Phase 2, it can be replaced with BullMQ + Redis without changing any other module — only `backend/src/scheduler/scheduler.ts` needs to change.

Every scan execution creates a `scan_runs` record in the database for monitoring.

---

## Adding a Collector

> **Phase 2+** — do not implement real scrapers in Phase 1.

To add a collector for a company:

1. **Create a collector class** in `backend/src/collectors/companies/`:

```typescript
import { BaseCollector } from '../base-collector.js';
import type { JobCandidate, CollectorHealth } from '../types.js';
import type { AtsType } from '../../ats/types.js';

export class AcmeWorkdayCollector extends BaseCollector {
  async discoverJobs(): Promise<JobCandidate[]> {
    // Fetch from Acme's official Workday API
    // Return normalized JobCandidate objects
    return [];
  }

  getSourceName() { return 'Acme Workday Collector'; }
  getSourceType(): AtsType { return 'WORKDAY'; }
  supports(company: string) { return company === 'Acme'; }

  async healthCheck(): Promise<CollectorHealth> {
    // Ping the Workday endpoint
    return { healthy: true, message: 'ok', checkedAt: new Date() };
  }
}
```

2. **Insert the company** into the `companies` table with real, verified data.

3. **Register the collector** in `backend/src/index.ts`:

```typescript
import { AcmeWorkdayCollector } from './collectors/companies/acme-workday.js';
scheduler.register(new AcmeWorkdayCollector(), config.jobScanIntervalMinutes * 60_000);
```

4. **Never add guessed URLs** — only use verified official career sources.

---

## Verification System

Every discovered job goes through verification before being shown to users.

**Phase 1 behavior:**
- Domain check: deterministic, based on URL parsing only
- All live checks (job existence, title match, etc.): `null` (not performed)
- Result: always `PENDING` or `FAILED` — **never** `VERIFIED`

**Phase 2 will add:**
- HTTP confirmation against the ATS API
- Job existence check
- Title/location matching
- Application URL validation

All verification history is stored in `job_verifications` — this table is append-only and never overwritten.

---

## Inspecting Scan Status

```bash
# All scan runs
psql $DATABASE_URL -c "SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 20;"

# Failed scans
psql $DATABASE_URL -c "SELECT * FROM scan_runs WHERE status = 'FAILED' ORDER BY started_at DESC;"

# Active verified jobs
psql $DATABASE_URL -c "SELECT * FROM jobs WHERE status = 'ACTIVE' AND verification_status = 'VERIFIED';"

# Verification history for a specific job
psql $DATABASE_URL -c "SELECT * FROM job_verifications WHERE job_id = '<uuid>' ORDER BY checked_at;"

# Company count
psql $DATABASE_URL -c "SELECT count(*) FROM companies WHERE is_active = true;"
```

Or use the API:
```bash
curl http://localhost:4000/api/jobs/engine/status | jq .
```
