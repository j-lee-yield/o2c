# Build Capability Reference

## Multichannel Personalized Follow-Up Status

Last reviewed: 2026-04-19

Question this answers:
- Can the current build study aggregated AR data and draft personalized follow-up messages for email and/or SMS?
- Can the same approach support a future AI voice agent for personalized call follow-ups?

Short answer:
- Partially, yes.

Current state:
- The build can assemble a shared outreach context from real account data and generate personalized outputs for `email`, `sms`, and a future `voice_agent` flow from that same context.
- The context bundle currently includes account/contact, invoices and aging, recent communication history, recent payments, remittances, deductions/exceptions, promise-to-pay, and stored learning signals/preferences.
- The same service then renders:
  - email draft output
  - SMS draft variants
  - voice-agent handoff/context payload

What is implemented today:
- Shared outreach context generation:
  - `packages/workflows/src/outreach-intelligence.ts`
  - `packages/database/src/client/outreach-intelligence-store.ts`
- Email draft generation:
  - `packages/workflows/src/outreach-intelligence.ts`
- SMS draft generation:
  - `packages/workflows/src/outreach-intelligence.ts`
- Voice-agent context / brief generation:
  - `packages/workflows/src/outreach-intelligence.ts`
- Learning-layer preference and next-best-action scoring:
  - `packages/domain/src/modules/learning-layer/service.ts`
- Live Gmail sending path exists:
  - `packages/workflows/src/gmail-api-adapter.ts`

Important limitations:
- Personalization is currently deterministic and rule-driven, not a general LLM that studies the full tenant corpus end-to-end.
- Retrieved communication history is currently centered on email thread history, not a fully unified live cross-channel history layer.
- SMS and call are modeled in the learning layer, but are disabled by default in recommendation policy:
  - `packages/domain/src/modules/learning-layer/service.ts`
- SMS provider support is still stubbed, not production-complete:
  - `packages/workflows/src/communication-providers.ts`
- Voice is currently a safe context/handoff pattern, not a production autonomous voice collector.

Operational summary:
- `email`: closest to real / production path exists
- `sms`: personalized draft generation exists; live sending is not production-complete
- `voice`: personalized context and handoff exist; autonomous call follow-up is not production-complete

Why this still matters:
- The architecture already supports the same core approach across email, SMS, and future voice:
  - one shared outreach context
  - one safety/policy evaluation layer
  - channel-specific rendering on top

Verified test coverage at time of review:
- `apps/api/src/outreach-intelligence.test.ts`
- `packages/workflows/src/outreach-intelligence.test.ts`
- `apps/api/src/control-center.test.ts`
- `packages/workflows/src/control-center.test.ts`

Verified result at time of review:
- All targeted tests above passed on 2026-04-19.

Suggested reuse prompt for future checks:
- "Use `docs/build_capability_reference.md` first, then only verify the referenced files if something may have changed."
