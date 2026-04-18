# Yield AROS — Canonical Object and State Specification

**Version:** v1.0  
**Owner:** Joshua Lee / Product

> Treat this as a working source of truth. Where this document points to configurable policy, keep values configurable rather than hardcoding them into integrations, workflows, or UI states.

## 1. Modeling Principles

- ERP remains source of truth for ledger objects. Yield may ingest, propose, apply, and write back, but must not silently diverge.
- Billing account is the default collections routing level. Branch must be preserved whenever known.
- Safe automation first. Sensitive actions require approval; high-risk automation must route to review or exceptions.
- Typed exceptions are first-class objects.
- Every material action must be audit logged.
- Canonical invoice identity must not rely on invoice number alone.

## 2. Object Inventory

| Object | Purpose |
|---|---|
| parent_account | Legal group / centralized treasury relationship; visibility and payer-behavior rollup. |
| billing_account | Default collections grouping and routing unit. |
| branch | Physical/store/site/location tied to invoice destination or fulfillment. |
| contact | Verified or unverified person/shared mailbox for collections and docs routing. |
| uploaded_document | BIR invoice, bank statement, proof of payment, SOA, DR, PO, OR, or other support doc. |
| invoice | ERP-synced or uploaded/provisional invoice with canonical identity and collection state. |
| payment | Incoming payment candidate from ledger, bank scrape, statement, webhook, or manual source. |
| payment_application | Join object between payment and invoice showing applied amount and status. |
| remittance | Advice from email/upload with parsed references, payer, and amount. |
| promise_to_pay | Structured commitment extracted from buyer response or entered manually. |
| exception | Typed issue requiring triage, owner, SLA, and playbook-driven resolution. |
| activity_log | Immutable trail of AI, user, system, and integration actions. |
| approval_request | Human approval gate for risky communications or accounting-impacting actions. |

## 3. Common Conventions

- All first-class objects use UUID internal IDs, tenant_id, created/updated timestamps, actor metadata, version, and soft-delete flag.
- Money should use minor units for authoritative arithmetic.
- Confidence-bearing workflows must store score, band, and reason.
- External source IDs and provider names must be stored separately from internal IDs.

## 4. Invoice Identity Rules

- Canonical identity defaults to `entity_id + buyer_account_id + invoice_number + invoice_date + total_amount`.
- Uploaded BIR invoice docs must preserve raw extracted values, normalized values, human-corrected values, and final locked values.
- If an uploaded invoice cannot be matched confidently to ERP, create a provisional invoice and block auto-collections until ERP match or human confirmation.
- Duplicate detection should use file hash plus invoice signals.

## 23. Invoice State Machine

**Terminal-state policy:** `paid` and `voided` are terminal except admin/manual rollback.

**States:** `uploaded_unmatched`, `synced_open`, `matched_to_erp`, `partially_paid`, `paid`, `disputed_partial`, `disputed_full`, `credit_pending`, `writeback_pending`, `writeback_failed`, `voided`

| From state | Allowed transitions |
|---|---|
| uploaded_unmatched | matched_to_erp, voided |
| synced_open | partially_paid, paid, disputed_partial, disputed_full, credit_pending, writeback_pending, voided |
| matched_to_erp | partially_paid, paid, disputed_partial, disputed_full, credit_pending, writeback_pending, voided |
| partially_paid | paid, disputed_partial, credit_pending, writeback_pending |
| disputed_partial | partially_paid, paid, credit_pending |
| disputed_full | synced_open, credit_pending, voided |
| credit_pending | synced_open, partially_paid, paid, voided |
| writeback_pending | synced_open, partially_paid, paid, writeback_failed |
| writeback_failed | writeback_pending, synced_open, partially_paid |

## 27. Payment State Machine

**Terminal-state policy:** `reversed` is terminal except admin/manual correction.

**States:** `ingested_unmatched`, `candidate_match_found`, `review_required`, `auto_applied`, `manually_applied`, `partially_applied`, `unapplied_cash`, `reversed`, `writeback_pending`, `writeback_failed`

| From state | Allowed transitions |
|---|---|
| ingested_unmatched | candidate_match_found, unapplied_cash, reversed |
| candidate_match_found | auto_applied, review_required, manually_applied, unapplied_cash |
| review_required | manually_applied, partially_applied, unapplied_cash, reversed |
| auto_applied | writeback_pending, writeback_failed |
| manually_applied | writeback_pending, writeback_failed |
| partially_applied | writeback_pending, unapplied_cash, writeback_failed |
| unapplied_cash | candidate_match_found, manually_applied, partially_applied |
| writeback_pending | auto_applied, manually_applied, partially_applied, writeback_failed |
| writeback_failed | writeback_pending, manually_applied, partially_applied |

## 31. Remittance State Machine

**Terminal-state policy:** `resolved` and `orphaned` are terminal except admin/manual reopening.

**States:** `received_unparsed`, `parsed_structured`, `linked_to_payment`, `linked_to_invoice_candidate`, `review_required`, `resolved`, `orphaned`

| From state | Allowed transitions |
|---|---|
| received_unparsed | parsed_structured, review_required, orphaned |
| parsed_structured | linked_to_payment, linked_to_invoice_candidate, review_required, orphaned |
| linked_to_payment | resolved, review_required |
| linked_to_invoice_candidate | resolved, review_required |
| review_required | linked_to_payment, linked_to_invoice_candidate, resolved, orphaned |

## 35. Promise to Pay State Machine

**Terminal-state policy:** `kept`, `superseded`, and `cancelled` are terminal except admin/manual reopening.

**States:** `detected_unconfirmed`, `accepted`, `due_today`, `kept`, `broken`, `superseded`, `cancelled`

| From state | Allowed transitions |
|---|---|
| detected_unconfirmed | accepted, cancelled |
| accepted | due_today, superseded, cancelled |
| due_today | kept, broken, superseded |
| broken | accepted, superseded |

## 39. Exception State Machine

**Terminal-state policy:** `resolved` and `dismissed` are terminal except admin/manual reopening.

**States:** `open_new`, `triaged`, `waiting_on_customer`, `waiting_on_internal`, `ready_for_resolution`, `resolved`, `dismissed`

| From state | Allowed transitions |
|---|---|
| open_new | triaged, dismissed |
| triaged | waiting_on_customer, waiting_on_internal, ready_for_resolution, dismissed |
| waiting_on_customer | ready_for_resolution, dismissed |
| waiting_on_internal | ready_for_resolution, dismissed |
| ready_for_resolution | resolved, dismissed |

## Cross-object invariants

- Full disputes block auto-collections and require approval for outreach.
- Partial disputes may continue collections only on the undisputed portion; collectible amount must reflect disputed amount.
- Auto-apply is allowed only when payment is settled, invoice is open in latest verified snapshot, no dispute or hold flags exist, mapping confidence is high, there is no cross-entity ambiguity, there is no conflicting remittance, and ERP writeback path is available.
- No auto-send to unverified contacts or newly discovered emails without approval.
- Failed writebacks must create visible status and audit events.

## Domain events to emit

- `invoice.uploaded`, `invoice.matched_to_erp`, `invoice.dispute_marked_partial`, `invoice.dispute_marked_full`, `invoice.paid`
- `payment.ingested`, `payment.candidate_match_found`, `payment.auto_applied`, `payment.review_required`, `payment.writeback_failed`
- `remittance.received`, `remittance.parsed`, `remittance.linked`
- `ptp.detected`, `ptp.accepted`, `ptp.broken`
- `exception.created`, `exception.triaged`, `exception.resolved`
- `approval.requested`, `approval.approved`, `approval.rejected`
- `writeback.requested`, `writeback.succeeded`, `writeback.failed`
