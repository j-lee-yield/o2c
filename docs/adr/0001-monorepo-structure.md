# ADR 0001: Monorepo Structure

## Status

Accepted

## Context

Sprint 1 needs a production-grade scaffold that allows multiple engineers to work independently on the MVP core: domain schema, workflows, routing, auth, audit, and seed data. The platform has strong coupling at the business-rule level but different runtime surfaces for HTTP APIs, background automation, and future integration adapters.

## Decision

Use a TypeScript monorepo with:

- `apps/*` for runtime composition roots.
- `packages/*` for domain and shared business modules.
- `tooling/*` for shared development configuration.
- `docs/adr` for architectural decisions.

`pnpm` manages workspaces and `turbo` orchestrates build, test, and typecheck tasks.

## Consequences

- Teams can ship against stable package interfaces with minimal merge contention.
- Domain rules stay independent from transport and persistence details.
- Sprint 2 can add adapters without collapsing boundaries.
- TODO(sprint-2): add infrastructure packages for persistence, messaging, and ERP sync adapters when requirements stabilize.
