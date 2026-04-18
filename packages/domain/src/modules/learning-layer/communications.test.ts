import { describe, expect, it } from "vitest";

import {
  DeterministicCommunicationOutcomeNormalizationService,
  SafeCommunicationAttemptFactory,
  createCallOutcome,
  createEmailOutcome,
  createSmsOutcome,
} from "./communications.js";

describe("multi-channel communication abstraction", () => {
  const factory = new SafeCommunicationAttemptFactory();
  const normalization = new DeterministicCommunicationOutcomeNormalizationService();

  it("keeps email ready while blocking unsafe sms and call attempts", () => {
    const emailAttempt = factory.create({
      attemptId: "attempt-email-1",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        email: "ap@example.com",
        displayName: "AP Contact",
        verified: true,
      },
      invoiceIds: ["invoice-1"],
      subjectLine: "Reminder",
      bodyPreview: "Friendly reminder",
      createdAt: "2026-03-31T08:00:00.000Z",
    });
    const smsAttempt = factory.create({
      attemptId: "attempt-sms-1",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "sms",
      provider: "twilio",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        phoneNumber: "+639171234567",
        displayName: "AP Contact",
        verified: false,
      },
      invoiceIds: ["invoice-1"],
      bodyPreview: "SMS reminder",
      createdAt: "2026-03-31T08:05:00.000Z",
    });
    const callAttempt = factory.create({
      attemptId: "attempt-call-1",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "call",
      provider: "vapi",
      direction: "outbound",
      intentType: "escalation",
      recipient: {
        phoneNumber: "+639171234567",
        displayName: "AP Contact",
        verified: true,
      },
      invoiceIds: ["invoice-1"],
      createdAt: "2026-03-31T08:10:00.000Z",
      metadata: {
        voiceAutomationMode: "autonomous",
      },
    });

    expect(emailAttempt.status).toBe("queued");
    expect(smsAttempt.status).toBe("blocked");
    expect(smsAttempt.blockedReasons).toContain("unverified_number");
    expect(callAttempt.status).toBe("blocked");
    expect(callAttempt.blockedReasons).toContain("unsafe_voice_automation");
  });

  it("normalizes channel-specific outcomes into learning events", () => {
    const emailAttempt = factory.create({
      attemptId: "attempt-email-2",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        email: "ap@example.com",
        displayName: "AP Contact",
        verified: true,
      },
      invoiceIds: ["invoice-1"],
      createdAt: "2026-03-31T09:00:00.000Z",
    });
    const emailOutcome = createEmailOutcome({
      id: "email-outcome-1",
      communicationAttemptId: emailAttempt.id,
      occurredAt: "2026-03-31T09:30:00.000Z",
      delivered: true,
      opened: true,
      replied: true,
    });
    const smsOutcome = createSmsOutcome({
      id: "sms-outcome-1",
      communicationAttemptId: "attempt-sms-2",
      occurredAt: "2026-03-31T09:35:00.000Z",
      delivered: false,
      optOutReceived: true,
    });
    const callOutcome = createCallOutcome({
      id: "call-outcome-1",
      communicationAttemptId: "attempt-call-2",
      occurredAt: "2026-03-31T09:40:00.000Z",
      answered: true,
      disposition: "connected",
      transcriptSummary: "Customer answered and asked for callback after lunch.",
      operatorReviewRequired: true,
    });

    const emailEvents = normalization.normalizeEmailOutcome({
      attempt: emailAttempt,
      outcome: emailOutcome,
    });
    const smsEvents = normalization.normalizeSmsOutcome({
      attempt: {
        ...emailAttempt,
        id: "attempt-sms-2",
        channel: "sms",
        provider: "twilio",
      },
      outcome: smsOutcome,
    });
    const callEvents = normalization.normalizeCallOutcome({
      attempt: {
        ...emailAttempt,
        id: "attempt-call-2",
        channel: "call",
        provider: "retell",
        intentType: "escalation",
      },
      outcome: callOutcome,
    });

    expect(emailEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["email_delivered", "email_opened", "email_replied", "customer_response_received"]),
    );
    expect(smsEvents.map((event) => event.eventType)).toContain("sms_opt_out_received");
    expect(callEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["call_connected", "call_disposition_logged", "call_transcript_ingested"]),
    );
  });
});
