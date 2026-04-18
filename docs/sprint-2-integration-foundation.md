# Sprint 2 Integration Foundation

## Sprint 1 inspection summary

Sprint 1 established the package seams and a few important policy guardrails, but it did not yet create a canonical integration foundation:

- `packages/contracts` only exposed tenant and audit primitives.
- `packages/domain` had module metadata for `integrations`, `documents`, and `remittances`, but no connector DTOs or ingestion contracts.
- `packages/workflows` only implemented collections send gating.
- `apps/worker` already reserved an `integration-sync` job queue, which is the right execution root for connector polling and ingestion orchestration.
- Routing and audit scaffolding already support critical locked rules such as billing-account-first routing, branch preservation, and automation logging.

This means Sprint 2 should start by standardizing contracts and normalization rather than jumping directly into app-level adapters.

## Recommended sequencing

1. Define shared contracts first.
   Add canonical connector DTOs, normalization payloads, duplicate-review decisions, and provider descriptors in `packages/contracts`.
2. Implement ingestion decision policy next.
   Add policy-driven workflow evaluation for BIR OCR, Perfios bank statements, remittances, and duplicate classification in `packages/workflows`.
3. Build ERP/accounting adapters against those contracts.
   Start with `netsuite` and `quickbooks_online` pull connectors for customers, invoices, and payments. Keep writeback limited to cash-application contracts.
4. Add document-ingestion entrypoints in the worker.
   Wire uploaded-document events to the correct provider contract: Yield for BIR/remittance, Perfios for statements.
5. Add persistence adapters and review queues.
   Persist raw payload references, normalized records, duplicate signals, and review work items behind ports rather than inside workflow logic.
6. Add operator UX after the backend review flow exists.
   Review screens should reflect typed review reasons from the workflow layer, not invent new client-side heuristics.

## Parallel workstreams

These can run in parallel after the shared contracts land:

- ERP/accounting connector implementation for `netsuite` and `quickbooks_online`
- Yield BIR invoice ingestion adapter
- Perfios statement ingestion adapter
- Yield remittance ingestion adapter
- Persistence ports and repositories for raw payloads, normalized records, and review work items
- API and operator UI for duplicate review and ingestion review queues

These should not run in parallel with contract design:

- Provider-specific payload mapping
- Review queue schema design
- Cash-match automation thresholds

Those must all inherit the shared DTOs and policy objects first.

## Connector contracts

The canonical connector catalog now lives in [packages/contracts/src/integrations/connectors.ts](/Users/jl/Desktop/o2c/packages/contracts/src/integrations/connectors.ts). The first supported providers are:

- `yield` for BIR invoice extraction and remittance parsing
- `perfios` for statement parsing
- `netsuite` for ERP sync
- `quickbooks_online` for accounting sync

Connector DTOs are intentionally split into:

- provider metadata: `ConnectorDescriptor`
- connection/runtime references: `ConnectorConnectionReference`, `ConnectorSyncRequest`
- normalized sync outputs: `ErpCustomerRecord`, `ErpInvoiceRecord`, `ErpPaymentRecord`, `ConnectorSyncBatch`

This keeps provider adapters isolated from domain entities while still allowing routing, matching, and persistence layers to stay typed.

## Normalization strategy

The canonical ingestion DTOs now live in [packages/contracts/src/ingestion/normalization.ts](/Users/jl/Desktop/o2c/packages/contracts/src/ingestion/normalization.ts).

### BIR invoices via Yield

- Source of truth for OCR/parser output is `YieldBirInvoiceExtraction`.
- Every extracted field carries its own confidence through `ParsedField<T>`.
- High-confidence extraction may create a provisional invoice and matching suggestions.
- OCR alone does not make the document eligible for collections automation.
- Collections eligibility remains blocked until ERP match or human confirmation.

### Bank statements via Perfios

- Source of truth for provider output is `PerfiosParsedBankStatement`.
- Raw Perfios payload is retained as `PerfiosRawStatementPayloadRecord`.
- Normalized statement rows are retained as `PerfiosNormalizedStatementRecord`.
- Normalized transaction rows are retained separately as `PerfiosNormalizedTransactionRecord`.
- Perfios confidence thresholds are policy-driven and intentionally easy to revise.
- Low-confidence or duplicate transactions route to review instead of silent automation.

### Remittances via Yield

- Source of truth for parsed remittance is `YieldRemittanceExtraction`.
- Payment-reference and invoice-reference candidates are normalized separately.
- Ambiguous or low-confidence remittances route to matching review.

## Duplicate detection and review routing

Duplicate contracts live in [packages/contracts/src/ingestion/review.ts](/Users/jl/Desktop/o2c/packages/contracts/src/ingestion/review.ts), and policy evaluation lives in [packages/workflows/src/ingestion-foundation.ts](/Users/jl/Desktop/o2c/packages/workflows/src/ingestion-foundation.ts).

The strategy is conservative:

- exact duplicate if checksum or provider record ID matches
- suspected duplicate if business key matches or similarity crosses the configurable threshold
- unique otherwise

Review queues are explicit:

- `duplicate_review`
- `ingestion_review`
- `matching_review`

No path silently discards ambiguous records.

## What was implemented in code

- shared connector contracts and first provider catalog
- normalized ingestion contracts for Yield and Perfios
- duplicate classification and review decision contracts
- workflow foundation for BIR, bank statement, and remittance ingestion decisions
- audit logging for every automated ingestion evaluation

## Remaining Sprint 2 implementation after this foundation

- worker adapters that call Yield, Perfios, NetSuite, and QuickBooks
- persistence ports for raw payload blobs and normalized records
- review queue storage and API endpoints
- ERP reconciliation and writeback adapters
- operator review UI
