# Pilot Launch Checklist

This checklist reflects the repository state on March 26, 2026. It is written for the current MVP scaffold, not for a fully persisted production deployment.

## Setup Requirements

- Node.js 22+
- `corepack enable`
- `pnpm` 9+
- Docker Desktop or equivalent Docker engine
- PostgreSQL 15+ reachable through `DATABASE_URL`
- Redis 7+ reachable through `REDIS_URL`
- A way to provide JWT issuer, audience, and signing keys in the runtime environment

## Environment Variables

Required runtime variables from [`packages/config/src/env/schema.ts`](/Users/jl/Desktop/o2c/packages/config/src/env/schema.ts):

- `DATABASE_URL`
- `REDIS_URL`
- `DEFAULT_TENANT_SLUG`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`

Common runtime variables:

- `NODE_ENV`
- `LOG_LEVEL`
- `API_HOST`
- `API_PORT`
- `WEB_PORT`
- `WORKER_CONCURRENCY`

Integration variables are optional and only needed when a connector is enabled:

- `INTEGRATION_*`

Bootstrap:

```bash
cp .env.example .env
cp .env.test.example .env.test
```

## Install And Start

```bash
corepack enable
pnpm install
docker compose up -d postgres redis
```

## Migrations

Current command:

```bash
pnpm --filter @o2c/database migrate
```

Current limitation:

- [`packages/database/src/migrations/run.ts`](/Users/jl/Desktop/o2c/packages/database/src/migrations/run.ts) is still a placeholder and only logs the configured database URL.
- SQL files exist in [`packages/database/src/migrations`](/Users/jl/Desktop/o2c/packages/database/src/migrations), but the MVP does not yet apply them to PostgreSQL.

Pilot gate:

- Do not treat database migrations as production-ready until the runner actually executes and tracks migration state.

## Seed Commands

Current state:

- There is no persistent seed CLI in the MVP.
- Demo data is generated in-process from [`packages/seed/src/index.ts`](/Users/jl/Desktop/o2c/packages/seed/src/index.ts) and surfaced through the API/web demo flows.

Available demo paths:

```bash
pnpm --filter @o2c/api dev
pnpm --filter @o2c/web dev
```

Then verify:

- `GET /v1/pilot-readiness`
- the web dashboard demo cards backed by `buildDemoSeedBundle()` and `buildPilotReadinessSnapshot()`

Pilot gate:

- If the pilot requires persistent seeded records in PostgreSQL, that seed command does not exist yet and must be added before launch.

## Test Commands

Run before release:

```bash
pnpm test
pnpm --filter @o2c/api test
pnpm --filter @o2c/workflows test
pnpm --filter @o2c/domain test
pnpm typecheck
pnpm build
```

Environment note:

- In this hardening pass, the workspace shell did not have `node` or `pnpm`, so these commands could not be executed here.

## Smoke Tests

After boot:

1. `GET /health` returns `status: ok` and does not expose secrets.
2. `POST /v1/collections/email-preview` returns a grouped reminder draft and preserves invoice `branchId` values.
3. `POST /v1/approvals/requests` creates a pending approval; `POST /v1/approvals/:approvalId/approve` approves it with an authorized role.
4. `POST /v1/remittances/ingestions` accepts a valid remittance payload and returns either `linked_to_payment`, `linked_to_invoice_candidate`, or `review_required`.
5. `POST /v1/remittances/:remittanceId/orphan-check` marks stale unresolved remittances as orphaned after policy expiry.
6. `GET /v1/pilot-readiness` returns scenarios, queue summary, and readiness metrics.
7. Cash-application workflow tests cover:
   `auto_apply`, approval gating for strategic accounts, review routing for ambiguous evidence, branch-preserving allocations, and writeback-stage generation.

## Known MVP Limitations

- Database migrations are not executable yet; the runner is a placeholder.
- Seed data is in-memory/demo-only. There is no persistent seed writer.
- Approval, remittance, and collections API modules use in-memory stores, so state is lost across restarts.
- The worker process is scaffolded only; there is no durable job queue or retry infrastructure.
- ERP writeback is staged in workflow logic, but there is no production connector orchestration path wired into the apps.
- Auth is header/bootstrap oriented for the API scaffolds and not a full session/token enforcement layer.
- Pilot readiness metrics are scenario-based snapshots, not operational metrics computed from persisted events.
- The MVP remains conservative by design:
  billing account stays the routing unit, `branchId` is preserved on invoice-derived flows, disputed invoices are blocked from auto-chase, and strategic accounts require tighter controls.

## Rollback And Recovery Guidance

For the current MVP:

1. Stop API and worker processes if smoke tests fail.
2. Revert runtime configuration to the last known-good `.env` values.
3. Clear in-memory demo state by restarting the affected process.
4. Re-run smoke tests before reopening pilot traffic.

If a future persistent adapter is added:

1. Disable inbound automations first so no new writebacks or remittance decisions are generated.
2. Restore PostgreSQL from the pre-release snapshot.
3. Re-run migration state validation.
4. Replay only audited, idempotent writeback stages after root-cause review.

Operational rule:

- Because money movement is conservative and auditable, do not replay cash application or ERP writeback events blindly. Review staged writebacks and exception queues before recovery.
