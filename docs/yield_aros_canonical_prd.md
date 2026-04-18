# Yield AROS — Canonical PRD

**Version:** v1.0  
**Owner:** Joshua Lee / Product

> Treat this as a working source of truth. Where this document points to configurable policy, keep values configurable rather than hardcoding them into integrations, workflows, or UI states.

Derived from the uploaded MVP PRD and normalized into a single source of truth for product, engineering, and design.

## 1. Product Summary

| Field | Definition |
|---|---|
| One-line promise | Reduce DSO and boost cash flow for Philippine B2B suppliers by autonomously collecting, applying cash, and helping suppliers get paid faster. |
| MVP scope | ERP/accounting sync; customer/account/invoice workspace; email-first collections; promise-to-pay capture; remittance and payment ingestion; invoice-to-cash application; typed exceptions; approvals; auditability. |
| Out of scope | Voice/SMS-first collections; autonomous discounts or settlements; financing handoff automation; deep FX handling; full deductions recovery. |
| Primary KPI | DSO improvement within 90 days for pilot accounts. |

## 2. Target Users and Day-1 Segments

| Field | Definition |
|---|---|
| ICP | Philippine medium enterprises with low margins, high invoice volume, repeat B2B buyers, and manual AR operations. |
| Day-1 segments | Distributors with repeat buyers; manufacturers with PO + delivery + partial payment complexity; importers / wholesalers. |
| Supplier-side users | AR collector, AR manager, controller, finance ops, CFO, admin. |
| Buyer-side contacts | AP contact, treasury contact, branch finance contact, approver, shared finance mailbox. |

## 3. Product Principles

| Field | Definition |
|---|---|
| Execution over analytics | The product must feel like a working console, not a passive dashboard. |
| Safe automation first | AI may automate low-risk work; sensitive actions require approval. |
| Typed exceptions over generic queues | Failures must have clear labels, owners, and playbooks. |
| One account memory across workflow | Collections, remittance, and cash application share context. |
| ERP remains source of truth | Yield proposes, applies, and writes back, but must not silently diverge. |
| Trust through visible reasoning | Show concise summaries of what AI did, why, and what happens next. |

## 4. Core Modules

| Field | Definition |
|---|---|
| Integrations | ERP/accounting connectors, email, bank sources, spreadsheet fallback, writeback staging. |
| Operational workspace | Command center, collections queue, cash-app queue, exceptions queue, approvals queue, account workspace. |
| Collections automation | Email-first reminders, grouped outreach by billing account, promise-to-pay capture, resend flow. |
| Payment and remittance ingestion | Yield ledger, bank scraper, uploaded statements, webhooks, remittance parsing. |
| Cash application | Operator mode with no-regret auto-apply, review suggestions, typed exception routing. |
| Governance | Human approvals, audit logging, safety controls, explainability. |

## 5. Commercial Hierarchy Model

| Field | Definition |
|---|---|
| Hierarchy | Parent Buyer Group → Billing Account / Business Unit → Branch / Site → Contact Routing. |
| Collections default | Group at billing-account level unless supplier rules override. |
| Cash application default | Match within the same billing account first, then expand to parent group if centralized payer behavior is known. |
| Branch requirement | Preserve branch on invoices whenever known; branch-level memory captures doc requirements and contact routing. |

## 6. Invoice Identity and Uploaded Document Model

| Field | Definition |
|---|---|
| Identity layers | Source document identity, commercial invoice identity, and canonical system identity. |
| Canonical identity | `entity_id + buyer_account_id + invoice_number + invoice_date + total_amount`. |
| Required BIR extraction | Seller legal entity, buyer name, invoice number, invoice date, total amount, currency, due terms if visible, PO number if present. |
| Match behavior | Exact strong match may link automatically; near-exact match routes to review; unmatched documents become provisional records and block auto-collections until confirmed. |

## 7. Core Workflows

| Field | Definition |
|---|---|
| ERP/accounting sync | Connect ERP or accounting platform, map fields, import accounts/contacts/invoices/payments, normalize duplicates into parent/billing/branch hierarchy, and write back supported notes/statuses. |
| Collections automation | Email-first day 1; support invoice-level and grouped account-level outreach; default to grouped reminders with urgent invoices emphasized. |
| Resend and supporting-doc flow | Triggered by invoice-not-received or supporting-doc requests; verify invoice and contact; assemble bundle; auto-send only when docs and contact are verified. |
| Payment and remittance ingestion | Ingest from Yield ledger, bank scraper, uploaded statement PDFs, ERP payment feed, and settlement webhooks; normalize, dedupe, and feed candidate matches. |
| Cash application | Auto-apply no-regret matches; suggest medium-confidence matches; route the rest to typed exceptions. |

## 8. Key Screens

| Screen | Purpose and required content |
|---|---|
| Home / Command Center | Cash collected today, overdue at risk, promises due today, unapplied cash, approvals pending, exception counts, AI activity summary. |
| Collections Queue | Operational view by account, invoice, assignee, due bucket, strategic flag, and next recommended action. |
| Account Workspace | Overview, open invoices, communications, promises, payments, remittances, exceptions, documents, memory, audit trail. |
| Invoice Detail | Invoice-specific details, support docs, linked payments, linked remittance, dispute state, and next actions. |
| Payments / Cash App Queue | Auto-applied items, review suggestions, unmatched payments, unapplied cash, reconciliation issues. |
| Exceptions Queue | Typed exceptions with playbooks, urgency, owner, and recommended next action. |
| Approvals Queue | Strategic outreach, disputed invoices, high-balance messages, low-confidence cash application, overrides. |
| AI Activity Feed | Concise explanation of what AI did, why it did it, and what it plans next. |

## 9. Typed Exception Taxonomy

| Exception type | Trigger | Default playbook |
|---|---|---|
| Invoice not received | Buyer says invoice/docs are missing | Pause harder escalation briefly; resend invoice / SOA / DR / PO bundle; confirm billing email. |
| Wrong contact | Bounce, inactive mailbox, or reply says wrong person | Block future sends to contact; mark invalid; search alternate contact; request supplier input if needed. |
| Already paid / not yet matched | Buyer claims payment made or sends proof | Pause normal chase; parse remittance; search bank/payment rails; propose likely match; route to cash-app review. |
| Short payment | Received amount below expected amount | Do not auto-chase disputed portion; determine cause; apply undisputed portion if policy allows; create residual follow-up. |
| Overpayment | Received amount exceeds expected amount | Hold excess as unapplied cash; search sibling or parent-linked invoices; request clarification. |
| Partial dispute | Buyer disputes only part of invoice | Continue collections on undisputed portion only; split operationally into disputed and collectible portions. |
| Full dispute | Buyer disputes full invoice | Block collections and route to owner with reason and support requests. |
| Missing supporting docs | Buyer asks for DR / PO / OR / invoice copy / statement | Pause escalation while docs are gathered; send if available or create doc-recovery task. |
| Credit memo pending | Buyer expects adjustment / credit | Reduce severity or hold; wait for ERP-posted credit or internal review before full chase resumes. |
| Promise-to-pay follow-up | Promised date reached without payment | Create structured follow-up; send reminder; request updated date; escalate according to ladder. |
| Strategic account escalation | VIP rule or exposure threshold hit | Require human review; use stricter tone and notify owner. |
| ERP sync inconsistency | Platform and ERP states diverge | Block unsafe action; resync; show discrepancy; create ops task. |
| Duplicate invoice suspicion | Possible duplicate invoice or upload | Block auto-link and collections; request validation; prevent duplicate application. |
| Unidentified payer / unapplied cash | Payment cannot be confidently linked | Hold unapplied cash; search across parent/branch hierarchy and route for review. |

## 10. Approval Rules and Automation Policy

| Action | Default policy | Approver |
|---|---|---|
| First outbound contact to a new account | Requires approval | AR collector or AR manager per policy |
| Routine due / overdue reminder to verified contact | Auto-send allowed | No approval required |
| Grouped reminder with no strategic/dispute flags | Auto-send allowed | No approval required |
| Invoice resend to verified contact with available docs | Auto-send allowed | No approval required |
| Outreach to strategic / VIP account | Requires approval | AR manager |
| Any outreach on disputed invoice | Requires approval | AR manager |
| Payment-plan, settlement, discount, or write-off language | Requires approval | AR manager or controller |
| Message above configurable exposure threshold | Requires approval | AR manager |
| Cash application at 99%+ confidence and no ambiguity | Auto-apply allowed | No approval required |
| Cash application at 85–99% confidence | Review required | AR collector or controller based on policy |
| Manual ERP writeback override after conflict | Requires approval | Controller |

## 11. Integrations

- Priority connectors: QuickBooks and Xero first; Zoho and Dear ERP next.
- Keep schema ready for NetSuite, SAP B1, Dynamics, Oracle, Odoo, and others.
- Other sources: Google Sheets, bank scraper, uploaded bank statement PDFs, email inbox, and Yield payments ledger.
- Integration requirements: API-first plus spreadsheet fallback, field mapping UI, sync monitoring, idempotent writes, retry/error logs, and conflict detection.

## 12. Non-functional Requirements

- **Reliability:** syncs must be resumable; writebacks must be idempotent; ingestion failures must alert ops.
- **Safety:** no outreach on disputed invoices without approval; no auto-send to unverified contacts; no auto-apply under cross-entity ambiguity; no silent ERP divergence.
- **Auditability:** every outbound message, AI decision summary, approval, and writeback must be traceable.
- **Explainability:** show concise reasons rather than verbose reasoning traces.

## 13. Acceptance Criteria

- A supplier can connect one ERP/accounting source and import accounts, contacts, invoices, and payments.
- A collector can work from one account-level workspace.
- The system can send grouped invoice reminders by email.
- Buyer replies are classified into typed outcomes.
- Promise-to-pay can be captured and tracked.
- Remittance advice can be ingested and linked.
- Payments can be matched and high-confidence matches auto-applied.
- Exceptions route into typed queues with playbooks.
- Sensitive actions require approval.
- All actions are audit logged.
- DSO movement can be measured for pilot accounts.

> Still intentionally open: provider-specific writeback behavior, pilot-specific hierarchy overrides, KPI instrumentation detail, and exact connector mappings should remain in downstream engineering and onboarding specs rather than being hardcoded here.
