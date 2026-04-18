# AGENTS.md

## Project
Yield AROS / O2C MVP

AI order-to-cash platform for Philippine B2B suppliers.
Primary goals:
- reduce DSO
- improve cash application
- keep collections safe and auditable
- support future multi-channel workflows

## Source-of-truth docs
Always use these docs as the primary product and implementation specs:

- docs/yield_aros_canonical_prd.md
- docs/yield_aros_canonical_object_state_spec.md
- docs/yield_aros_codex_engineering_spec.md
- docs/yield_aros_learning_layer_multichannel_codex.md

Priority order when resolving ambiguity:
1. canonical object/state spec
2. codex engineering spec
3. learning layer codex spec
4. canonical PRD

If code assumptions conflict with these docs, follow the docs unless the user explicitly instructs otherwise.

## Implementation priorities
1. correctness of money movement and ledger-related logic
2. operational safety and approval gating
3. explainability and auditability
4. extensible integrations
5. polished operator UX

## Locked product rules
- ERP is source of truth for ledger objects
- billing account is the default collections routing level
- branch must always be preserved if known
- parent account is for visibility and centralized payer behavior
- disputed invoices must not be chased automatically
- no auto-send to unverified contacts
- no auto-apply under cross-entity ambiguity
- no silent ERP divergence
- typed exceptions are preferred over generic failures
- every automation action must be logged

## Learning layer rules
- email is MVP-complete
- architecture must be multi-channel-ready for email, SMS, and call
- provider integrations must be vendor-agnostic
- Twilio, Vapi, Retell, ElevenLabs must be treated as adapters, not core domain objects
- learned behavior must be explainable and reversible
- learned behavior must not override hard safety rules

## Coding rules
- prefer strongly typed domain models
- keep business rules in packages/domain
- keep provider-specific logic in packages/integrations
- keep thresholds configurable, not hardcoded
- add tests for every state machine and money-related workflow
- use idempotent writeback and sync patterns
- do not invent risky business rules silently
- choose safe defaults when unclear
- if a rule affects money, approvals, or customer communications, document assumptions inline

## Expected modules
- accounts
- contacts
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
- learning_layer

## Commands
Update these commands to match the actual repo:

- install: `pnpm install`
- dev: `pnpm dev`
- build: `pnpm build`
- test: `pnpm test`
- lint: `pnpm lint`
- typecheck: `pnpm typecheck`
- db migrate: `pnpm db:migrate`
- db seed: `pnpm db:seed`

## Pull request / change expectations
When implementing:
1. explain what files were changed
2. explain what assumptions were made
3. run relevant tests
4. list any TODOs for missing provider-specific details
5. identify any spec mismatches instead of glossing over them

## Review tasks
When asked to audit implementation, produce:
- fully implemented
- partially implemented
- missing
- incorrect or risky
- prioritized remediation plan

## Avoid
- hardcoding customer-specific logic into shared domain code
- weakening approval rules for convenience
- treating uploaded OCR output as ERP truth automatically
- auto-contacting newly discovered emails or numbers
- provider lock-in inside core domain objects