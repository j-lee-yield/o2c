# Yield AROS / O2C MVP

Yield AROS is an AI-assisted order-to-cash platform for Philippine B2B suppliers. This monorepo contains the current MVP build for:

- operator workflows
- customer/account and invoice visibility
- collections orchestration
- promises-to-pay and dispute handling
- remittance and cash-application support
- ERP/integration adapters
- outbound email
- Retell-powered voice collections and post-call recap support

Primary product goals:

- reduce DSO
- improve cash application
- keep collections safe and auditable
- support future multi-channel workflows

The build is intentionally safety-first:

- ERP remains the source of truth for ledger objects
- billing account is the default collections routing level
- branch must be preserved whenever known
- disputed invoices must not be chased automatically
- no auto-send to unverified contacts
- no auto-apply under cross-entity ambiguity
- no silent ERP divergence
- every automation action must be audit logged

## Source Of Truth

When repo behavior and docs disagree, resolve ambiguity in this order:

1. `docs/yield_aros_canonical_object_state_spec.md`
2. `docs/yield_aros_codex_engineering_spec.md`
3. `docs/yield_aros_learning_layer_multichannel_codex.md`
4. `docs/yield_aros_canonical_prd.md`

These docs define the canonical object model, state machines, safety rules, implementation priorities, and the multi-channel-ready learning layer.

## First Principles

When making product or implementation choices, optimize in this order:

1. correctness of money movement and ledger logic
2. operational safety and approval gating
3. explainability and auditability
4. extensible integrations
5. polished operator UX

## What The Current Build Can Do

This repo is well past scaffolding. The current build already supports a meaningful end-to-end O2C workflow surface.

### Accounts, contacts, invoices, and customer profiles

- Account index and account detail API routes
- Customer profile read models
- Billing-account-level routing context for collections
- Contact verification and collections-safe contact handling
- Invoice index routes and invoice import support
- Customer index/detail pages that can rebuild account summaries from live/imported invoice data when the customer-profile index is empty
- Customer action bar with SOA generation, task creation, and guarded call/email actions
- Outbound call modal that prefills a known phone number, validates before dialing, and uses the Retell collections call workflow
- Customer statement / SOA HTML rendering in the web app

Relevant code:

- `apps/api/src/modules/accounts.ts`
- `apps/api/src/modules/customer-profiles.ts`
- `apps/api/src/modules/invoices.ts`
- `apps/web/src/app/dashboard.tsx`
- `apps/web/src/app/data.ts`
- `apps/web/src/server.tsx`

### Collections workflows

- Collections workspace/domain modeling
- Priority grouping of invoices into:
  - broken promises
  - overdue without promise
  - due today without promise
  - pre-due without promise
  - active future promises
  - routine reminder / residual groups
- Promise-aware and dispute-aware safety gating
- Right-party verification and handler handoff support
- Activity logging for automated collections actions

Relevant code:

- `packages/workflows/src/collections/voice-pre-call.ts`
- `packages/domain/src/modules/collections/`
- `packages/contracts/src/collections/voice-pre-call.ts`

### Promises to pay and call outcomes

- Structured promise-to-pay creation and updates
- Paid-already claim capture
- Dispute capture
- Callback capture
- Contact handoff capture
- Routing-change requests
- Newly added first-class outcome models for:
  - `partial_payment_commitment`
  - `payment_plan_request`
  - `non_commitment`

Relevant code:

- `packages/workflows/src/collections/voice-live-functions.ts`
- `apps/api/src/modules/retell/service.ts`
- `apps/api/src/modules/retell/routes.ts`

### Outbound email and customer document sending

- Outbound email workflow service
- Gmail-backed sending path
- Email integration routes
- Collections email routes
- Collections Email Inbox list/detail UX with All, Unread, Sent, and Drafts chips; search and customer/workflow filters; thread/task tabs; and integrated compose/reply
- Task detail email follow-up workflow with an AI draft by default, edit/send controls, invoice/SOA attachment actions, and task status updates
- Resend/send-document workflow support
- Statement-of-account PDF email sending through the shared outbound email workflow
- Retell post-call recap and SOA sending after terminal call ingestion
- Attachment-aware outbound email metadata
- Safety behavior for imported contacts: invoice-derived emails can support drafting, but unverified contacts still require conservative send handling

Relevant code:

- `packages/workflows/src/outbound-email.ts`
- `packages/workflows/src/gmail-api-adapter.ts`
- `apps/api/src/modules/email-outbound.ts`
- `apps/api/src/modules/email-gmail.ts`
- `apps/api/src/modules/collections-email.ts`
- `apps/api/src/modules/retell/post-call-automation.ts`
- `apps/api/src/modules/retell/email-copy.ts`
- `apps/web/src/app/dashboard.tsx`

### Statement of account (SOA)

- Server-rendered customer statement page in the web app
- Automated SOA PDF generation for Retell post-call recap/SOA automation and the `send-soa` fallback function
- SOA email delivery through the connected/default email sender
- SOA send flow works without invoice-level request payloads; it uses billing-account/contact context
- SOA emails can include a customer-facing call recap generated from Retell call summary/transcript context
- Recap copy uses invoice-group bullets from the supplier/operator perspective and strips internal phrasing such as agent narration, identity confirmation, "the user", and non-events

Current SOA behavior:

- Preferred path: styled HTML-to-PDF rendering that mirrors the richer statement layout
- Fallback path: simple PDF rendering if the local/browser PDF runtime is unavailable

Relevant code:

- `apps/web/src/server.tsx`
- `apps/api/src/modules/retell/statement-of-account-pdf.ts`
- `apps/api/src/modules/retell/post-call-automation.ts`
- `apps/api/src/modules/retell/email-copy.ts`
- `apps/api/src/modules/retell/routes.ts`

### Retell voice collections

- Outbound collections call planning
- Inbound collections callback planning
- Dashboard/customer outbound-call entry point that triggers the existing Retell collections flow
- Safe call-window enforcement
- Dispute continuation rules
- Contact verification / right-party flow
- Dynamic variable generation for invoice-group-aware call logic
- Normalized Call Inbox ingestion/update flow for completed Retell calls
- Call Inbox read model with provider call id, account/contact/invoice links, direction, duration, status, voicemail, transcript/summary, sentiment, classifications, approver/requested-by, and open task count
- Post-call task linking for follow-ups such as payment promises, callbacks, dispute review, wrong-contact verification, payment-plan review, non-commitment follow-up, and support requests
- Customer activity updates for call initiated, call completed, outcome recorded, and tasks created from calls
- Webhook-backed post-call automation that records outcomes, creates linked tasks, and sends recap plus SOA after Retell calls end
- Polling sync recovery for completed Retell calls when a terminal webhook was missed
- Retell live custom functions for:
  - `get-account-snapshot`
  - `get-group-invoice-details`
  - `create-promise-to-pay`
  - `update-promise-to-pay`
  - `log-paid-already`
  - `mark-dispute`
  - `request-callback`
  - `capture-handler-handoff`
  - `send-invoice-copy`
  - `send-soa`
  - `capture-partial-payment-commitment`
  - `request-payment-plan-review`
  - `capture-non-commitment`
  - `finalize-call-outcome`
  - `send-payment-link`

Relevant code:

- `apps/api/src/modules/retell/routes.ts`
- `apps/api/src/modules/retell/payload.ts`
- `apps/api/src/modules/retell/service.ts`
- `apps/api/src/modules/retell/post-call-automation.ts`
- `apps/api/src/modules/retell/email-copy.ts`
- `apps/api/src/modules/retell/call-inbox-adapter.ts`
- `apps/api/src/modules/retell/custom-functions.catalog.ts`
- `apps/api/src/modules/retell/signature.ts`
- `apps/api/src/bootstrap/call-inbox-service.ts`
- `apps/api/src/modules/collections-call-inbox.ts`
- `packages/contracts/src/collections/call-inbox.ts`
- `packages/workflows/src/collections/call-inbox.ts`
- `packages/database/src/client/call-inbox-store.ts`
- `packages/database/src/migrations/0021_call_inbox_records.sql`

### Cash application, remittances, and payment handling

- Payment routes
- Cash-application routes and workflow logic
- Remittance ingestion routes
- Bank statement file parsing
- Spreadsheet invoice import support
- BIR invoice review support

Relevant code:

- `apps/api/src/modules/payments.ts`
- `apps/api/src/modules/cash-application.ts`
- `apps/api/src/modules/remittance-ingestion.ts`
- `apps/api/src/modules/bank-statement-file-parser.ts`
- `apps/api/src/modules/spreadsheet-invoice-file-parser.ts`
- `apps/api/src/modules/bir-invoice-review.ts`

### Deductions, exceptions, and credit facilities

- Deductions routes and workflow hooks
- Credit-facility routes
- Exception-oriented review and follow-up surfaces

Relevant code:

- `apps/api/src/modules/deductions.ts`
- `apps/api/src/modules/credit-facilities.ts`

### Control center and tasking

- Control-center API routes
- Operator feedback routes
- Task routes
- Task detail modal for opening, reviewing, navigating, and completing task work in-place
- Email follow-up task completion flow with generated draft, editable body, formatting controls, attachment/document actions, direct send, status update, activity writeback, and audit logging
- Left/right task navigation from the task detail popup
- Fallback workflow editing in the web UI
- Production-focused Control Center workflow settings with persisted activate/deactivate toggles, Manila outreach windows, selectable outreach days, connected email sender display, and real test email/test call actions
- Searchable Control Center email templates that can be created, edited, and applied from Collections compose and task email follow-up surfaces
- Refined Control Center > Call Agent page with read-only Retell number display, outbound-calling enablement, SMS greyed out until ready, and unsupported provider/config controls hidden
- Explainable workflow and follow-up orchestration support

Relevant code:

- `apps/api/src/modules/control-center.ts`
- `apps/api/src/modules/operator-feedback.ts`
- `apps/api/src/modules/tasks.ts`
- `apps/web/src/app/dashboard.tsx`
- `apps/web/src/modules/control-center-fallback.ts`

### Access control and admin operations

- Access-control routes
- RBAC support package
- Admin user invite flow in the web app
- Client connect invite creation and cancellation

Relevant code:

- `apps/api/src/modules/access-control.ts`
- `packages/auth/src/rbac.ts`
- `apps/api/src/modules/client-connect-invites.ts`
- `apps/web/src/index.ts`

### Integration support

Current adapters and surfaces in the build:

- Business Central
- QuickBooks
- SAP Business One
- Odoo
- Gmail
- Retell
- generic connector/integration inspector flows

The build includes:

- connector setup and health APIs
- import/sync support
- some writeback paths
- operator-facing integration inspector flows

Relevant code:

- `apps/api/src/integrations/`
- `apps/api/src/modules/business-central.ts`
- `apps/api/src/modules/quickbooks.ts`
- `apps/api/src/modules/sap-business-one.ts`
- `apps/api/src/modules/odoo.ts`
- `apps/api/src/modules/integration-inspector.ts`

### Learning layer and outreach intelligence

- Shared outreach context generation
- Personalized email draft generation
- SMS draft generation
- Voice-agent context / brief generation
- Explainable behavior/profile recomputation job hooks

Relevant code:

- `packages/workflows/src/outreach-intelligence.ts`
- `apps/api/src/modules/outreach-intelligence.ts`
- `docs/build_capability_reference.md`

### Operator dashboard and analytics

- Operator-facing "Today" and date labels use `Asia/Manila` by default through a shared web date utility
- The Home calendar initializes from the current Philippine date and supports previous/next week navigation through the `calendarDate` query parameter
- Calendar activity is built from available operational data: open tasks, cash-application review rows, bank credits, remittances, email messages, calls, and AI/customer activity
- Home task aging bars count real open tasks linked to invoice aging buckets instead of hardcoded sample values; each bar exposes the exact task count on hover
- The Home "Respond to" section summarizes invoice payment disputes, broken promises to pay, and open tasks by customer, with the open-task action routed to `/tasks`
- Analytics charts aggregate from currently supported invoices, tasks, cash-application rows, payments, remittances, email/call activity, and AI activity
- Weekly/monthly Analytics filters change the aggregation window through `?trend=weekly` and `?trend=monthly`
- Dashboard and Analytics render clear empty states when no operational data is available; normal runtime should not show sample chart/dashboard values

Relevant code:

- `apps/web/src/app/date-utils.ts`
- `apps/web/src/app/dashboard.tsx`
- `apps/web/src/app/data.ts`
- `apps/web/src/index.ts`
- `apps/web/src/server.tsx`
- `apps/api/src/modules/operator-console.ts`

### Web surfaces that exist today

The SSR web app already includes:

- operator dashboard
- Home dashboard with setup status, Manila-current calendar, due-today exposure, respond-to counts, task aging chart, task-type chart, customer task chart, and clean empty states
- Analytics dashboard with operational KPIs, weekly/monthly trends, hoverable chart values, top-customer balance bars, and no top-right export action
- task module with detail/completion modal
- customer index and customer detail workspace
- Collections Email Inbox
- Collections Call Inbox as a separate selected Collections tab at `/collections?tab=call-inbox`
- Control Center workflow, email-template, and Call Agent settings with unsupported Config controls hidden for now
- integration portal
- integration inspector
- customer statement page
- client connect invite screens
- admin user invite flow
- data-source upload/runtime hooks
- control-center fallback workflow editing

Relevant code:

- `apps/web/src/index.ts`
- `apps/web/src/server.tsx`
- `apps/web/src/app/`

### Worker runtime

The worker app is still lightweight, but it already models the job types the system expects:

- `integration-sync`
- `workflow-dispatch`
- `collections-follow-up`
- `deductions-upload-hook`
- `deductions-ap-portal-hook`
- `learning-profile-recompute`
- `pilot-writeback-dispatch`

Relevant code:

- `apps/worker/src/bootstrap/job-registry.ts`
- `apps/worker/src/jobs/run-jobs.ts`

## Monorepo Overview

### Apps

- `apps/api`: Fastify API for operational workflows, integrations, approvals, collections, payments, remittances, access control, and Retell voice support
- `apps/web`: server-rendered operator console, integration portal, client invite surface, and customer statement rendering
- `apps/worker`: lightweight background/demo runtime for workflow and audit execution

### Shared packages

- `packages/domain`: typed domain objects, state machines, services, and invariants
- `packages/workflows`: orchestration for collections, cash application, ingestion, outbound email, Retell voice actions, outreach intelligence, and learning events
- `packages/contracts`: shared API/read-model contracts
- `packages/database`: schema generation, DB client, and migration tooling
- `packages/routing`: hierarchy-aware account routing logic
- `packages/audit`: audit logging abstractions
- `packages/config`: typed environment loading and validation
- `packages/seed`: demo fixtures and seeded scenarios
- `packages/auth`, `packages/types`, `packages/testkit`: shared support packages

### Important bounded contexts already represented

- accounts
- contacts
- invoices
- uploaded documents
- payments
- remittances
- promises to pay
- exceptions
- approvals
- activity logs
- integrations
- collections
- cash application
- learning layer
- access control

## Current Product Shape

Current implementation emphasis:

- strongly typed domain models in `packages/domain`
- business rules and orchestration in `packages/workflows`
- provider-specific integration handling in API/workflow adapters
- approval gating and auditability around risky money or messaging actions
- email-complete MVP foundations with a multi-channel-ready learning layer architecture
- increasingly realistic Retell live-call support rather than static demo-only scaffolding

Current limitations:

- some operator read models still use in-memory or lightweight stores where durable projections have not landed yet
- seeded/demo scenarios are opt-in for normal local runtime through `ENABLE_DEMO_DATA=true`
- worker execution is not yet a full durable queue system
- not every integration path has full writeback parity
- some connector/provider paths are still development-grade rather than hardened for production operations
- SOA PDF rendering prefers a local browser runtime for the polished format and falls back if that runtime is unavailable
- `statementSnapshotId` exists in request/metadata flow, but immutable persisted SOA snapshots are not fully implemented yet

## Quick Start

### Prerequisites

- Node.js 22+
- Corepack enabled
- pnpm 10+
- Docker or local PostgreSQL and Redis

### Install

```bash
cp .env.example .env
cp .env.test.example .env.test
pnpm install
```

### Start local infrastructure

```bash
docker compose up -d postgres redis
```

### Run migrations

```bash
pnpm db:migrate
```

Keep migrations current before testing operator-console, Call Inbox, and Control Center flows. The current build relies on the latest migrations for control-center workflow execution state and normalized call inbox records.

### Run the workspace

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

### First run checklist

1. Copy `.env.example` to `.env` and `.env.test.example` to `.env.test`.
2. Start Postgres and Redis with `docker compose up -d postgres redis`.
3. Run `pnpm install`.
4. Run `pnpm db:migrate`.
5. Start the workspace with `pnpm dev`.

## Common Commands

Workspace-level commands that exist today:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm format:write
pnpm typecheck
pnpm db:migrate
pnpm db:generate
pnpm clean
```

App-focused commands:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
pnpm --filter @o2c/api test
pnpm --filter @o2c/web test
pnpm --filter @o2c/worker test
```

There is currently no root `pnpm db:seed` script. Seed/demo data comes from the shared seed package and app-level runtime setup.

## Repository Layout

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
tooling/
tests/
```

## API Surface Overview

The Fastify app currently registers real route modules for:

- `/v1/accounts`
- `/v1/approvals`
- `/v1/bir-invoice-review`
- `/v1/business-central`
- `/v1/cash-application`
- `/v1/collections/call-inbox`
- `/v1/collections-email`
- `/v1/control-center`
- `/v1/credit-facilities`
- `/v1/customer_profiles`
- `/v1/deductions`
- `/v1/email-outbound`
- `/v1/email/gmail`
- `/v1/integration-inspector`
- `/v1/integrations/client-connect-invites`
- `/v1/invoice-imports`
- `/v1/invoices`
- `/v1/odoo`
- `/v1/operator-console`
- `/v1/operator-feedback`
- `/v1/outreach-intelligence`
- `/v1/payments`
- `/v1/pilot-readiness`
- `/v1/quickbooks`
- `/v1/remittance-ingestion`
- `/v1/retell/*`
- `/v1/sap-business-one`
- `/v1/tasks`
- access-control/admin routes

Some additional module prefixes are still exposed as `not_implemented` placeholders through `apps/api/src/modules/register-modules.ts`.

## Environment

Environment validation lives in `packages/config/src/env/schema.ts`.

Required core variables:

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

Optional or integration-specific variables exist for:

- Gmail
- generic outbound email / SMTP-style sending identity config
- QuickBooks
- Business Central
- Odoo
- SAP Business One
- NetSuite
- Xero
- Zoho
- DEAR
- Google Sheets
- Perfios
- OpenAI-backed outreach drafting
- Retell outbound collections calls

Useful local-dev flags:

- `ENABLE_DEMO_DATA=false`: default normal runtime; operational surfaces prefer real DB/integration data and render empty states instead of sample customers, tasks, email, or call rows
- `ENABLE_DEMO_DATA=true`: opt-in seed/demo mode for local scenario exploration and tests that intentionally exercise seeded fixtures
- `O2C_API_BASE_URL`: API base URL used by the SSR web app when it needs to call the API from the server process
- `RETELL_API_KEY`, `RETELL_BASE_URL`, `RETELL_FROM_NUMBER`, `RETELL_OUTBOUND_AGENT_ID`: Retell outbound calling and call retrieval config
- `RETELL_CUSTOM_FUNCTION_BASE_URL`: public HTTPS API/tunnel URL used when generating Retell custom-function endpoints
- `RETELL_CUSTOM_FUNCTION_SECRET`: custom-function signature secret; defaults to `RETELL_API_KEY` when unset
- `RETELL_WEBHOOK_SECRET`: optional Retell webhook signature secret; falls back to `RETELL_CUSTOM_FUNCTION_SECRET` or `RETELL_API_KEY`
- `RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION=true`: local testing bypass for Retell custom-function auth
- `RETELL_CALL_INBOX_POLLING_ENABLED`, `RETELL_CALL_INBOX_POLLING_INTERVAL_SECONDS`, `RETELL_CALL_INBOX_POLLING_LIMIT`: optional Retell polling recovery for missed terminal webhooks; enabled by default when `RETELL_API_KEY` is configured, polling the recent calls list every 60 seconds with a default limit of 20

If an integration is not configured, the relevant screens and API flows should show unavailable states or clean empty states in normal runtime. Seeded/demo fallbacks are retained for development, but they must be explicitly enabled instead of appearing as operational data by default.

## Operator-Facing Dates And Timezone

Operator-facing date displays use `Asia/Manila` as the canonical timezone unless a future tenant/account-specific timezone is explicitly configured. This applies to "Today" labels, Home calendar initialization, date keys used for dashboard buckets, and current-period Analytics aggregations.

The SSR web app should not treat API `generatedAt` timestamps as the operator's current date. `generatedAt` remains useful for source freshness, while operator date labels are computed at render time in Philippine timezone.

## Operational Data And Demo Mode

Operational surfaces should not display sample customers, tasks, emails, calls, or dashboard rows in normal runtime. With `ENABLE_DEMO_DATA=false`, the web app and API prefer live database/integration-backed data and render clear empty states when no operational data exists.

Home and Analytics follow the same rule: if no real task, invoice, payment, outreach, call, or workflow data is available, they show empty states instead of seeded charts, fake counts, or sample respond-to rows.

The customer module can still show accounts created from imported invoice/account data even when the customer-profile read model is empty. That keeps imported operational data visible without reintroducing fake contacts such as placeholder AP or collections addresses. Invoice-derived emails may be used for draft context, but unverified contacts remain visibly unverified and must pass the normal safety checks before sending.

Use `ENABLE_DEMO_DATA=true` only when intentionally exercising seed fixtures, demo workflows, or tests that expect seeded scenarios.

## Retell Collections Calls

The Retell pre-call flow lives at `POST /v1/retell/collections/outbound-call`. It accepts either inline billing account, contact, and SOA invoice data or database references (`billingAccountId`, `contactId`, optional `invoiceIds`) when a live database is available.

Before dialing, `packages/workflows/src/collections/voice-pre-call.ts` computes overdue, due-today, and pre-due invoice buckets and blocks unsafe outreach for disputed invoices, unverified contacts, ambiguous routing, missing branch context when policy requires it, ERP-unverified invoices, do-not-call flags, strategic accounts without approval, and calls outside the configured collections window. It also evaluates promise-to-pay context into ordered call priority groups: broken promises first, then overdue without promise, due today without promise, pre-due without promise, active future promises, and routine reminders, with disputed invoices preserved separately outside chaseable groups.

The pre-call output includes:

- `call_priority_plan`
- `call_objective`
- invoice-group counts and totals
- operator/debug summaries
- right-party-check and handler-handoff context

Important implementation detail for Retell flow logic:

- Retell receives dynamic variables as strings
- for call-flow branching, prefer checks like `{{overdue_without_promise_count}} != "0"` over native boolean assumptions

The workflow exposes whether the contact is already a verified invoice-payment handler. Retell receives `right_party_check_required=false` only for verified handlers; otherwise the live call must verify the right party before invoice group handling.

Inbound buyer callbacks use `POST /v1/retell/collections/inbound-call`. The route identifies the caller by phone number, loads account/contact/invoice/promise context, reuses the same promise-aware planner, and returns updated Retell dynamic variables plus routing and handler context.

Completed or updated provider call events are normalized into the Call Inbox read model. The Call Inbox APIs are:

- `GET /v1/collections/call-inbox`
- `GET /v1/collections/call-inbox/:callRecordId`
- `GET /v1/collections/call-inbox/export`
- `POST /v1/retell/collections/call-inbox/sync`

The Retell adapter keeps provider-specific payload parsing at the integration boundary, then stores normalized records through the workflow service. Upserts are idempotent on tenant, provider, and provider call id, so duplicate Retell updates refresh the existing call record instead of creating duplicate inbox rows.

Yield-originated outbound collections calls are marked with post-call automation metadata:

```json
{
  "post_call_automation": "email_recap_and_soa",
  "post_call_email_recap": true,
  "post_call_send_soa": true
}
```

For low-latency live calls, the recommended Retell flow does not call `send-soa` or `finalize-call-outcome` synchronously during the conversation. Instead, configure Retell terminal call webhooks to post to `POST /v1/retell/webhooks/calls`. When a terminal event such as `call_ended` or `call_analyzed` arrives, the API normalizes the call into Call Inbox, records the post-call outcome, creates linked tasks, sends the recap plus SOA through the existing outbound email service, and audit logs each step.

`POST /v1/retell/collections/call-inbox/sync` is the recovery path when a webhook is missed or delayed. It fetches recent Retell calls, upserts Call Inbox records idempotently, and returns a `postCallAutomations` array showing which calls were queued or skipped and why.

See `docs/retell_low_latency_flow.md` for the recommended Retell flow reconstruction and which live functions should remain caller-facing only.

Post-call outcomes can be recorded through `POST /v1/retell/collections/call-outcome`; the endpoint emits auditable persistence plans for:

- contact handoff
- routing changes
- promise updates and monitoring
- partial payment commitments
- payment plan requests
- non-commitment capture
- paid-already claims
- disputes
- callbacks
- next-step follow-up actions

Post-call handling can link tasks back to the call inbox record, billing account, contact, and invoice context when known. The inbox list surfaces `openTasksCount` from linked task references, and call ingestion/task linking/customer activity writes are audit logged.

For Retell live-call custom functions, run the API, expose it over HTTPS with a tunnel or deployed URL, then open `GET /retell/functions` to copy the exact route paths and request examples into Retell. The API supports Retell's `Payload: args only` mode for all `/retell/functions/*` endpoints. These functions remain useful for live capture, manual fallback, and tests, but recap/SOA work should usually run after the call through webhook-backed automation.

## Email And SOA Notes

The current build supports sending SOA documents through the outbound email workflow and connected sender identity. In local/demo environments, verify that a default sending identity exists before testing live sends.

Retell post-call recap emails use the same outbound email workflow. The recap starts with "Thank you for taking our call earlier.", then summarizes the invoice groups in concise bullets from the supplier/operator perspective. It should not mention internal agent mechanics, identity confirmation, "the user", or things that did not happen in the call.

Email follow-up tasks open in the shared task detail popup. The popup shows customer/account context, invoice/balance/overdue summary when known, task status and brief, reply-aging indicators, and an AI-generated draft by default. Operators can switch into edit mode, adjust from/to/cc/bcc and the body, use formatting controls, attach files, add invoice/SOA documents, send through the existing outbound email flow, or cancel without changing the task.

After a send, the task flow updates task state, writes customer activity, and records an audit event. The same safety posture applies here as elsewhere: unverified or ambiguous contacts should not become silent auto-send targets.

The SOA send flow is account/contact scoped:

- it does not require `invoiceIds`
- it uses billing-account context
- it generates a PDF attachment
- it can include a Retell-derived customer-facing call recap in the email body
- it sends through the configured/default sender identity

If your local environment already has a connected sender identity, `send-soa` and the post-call automation will use it. In the current dev dataset, a connected Gmail sender identity can be used as the default sender when present. Gmail may thread a sent recap into an existing conversation, especially when the sender and recipient are the same account, so check Sent or All Mail if it does not appear as a new inbox message.

Manual sync command for local Retell recovery:

```bash
curl -s -X POST http://127.0.0.1:3001/v1/retell/collections/call-inbox/sync \
  -H 'content-type: application/json' \
  --data '{"limit":20}'
```

## Testing

The repo includes a growing automated test suite across API routes, workflows, domain services, and integration behavior.

Useful examples:

- `apps/api/src/call-inbox.test.ts`
- `apps/api/src/retell-post-call-automation.test.ts`
- `apps/api/src/retell-post-call-tasking.test.ts`
- `apps/api/src/retell-functions.test.ts`
- `apps/api/src/retell-pre-call.test.ts`
- `apps/api/src/email-inbox.test.ts`
- `apps/api/src/collections-email.test.ts`
- `apps/api/src/outreach-intelligence.test.ts`
- `apps/api/src/control-center.test.ts`
- `apps/api/src/cash-application.test.ts`
- `apps/web/src/app/call-inbox-dashboard.test.tsx`
- `apps/web/src/app/dashboard.test.tsx`
- `apps/web/src/app/task-detail-modal.test.tsx`
- `apps/web/src/app/operator-ui-runtime.test.tsx`
- `packages/workflows/src/control-center.test.ts`
- `packages/auth/src/rbac.test.ts`

Run everything:

```bash
pnpm test
```

Run a focused API suite:

```bash
pnpm --filter @o2c/api exec vitest run src/retell-functions.test.ts
```

Run focused suites for the latest Retell call inbox, post-call automation, tasking, and email UX work:

```bash
pnpm --filter @o2c/api exec vitest run src/retell-pre-call.test.ts src/retell-functions.test.ts src/retell-post-call-automation.test.ts src/call-inbox.test.ts
pnpm --filter @o2c/api exec vitest run src/call-inbox.test.ts src/retell-post-call-tasking.test.ts
pnpm --filter @o2c/web exec vitest run src/app/call-inbox-dashboard.test.tsx src/app/task-detail-modal.test.tsx src/app/operator-ui-runtime.test.tsx
```

Run the focused dashboard/analytics suite:

```bash
pnpm --filter @o2c/web exec vitest run src/app/dashboard.test.tsx
```

## Known Gaps And Honest Caveats

- Some modules are operationally useful but still development-MVP grade rather than production-hardened.
- Normal runtime suppresses sample/demo operational data unless `ENABLE_DEMO_DATA=true`; dev/test fixtures remain intentionally synthetic.
- Analytics trend charts are derived from currently available read models and dated events; true historical ledger/payment snapshots still need a durable analytics projection.
- Not every ERP connector has the same depth of writeback support.
- The worker runtime models expected jobs, but it is not yet a full durable production queue system.
- SOA rendering is significantly improved, but the polished PDF path depends on the availability of the local/browser rendering runtime.
- Immutable statement snapshot persistence is still incomplete; current SOA PDF generation is based on live account/invoice context at send time.

## Related Docs

- `docs/yield_aros_canonical_prd.md`
- `docs/yield_aros_canonical_object_state_spec.md`
- `docs/yield_aros_codex_engineering_spec.md`
- `docs/yield_aros_learning_layer_multichannel_codex.md`
- `docs/build_capability_reference.md`
- `docs/retell_low_latency_flow.md`
- `docs/pilot-launch-checklist.md`
- `docs/render-pilot-deploy.md`
