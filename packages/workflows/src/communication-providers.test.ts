import { describe, expect, it } from "vitest";
import { SafeCommunicationAttemptFactory } from "@o2c/domain";
import {
  CommunicationProviderEventIngestionService,
  CommunicationProviderExecutor,
  createDefaultCommunicationProviderRegistry,
  DefaultCommunicationExecutionHooks,
  ElevenLabsVoiceStubAdapter,
  InternalEmailStubAdapter,
  RetellVoiceStubAdapter,
  TwilioSmsStubAdapter,
  TwilioVoiceStubAdapter,
  VapiVoiceStubAdapter,
} from "./communication-providers.js";

describe("communication provider abstraction", () => {
  const attempts = new SafeCommunicationAttemptFactory();

  it("applies opt-out, allowed-hours, and approval-gated execution hooks before provider send", async () => {
    const executor = new CommunicationProviderExecutor();
    const hooks = new DefaultCommunicationExecutionHooks({
      requireApprovalFor: ["call"],
      allowedHours: {
        sms: { startHour: 8, endHour: 18 },
        call: { startHour: 8, endHour: 18 },
      },
    });

    const smsAttempt = attempts.create({
      attemptId: "attempt-sms-opt-out",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "sms",
      provider: "twilio",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        phoneNumber: "+639171234567",
        verified: true,
      },
      createdAt: "2026-03-31T06:00:00.000Z",
      metadata: {
        optOutExists: true,
      },
    });
    const callAttempt = attempts.create({
      attemptId: "attempt-call-approval",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "call",
      provider: "vapi",
      direction: "outbound",
      intentType: "escalation",
      recipient: {
        phoneNumber: "+639171234567",
        verified: true,
      },
      createdAt: "2026-03-31T10:00:00.000Z",
    });

    const smsResult = await executor.executeOutbound({
      attempt: smsAttempt,
      occurredAt: "2026-03-31T06:00:00.000Z",
      hooks,
      smsProvider: new TwilioSmsStubAdapter(),
    });
    const callResult = await executor.executeOutbound({
      attempt: callAttempt,
      occurredAt: "2026-03-31T10:00:00.000Z",
      hooks,
      callProvider: new VapiVoiceStubAdapter(),
    });

    expect(smsResult.executed).toBe(false);
    expect(smsResult.blockedReasons).toEqual(
      expect.arrayContaining(["sms_opt_out", "outside_allowed_hours"]),
    );
    expect(callResult.executed).toBe(false);
    expect(callResult.blockedReasons).toContain("approval_required");
  });

  it("executes safe email through the internal email adapter", async () => {
    const executor = new CommunicationProviderExecutor();
    const hooks = new DefaultCommunicationExecutionHooks();
    const emailAttempt = attempts.create({
      attemptId: "attempt-email-safe",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        email: "ap@example.com",
        verified: true,
      },
      createdAt: "2026-03-31T10:00:00.000Z",
    });

    const result = await executor.executeOutbound({
      attempt: emailAttempt,
      occurredAt: "2026-03-31T10:00:00.000Z",
      hooks,
      emailProvider: new InternalEmailStubAdapter(),
    });

    expect(result.executed).toBe(true);
    expect(result.sendResult?.providerMessageId).toContain("internal-email");
  });

  it("supports draft, reply-thread, and reply-metadata operations for mailbox-backed email providers", async () => {
    const adapter = new InternalEmailStubAdapter();
    const emailAttempt = attempts.create({
      attemptId: "attempt-email-draft",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        email: "ap@example.com",
        verified: true,
      },
      createdAt: "2026-03-31T10:00:00.000Z",
    });

    const draft = await adapter.createDraft({ attempt: emailAttempt });
    const reply = await adapter.replyToThread({
      attempt: emailAttempt,
      providerThreadId: "internal-thread:abc",
      replyToProviderMessageId: "internal-message:abc",
    });
    const replyMetadata = await adapter.fetchReplyMetadata({
      providerMessageId: "internal-message:abc",
    });

    expect(draft.providerDraftId).toContain("draft");
    expect(reply.providerThreadId).toBe("internal-thread:abc");
    expect(replyMetadata[0]?.providerConversationId).toContain("conversation");
  });

  it("normalizes provider payloads into canonical outcomes and learning events for sms and voice", () => {
    const ingestion = new CommunicationProviderEventIngestionService();
    const smsAttempt = attempts.create({
      attemptId: "attempt-sms-normalize",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "sms",
      provider: "twilio",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        phoneNumber: "+639171234567",
        verified: true,
      },
      createdAt: "2026-03-31T10:00:00.000Z",
    });
    const callAttempt = attempts.create({
      attemptId: "attempt-call-normalize",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "call",
      provider: "retell",
      direction: "outbound",
      intentType: "escalation",
      recipient: {
        phoneNumber: "+639171234567",
        verified: true,
      },
      approvalRequestId: "approval-1",
      createdAt: "2026-03-31T10:00:00.000Z",
      metadata: {
        voiceAutomationMode: "manual_assist",
      },
    });

    const smsResult = ingestion.ingestSmsPayload({
      attempt: smsAttempt,
      normalizer: new TwilioSmsStubAdapter(),
      occurredAt: "2026-03-31T10:15:00.000Z",
      providerPayload: {
        delivered: true,
        replied: true,
        clicked: true,
        optOutReceived: true,
      },
    });
    const callResult = ingestion.ingestCallPayload({
      attempt: callAttempt,
      normalizer: new RetellVoiceStubAdapter(),
      occurredAt: "2026-03-31T10:20:00.000Z",
      providerPayload: {
        answered: true,
        disposition: "callback_requested",
        transcriptSummary: "Customer requested a callback after lunch.",
        transcriptSegments: [{ speaker: "customer", text: "Please call back after lunch." }],
        operatorReviewRequired: true,
      },
    });

    expect(smsResult.outcome.optOutReceived).toBe(true);
    expect(smsResult.learningEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["sms_delivered", "sms_replied", "sms_link_clicked", "sms_opt_out_received"]),
    );
    expect(callResult.outcome.transcriptSummary).toContain("callback");
    expect(callResult.learningEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["call_connected", "call_disposition_logged", "call_transcript_ingested", "callback_requested"]),
    );
  });

  it("keeps voice adapters transcript-ready and disposition-ready across future providers", async () => {
    const adapters = [
      new TwilioVoiceStubAdapter(),
      new VapiVoiceStubAdapter(),
      new RetellVoiceStubAdapter(),
      new ElevenLabsVoiceStubAdapter(),
    ];

    for (const adapter of adapters) {
      const outcome = await adapter.receiveTranscript({
        providerPayload: {
          communicationAttemptId: "attempt-voice-provider",
          occurredAt: "2026-03-31T10:30:00.000Z",
          answered: true,
          disposition: "connected",
          transcriptUri: "https://example.invalid/transcript",
          transcriptSummary: "Customer confirmed receipt of the reminder.",
          transcriptSegments: [{ speaker: "customer", text: "We received it." }],
          operatorReviewRequired: true,
        },
      });

      expect(outcome.transcriptUri).toContain("transcript");
      expect(outcome.transcriptSegments[0]?.text).toContain("received");
      expect(outcome.operatorReviewRequired).toBe(true);
    }
  });

  it("resolves provider bundles by channel and normalizes inbound envelopes through the registry", async () => {
    const registry = createDefaultCommunicationProviderRegistry();
    const executor = new CommunicationProviderExecutor();
    const ingestion = new CommunicationProviderEventIngestionService();
    const hooks = new DefaultCommunicationExecutionHooks();
    const attempt = attempts.create({
      attemptId: "attempt-email-registry",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "request_remittance",
      recipient: {
        email: "ap@example.com",
        verified: true,
      },
      createdAt: "2026-03-31T11:00:00.000Z",
    });

    const execution = await executor.executeOutboundWithRegistry({
      attempt,
      occurredAt: "2026-03-31T11:00:00.000Z",
      hooks,
      registry,
    });
    const result = ingestion.ingestInboundWithRegistry({
      attempt,
      registry,
      envelope: {
        channel: "email",
        provider: "internal",
        providerEventType: "delivered",
        communicationAttemptId: attempt.id,
        occurredAt: "2026-03-31T11:05:00.000Z",
        payload: {
          delivered: true,
        },
      },
    });
    const batch = ingestion.toNormalizedBatch({
      envelope: {
        channel: "email",
        provider: "internal",
        providerEventType: "delivered",
        communicationAttemptId: attempt.id,
        occurredAt: "2026-03-31T11:05:00.000Z",
        payload: {
          delivered: true,
        },
      },
      result,
    });

    expect(execution.executed).toBe(true);
    expect(result.outcome.communicationAttemptId).toBe(attempt.id);
    expect(batch.outcomes[0]?.channel).toBe("email");
    expect(batch.learningEventIds.length).toBeGreaterThan(0);
  });

  it("lists provider descriptors with email-complete and future sms/call readiness flags", () => {
    const registry = createDefaultCommunicationProviderRegistry();
    const descriptors = registry.listDescriptors();

    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "email",
          provider: "internal",
          maturity: "email_complete",
          allowsAutonomousNegotiation: false,
        }),
        expect.objectContaining({
          channel: "sms",
          provider: "twilio",
          maturity: "sms_ready",
        }),
        expect.objectContaining({
          channel: "call",
          provider: "vapi",
          maturity: "voice_ready",
          supportsTranscriptIngestion: true,
        }),
      ]),
    );
  });
});
