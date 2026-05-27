# Collections Call Inbox Implementation Note

## Architecture

- Retell remains an adapter, not a domain object. Retell webhook and polling payloads are normalized in `apps/api/src/modules/retell/call-inbox-adapter.ts`.
- The provider-neutral call inbox contract lives in `packages/contracts/src/collections/call-inbox.ts`.
- The read/write workflow lives in `packages/workflows/src/collections/call-inbox.ts`, with idempotent upsert by `(tenantId, provider, providerCallId)`.
- Persisted records use `call_inbox_record` via `packages/database/src/migrations/0021_call_inbox_records.sql`; local tests and no-DB runs use the in-memory repository.
- The API exposes:
  - `GET /v1/collections/call-inbox`
  - `GET /v1/collections/call-inbox/:callRecordId`
  - `GET /v1/collections/call-inbox/export`
  - `POST /v1/retell/webhooks/calls`
  - `POST /v1/retell/collections/call-inbox/sync`
- Post-call outcomes still use the existing Retell outcome flow, then link created tasks back into the normalized call record.

## Safety And Auditability

- Billing account, parent account, branch, contact, invoice references, communication attempt, and pre-call plan IDs are preserved whenever Retell metadata or post-call outcomes provide them.
- Webhook and polling upserts emit immutable audit entries for ingestion/update. Post-call task linkage emits the existing post-call task audit entries and updates the call inbox record.
- Call Inbox ingestion itself does not auto-send, auto-apply, or treat Retell artifacts as ERP truth. Explicitly flagged Yield-originated Retell calls may trigger the post-call recap/SOA automation after webhook ingestion, but the send still goes through the existing outbound email workflow and its verified-contact/approval safety gates.

## Assumptions

- Retell webhooks send either `{ event, call }` or a direct call object with `call_id`.
- Retell recording URLs may be ephemeral, so the normalized model stores `recordingExpiresAt` when the direct recording URL is present.
- Invoice references are best-effort from Retell metadata/dynamic variables or post-call outcome invoice IDs.
- The web UI uses the normalized API when available and shows seeded call data only when the API cannot be reached.

## TODOs

- Confirm production Retell webhook secret naming and rotation policy; `RETELL_WEBHOOK_SECRET` is supported, falling back to the existing Retell custom-function secret/API key.
- Decide whether polling sync should run on a scheduler or remain an operator/admin-triggered fallback.
- Add provider-specific artifact refresh if Retell recording URLs expire before an operator opens the transcript tab.
