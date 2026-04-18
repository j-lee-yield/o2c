# Yield AROS — Codex Engineering Specification

**Version:** v1.0  
**Owner:** Joshua Lee / Product

> Treat this as a working source of truth. Where this document points to configurable policy, keep values configurable rather than hardcoding them into integrations, workflows, or UI states.

## 1. Purpose

- Translate the canonical PRD into an implementation-ready engineering spec for Codex tasks, repo scaffolding, domain modeling, integration contracts, workflow rules, and testability.

## 2. Engineering Priorities

1. correctness of money movement and ledger logic  
2. safety and approval gating  
3. explainability and auditability  
4. extensible integrations  
5. polished operator UX

## 3. Required Repo Outputs

- Monorepo scaffold
- shared domain package
- DB migrations
- worker/job service
- API modules
- policy/config layer
- seeded fixtures
- tests
- AGENTS.md
- architecture decisions

## 4. Required Bounded Contexts

- accounts
- invoices
- uploaded_documents
- payments
- remittances
- promises_to_pay
- exceptions
- approvals
- activity_logs
- integrations
- collections
- cash_application

## 5. Non-negotiable Safeguards

- No auto-send to unverified contacts
- no auto-collections on full disputes
- no auto-apply under cross-entity ambiguity
- no silent ERP divergence
- terminal states reopenable only by admin/manual path

## 6. Config that Must Stay Editable

- Exposure thresholds
- confidence thresholds
- send windows
- escalation ladders
- centralized payer flags
- auto-accept PTP windows
- resend document bundles
- provider writeback capabilities

## 7. Implementation Sequence

- Scaffold monorepo, worker, shared domain package, migrations, tests, and AGENTS.md.
- Implement canonical objects, enums, state machines, and transition guards.
- Implement hierarchy-aware routing, contact precedence, and branch-preserving invoice linkage.
- Implement uploaded-document ingestion, BIR invoice parsing, and review/edit contracts.
- Implement provider abstraction for QuickBooks, Xero, Zoho, Dear ERP, Google Sheets, email, bank inputs, and Perfios-normalized statements.
- Implement collections engine, typed exceptions, PTP extraction, resend flow, and approvals.
- Implement cash application scorer, decision service, review queue, auto-apply path, and writeback staging.
- Wire operator UI to real APIs, seeded fixtures, and pilot metrics.

## 8. Required APIs and Services

| Area | Required services / contracts |
|---|---|
| Accounts | Parent/billing/branch hierarchy services; contact routing; memory service. |
| Invoices | Identity service; invoice lifecycle service; dispute and credit handling; ERP snapshot validation. |
| Documents | Upload service; parser adapters; duplicate detection; review/lock service. |
| Payments | Ingestion service; payment application join model; matching scorer; writeback staging. |
| Remittance | Email/upload ingestion; parser; linker; review queue. |
| Collections | Workflow engine; message generation; send-window guard; escalation engine. |
| Approvals | Approval policy engine; approval queue; role guard middleware. |
| Audit | Immutable append-only log for state changes, messaging, writebacks, and overrides. |

## 9. Test Expectations

- Unit tests for every valid and invalid state transition.
- Contract tests for provider adapters and field mappings.
- Scenario tests for already-paid / not-yet-matched, partial disputes, short pays, overpayments, and centralized payer behavior.
- Integration tests for writeback idempotency, sync retries, duplicate detection, and approval gating.
- Seed data covering distributors, manufacturers, and importers / wholesalers.

## 10. Codex Guardrails

**Instruction for Codex:** Do not invent risky money, approval, or messaging rules. Choose safe defaults, keep thresholds configurable, document assumptions, and prefer complete vertical slices over broad unfinished scaffolds.

## 11. Sprint-ready task buckets

- **Sprint 1:** monorepo scaffold, canonical schema, hierarchy/routing, RBAC and audit foundation.
- **Sprint 2:** integrations framework, BIR invoice ingestion, Perfios-normalized statements, remittance ingestion.
- **Sprint 3:** collections workflow engine, PTP, resend flow, typed exceptions, approval policy engine.
- **Sprint 4:** cash application engine, operator UI, pilot metrics, hardening and release checklist.
