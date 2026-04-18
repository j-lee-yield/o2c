# ADR 0002: Domain Boundaries

## Status

Accepted

## Context

The MVP needs auditable and conservative automation for collections and cash application. Business rules around billing account routing, invoice branch preservation, disputes, strategic accounts, and typed exceptions must remain consistent across API and worker runtimes.

## Decision

Separate the core into focused packages:

- `domain` defines entities, enums, value objects, and typed exceptions.
- `workflows` owns state machines and policy guards.
- `routing` owns customer hierarchy and routing decisions.
- `auth` owns principal, role, and permission models.
- `audit` owns audit event contracts and write interfaces.
- `contracts` owns DTOs crossing package or runtime boundaries.

Every automation-capable workflow accepts an audit logger dependency. Routing defaults to billing account. Invoice records preserve branch identity when available. Disputed invoices are excluded from automated chase flows by policy guard.

## Consequences

- Cross-cutting rules stay explicit and testable.
- Future persistence and transport layers can remain thin adapters.
- Typed exceptions can drive exception queues without leaking infrastructure concerns.
- TODO(sprint-2): formalize persistence ports and event bus contracts once infrastructure direction is chosen.
