# Yield AROS / O2C MVP

Yield AROS is an order-to-cash operating system for Philippine B2B suppliers. The current build is a TypeScript monorepo with:

- a Fastify API
- an HTTP-served SSR operator console
- a seeded worker runtime
- domain/workflow packages for collections, approvals, remittances, invoices, payments, and routing
- database schema generation and SQL migration tooling

This repo already demonstrates real product flows, not just scaffolding. It is still an MVP/dev build, so some state is seeded or in-memory, some integrations are partial, and a few infrastructure pieces are intentionally non-durable.

## Product Intent

The source-of-truth specs live in:

- `docs/yield_aros_canonical_object_state_spec.md`
- `docs/yield_aros_codex_engineering_spec.md`
- `docs/yield_aros_learning_layer_multichannel_codex.md`
- `docs/yield_aros_canonical_prd.md`

Core product rules reflected by the build:

- ERP remains source of truth for ledger objects
- billing account is the default collections routing level
- branch is preserved whenever known
- disputed invoices must not be chased automatically
- no auto-send to unverified contacts
- no auto-apply under cross-entity ambiguity
- every meaningful action must be audit logged

## What The Current Build Can Do

### Operator Console

`apps/web` serves a server-rendered operator console with working pages for:

- Home / command center
- onboarding
- tasks
- analytics
- collections
- cash application
- deductions
- customers
- invoices
- approvals
- AI activity
- rules and automations
- data sources
- integrations
- account workspace
- invoice detail
- credit line views
- screen inventory

The current home page is a simplified operational dashboard with setup status, task workload, a calendar strip, due-today exposure, respond-to summaries, and visual task/customer charts.

The collections experience currently supports:

- collections inbox and queue views
- live Gmail inbox rendering when a Gmail sending identity is connected
- fallback seeded inbox rows when no live inbox is available
- opening an email row into a compose modal
- composing replies from the collections screen
- immediate send for replies on real synced Gmail threads
- safety gating for riskier outbound flows

The cash application and exception surfaces currently demonstrate:

- payment review queues
- remittance-linked views
- typed deduction and exception workflows
- approval-linked operator actions
- seeded and API-backed review flows

The integrations and onboarding surfaces currently support:

- Gmail connect flow
- QuickBooks connect flow
- SAP Business One connection and test flow
- Business Central connect flow
- Odoo connection flow
- spreadsheet/account/invoice/payment onboarding paths
- file-based and manual data-source entry flows

### API

`apps/api` runs a Fastify server with working endpoints across:

- health and runtime status
- pilot readiness scenarios
- tasks
- approvals
- collections email preview
- invoices and invoice imports
- accounts and customer profiles
- payments and bank statement ingestion
- remittance ingestion and resolution
- cash application queue and actions
- deductions
- operator console read models
- learning-layer/operator feedback
- outbound email and inbox access
- integration connectors for Gmail, QuickBooks, SAP Business One, Business Central, and Odoo

Important API capabilities already present:

- approval request creation, edit, approve, and reject
- invoice spreadsheet import plus file upload handling
- BIR invoice review preview and review-case flow
- bank-statement ingestion via file and Perfios-normalized payloads
- payment candidate promotion and cash-app actions
- remittance ingestion, lookup, resolve, and orphan checks
- outbound email preview, draft, send, inbox fetch, thread fetch, and reply
- customer-profile ingestion, merge suggestion resolution, and task views

Some API modules use durable database-backed services when configured; some still use seeded or in-memory runtime stores.

### Worker

`apps/worker` is still lightweight, but it does run:

- a demo collections send workflow
- audit event creation through the shared audit package
- seeded background job registration/execution through `runJobs`

It is not yet a full Redis-backed durable worker with retries, queue consumers, or production orchestration.

### Shared Packages

The package layer is where most business logic lives:

- `packages/domain`: canonical objects, enums, state machines, typed rules, invariants
- `packages/workflows`: collections, approvals, remittance ingestion, cash application, outbound email, pilot flows
- `packages/contracts`: API and read-model contracts
- `packages/routing`: hierarchy-aware routing and billing-account logic
- `packages/audit`: audit abstractions and in-memory logger
- `packages/database`: schema definitions, schema snapshot generation, SQL migrations
- `packages/seed`: demo fixtures and seeded scenarios
- `packages/config`: typed environment loading
- `packages/auth`, `packages/types`, `packages/testkit`: shared auth/types/test helpers

## Current Feature Inventory

### Collections and Email

- Connect Gmail from the integrations page
- list configured sending identities
- fetch inbox threads and thread messages from the API
- render live Gmail inbox rows in Collections when connected
- open a compose popup from a clicked inbox row
- reply to an existing live Gmail thread from Collections
- preview and draft outbound email through API workflows
- keep approval safety for risky or insufficiently verified cases

### Cash Application

- show cash-app review/read-model screens in the operator console
- ingest bank statements from files
- ingest Perfios-normalized bank statement payloads
- view payment candidates and candidate details
- stage manual/apply/hold/reject/writeback actions through API routes
- preserve no-auto-apply behavior when ambiguity exists

### Invoices, Accounts, and Customer Profiles

- render invoice index and invoice detail views
- import invoices from spreadsheet sources
- import accounts/customer data
- maintain customer profile read models and merge/review flows
- preserve billing-account and branch-aware views in the UI and workflows

### Deductions and Exceptions

- render deduction queue and deduction detail screens
- ingest deduction-related uploads/hooks
- refresh and sync credit memo drafts
- expose typed exception-style operator handling instead of generic failures

### Approvals and Safety

- request approvals
- edit, approve, and reject approval items
- route risky messaging/accounting actions through approval policies
- keep audit-friendly workflow output in shared packages

### Integrations

- Gmail OAuth connect start/callback flow
- QuickBooks OAuth connect/callback and sample data fetch endpoints
- SAP Business One connect/test/sync flow
- Business Central connect/callback flow
- Odoo connect/select/fetch/create flow

### Learning Layer and Operator Feedback

- expose learning-layer snapshots
- capture operator feedback
- recompute learning-layer output through the API

## What Is Live Versus Seeded

The build intentionally mixes live integrations with seeded/demo data.

Usually live when configured:

- Gmail connection and inbox/reply flows
- QuickBooks connection callbacks and sample fetches
- SAP Business One connection/test/sync endpoints
- API server and SSR web server
- migration generation/application tooling

Usually seeded or in-memory today:

- much of the dashboard/operator-console read model
- worker runtime execution
- some approval/remittance/task/demo stores
- parts of onboarding/demo metrics

If the API restarts while a feature is using in-memory fallback stores, that runtime state resets.

## Repo Layout

```text
apps/
  api/
  web/
  worker/
docs/
packages/
  audit/
  auth/
  config/
  contracts/
  database/
  domain/
  routing/
  seed/
  testkit/
  types/
  workflows/
tests/
```

## Local Setup

### Prerequisites

- Node.js 22+
- Corepack enabled
- pnpm 10+
- PostgreSQL
- Redis

### Bootstrap

```bash
cp .env.example .env
cp .env.test.example .env.test
pnpm install
```

### Start local infra

```bash
docker compose up -d postgres redis
```

## Environment

Required core env vars are defined in `packages/config/src/env/schema.ts`.

Minimum required variables:

- `DATABASE_URL`
- `REDIS_URL`
- `DEFAULT_TENANT_SLUG`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_PUBLIC_KEY`
- `JWT_PRIVATE_KEY`
- `API_HOST`
- `API_PORT`
- `WEB_PORT`

Optional integration env vars exist for:

- Gmail
- QuickBooks
- Business Central
- Odoo
- SAP Business One
- Google Sheets
- generic SMTP/email settings
- Perfios

If Gmail OAuth is not configured, the Gmail connect flow will not complete successfully.

## Running The Repo

### Full workspace

```bash
pnpm dev
```

### Run services individually

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Default local addresses:

- web: `http://localhost:3000`
- api: `http://localhost:3001`

## Commands

Workspace-level commands:

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm clean
pnpm db:generate
pnpm db:migrate
```

Per-app commands:

```bash
pnpm --filter @o2c/api dev
pnpm --filter @o2c/web dev
pnpm --filter @o2c/worker dev

pnpm --filter @o2c/api test
pnpm --filter @o2c/web test
pnpm --filter @o2c/worker test

pnpm --filter @o2c/api typecheck
pnpm --filter @o2c/web typecheck
pnpm --filter @o2c/worker typecheck
```

## Database Tooling

`packages/database` currently supports:

- schema definition ownership inside the repo
- schema snapshot generation
- SQL migration discovery
- migration plan/combined SQL generation
- applying unapplied migrations to the configured database

Commands:

```bash
pnpm --filter @o2c/database generate
pnpm --filter @o2c/database migrate
```

## Current Limitations

- This is not yet a production deployment stack.
- The web app is SSR over Node HTTP, not a SPA.
- Some read models are seeded rather than fully persisted projections.
- Some runtime stores still fall back to in-memory implementations.
- Worker processing is not yet durable or queue-backed.
- Dockerfiles may lag the current workspace layout and should be treated as unverified until revalidated.
- Not every integration has end-to-end writeback parity yet.
- Approval and safety rules remain intentionally conservative in ambiguous cases.

## How To Read The Build Safely

If you are extending the repo, assume these rules are non-negotiable unless a product owner explicitly says otherwise:

- keep business rules in shared domain/workflow packages
- keep provider logic in integration modules
- choose safe defaults when unclear
- do not weaken money-movement or customer-communication safeguards for convenience
- document assumptions inline when a rule affects messaging, approvals, or ledger behavior

## Recommended Starting Points

- `apps/web/src/app/dashboard.tsx`
- `apps/web/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules`
- `packages/domain/src`
- `packages/workflows/src`
- `packages/database/src`

## Reference Docs

- `docs/yield_aros_canonical_object_state_spec.md`
- `docs/yield_aros_codex_engineering_spec.md`
- `docs/yield_aros_learning_layer_multichannel_codex.md`
- `docs/yield_aros_canonical_prd.md`
- `docs/pilot-launch-checklist.md`
- `docs/sprint-2-integration-foundation.md`
- `docs/adr`
