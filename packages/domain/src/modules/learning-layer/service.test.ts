import { describe, expect, it } from "vitest";

import { createChannelBehaviorProfile } from "./communications.js";
import {
  buildAccountWorkspaceNextBestActionHook,
  buildCollectionsQueueNextBestActionHook,
  deriveCashApplicationLearningBehavior,
  DeterministicBehaviorProfileUpdateService,
  DeterministicLearningEventIngestionService,
  DeterministicNextBestActionScoringService,
  DeterministicOperatorFeedbackCaptureService,
  recordOperatorFeedback,
} from "./service.js";

describe("learning layer foundation", () => {
  const events = new DeterministicLearningEventIngestionService();
  const profiles = new DeterministicBehaviorProfileUpdateService();
  const scoring = new DeterministicNextBestActionScoringService();
  const feedbackCapture = new DeterministicOperatorFeedbackCaptureService();

  it("builds explainable account and contact profiles from normalized events", () => {
    const learningEvents = [
      events.ingest({
        id: "event-1",
        tenantId: "tenant-acme",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        occurredAt: "2026-03-30T08:00:00.000Z",
        sourceSystem: "collections",
        eventType: "email_sent",
        channel: "email",
        provider: "internal",
        direction: "outbound",
        intentType: "reminder",
        communicationStatus: "sent",
      }),
      events.ingest({
        id: "event-2",
        tenantId: "tenant-acme",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        occurredAt: "2026-03-30T10:00:00.000Z",
        sourceSystem: "email_provider",
        eventType: "email_replied",
        channel: "email",
        provider: "internal",
        direction: "inbound",
        intentType: "reminder",
        communicationStatus: "replied",
        payload: { responseLatencyHours: 2 },
      }),
      events.ingest({
        id: "event-3",
        tenantId: "tenant-acme",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        occurredAt: "2026-03-30T12:00:00.000Z",
        sourceSystem: "collections",
        eventType: "payment_outcome_after_communication",
        channel: "email",
        provider: "internal",
        direction: "inbound",
        intentType: "reminder",
        payload: { paymentReceived: true },
      }),
      events.ingest({
        id: "event-4",
        tenantId: "tenant-acme",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        occurredAt: "2026-03-31T08:00:00.000Z",
        sourceSystem: "sms_provider",
        eventType: "sms_opt_out_received",
        channel: "sms",
        provider: "twilio",
        direction: "inbound",
        intentType: "reminder",
        payload: { optOutReceived: true },
      }),
    ];
    const feedback = [
      recordOperatorFeedback({
        id: "feedback-1",
        tenantId: "tenant-acme",
        feedbackType: "override",
        targetType: "next_best_action_score",
        targetId: "score-1",
        occurredAt: "2026-03-31T09:00:00.000Z",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        reasonCode: "operator_prefers_email",
        appliesToFutureScoring: true,
        preservesSafetyRules: true,
        afterPayload: { preferredChannel: "email" },
      }),
    ];

    const accountProfile = profiles.updateAccountProfile({
      profileId: "account-profile-1",
      tenantId: "tenant-acme",
      scope: "billing_account",
      scopeId: "billing-1",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      events: learningEvents,
      feedback,
      computedAt: "2026-03-31T10:00:00.000Z",
    });
    const contactProfile = profiles.updateContactProfile({
      profileId: "contact-profile-1",
      tenantId: "tenant-acme",
      contactId: "contact-1",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      verificationSnapshot: {
        emailVerified: true,
        smsNumberVerified: true,
        phoneNumberVerified: false,
      },
      events: learningEvents,
      feedback,
      computedAt: "2026-03-31T10:00:00.000Z",
    });

    expect(accountProfile.tenantId).toBe("tenant-acme");
    expect(accountProfile.preferredChannel).toBe("email");
    expect(accountProfile.safetyFlags.doNotSms).toBe(true);
    expect(accountProfile.metricsByChannel.email?.responseRate).toBeGreaterThan(0);
    expect(accountProfile.explanation.some((reason) => reason.code === "operator_override_applied")).toBe(true);

    expect(contactProfile.preferredChannel).toBe("email");
    expect(contactProfile.verificationSnapshot.emailVerified).toBe(true);
    expect(contactProfile.evidenceSummary.feedbackCount).toBe(1);
  });

  it("keeps hard safety blocks above learned recommendations", () => {
    const accountProfile = profiles.updateAccountProfile({
      profileId: "account-profile-2",
      scope: "billing_account",
      scopeId: "billing-2",
      parentAccountId: "parent-2",
      billingAccountId: "billing-2",
      computedAt: "2026-03-31T10:00:00.000Z",
      events: [
        events.ingest({
          id: "event-10",
          parentAccountId: "parent-2",
          billingAccountId: "billing-2",
          occurredAt: "2026-03-31T08:00:00.000Z",
          sourceSystem: "collections",
          eventType: "sms_sent",
          channel: "sms",
          provider: "twilio",
          direction: "outbound",
          intentType: "reminder",
        }),
        events.ingest({
          id: "event-11",
          parentAccountId: "parent-2",
          billingAccountId: "billing-2",
          occurredAt: "2026-03-31T08:05:00.000Z",
          sourceSystem: "sms_provider",
          eventType: "sms_replied",
          channel: "sms",
          provider: "twilio",
          direction: "inbound",
          intentType: "reminder",
        }),
      ],
      feedback: [],
    });

    const score = scoring.score({
      scoreId: "score-2",
      domain: "collections",
      parentAccountId: "parent-2",
      billingAccountId: "billing-2",
      candidateActions: [
        "send_sms_reminder",
        "send_email_grouped_reminder",
      ],
      hardSafetyBlocks: ["no_auto_send_to_unverified_contact"],
      requiresApproval: true,
      accountProfile,
      scoredAt: "2026-03-31T11:00:00.000Z",
    });

    expect(score.recommendedAction).toBe("hold_for_review");
    expect(score.score).toBe(0);
    expect(score.hardSafetyBlocks).toContain("no_auto_send_to_unverified_contact");
    expect(score.candidateScores.every((candidate) => candidate.blockedBySafety)).toBe(true);
  });

  it("prefers resend bundles for high-doc-requirement customers", () => {
    const score = scoring.score({
      scoreId: "score-docs",
      domain: "collections",
      parentAccountId: "parent-docs",
      billingAccountId: "billing-docs",
      candidateActions: [
        "send_email_grouped_reminder",
        "send_email_resend_bundle",
        "request_remittance_via_email",
        "hold_for_review",
      ],
      accountProfile: profiles.updateAccountProfile({
        profileId: "profile-docs",
        scope: "billing_account",
        scopeId: "billing-docs",
        parentAccountId: "parent-docs",
        billingAccountId: "billing-docs",
        computedAt: "2026-03-31T10:00:00.000Z",
        events: [],
      }),
      channelBehaviorProfiles: [
        createChannelBehaviorProfile({
          id: "channel-docs-email",
          ownerType: "account",
          ownerId: "billing-docs",
          parentAccountId: "parent-docs",
          billingAccountId: "billing-docs",
          channel: "email",
          responseRate: 0.55,
          paymentConversionRate: 0.42,
          ptpCaptureRate: 0.1,
          ptpKeptRate: 0.1,
          wrongContactRate: 0.05,
          docRequestRate: 0.7,
          optOutRate: 0,
          connectRate: 0,
          voicemailRate: 0,
          rightPartyContactRate: 0.8,
          lastComputedAt: "2026-03-31T10:00:00.000Z",
          evidenceCount: 10,
          bestForIntent: { resend_documents: true },
        }),
      ],
      paymentBehaviorSnapshot: {
        highDocumentRequirement: true,
        documentRequirementRate: 0.75,
        resendBeforePayLikely: true,
      },
      invoiceStates: ["matched_to_erp"],
      invoiceCount: 3,
      scoredAt: "2026-03-31T11:00:00.000Z",
    });

    expect(score.recommendedAction).toBe("send_email_resend_bundle");
    expect(score.candidateScores[0]?.reasonSummary).toContain("supporting documents");
  });

  it("leans toward grouped email for centralized payer customers", () => {
    const score = scoring.score({
      scoreId: "score-centralized",
      domain: "collections",
      parentAccountId: "parent-centralized",
      billingAccountId: "billing-centralized",
      candidateActions: [
        "send_email_grouped_reminder",
        "send_email_invoice_level_reminder",
        "request_remittance_via_email",
        "hold_for_review",
      ],
      accountProfile: profiles.updateAccountProfile({
        profileId: "profile-centralized",
        scope: "billing_account",
        scopeId: "billing-centralized",
        parentAccountId: "parent-centralized",
        billingAccountId: "billing-centralized",
        computedAt: "2026-03-31T10:00:00.000Z",
        events: [],
      }),
      paymentBehaviorSnapshot: {
        centralizedPayer: true,
        centralizedPayerConfidence: 0.9,
        parentPaysForChildren: true,
      },
      invoiceStates: ["matched_to_erp", "matched_to_erp"],
      invoiceCount: 2,
      scoredAt: "2026-03-31T11:00:00.000Z",
    });

    expect(score.recommendedAction).toBe("send_email_grouped_reminder");
    expect(score.candidateScores[0]?.reasonSummary).toContain("centralized payer");
  });

  it("avoids PTP follow-up when the customer is unreliable on promises", () => {
    const score = scoring.score({
      scoreId: "score-ptp",
      domain: "collections",
      parentAccountId: "parent-ptp",
      billingAccountId: "billing-ptp",
      candidateActions: [
        "follow_up_ptp_via_email",
        "hold_for_review",
        "escalate_to_owner",
      ],
      accountProfile: profiles.updateAccountProfile({
        profileId: "profile-ptp",
        scope: "billing_account",
        scopeId: "billing-ptp",
        parentAccountId: "parent-ptp",
        billingAccountId: "billing-ptp",
        computedAt: "2026-03-31T10:00:00.000Z",
        events: [],
      }),
      paymentBehaviorSnapshot: {
        unreliablePromiseToPay: true,
        ptpKeptRate: 0.2,
      },
      invoiceStates: ["matched_to_erp"],
      scoredAt: "2026-03-31T11:00:00.000Z",
    });

    expect(score.recommendedAction).toBe("hold_for_review");
    expect(
      score.candidateScores.find((candidate) => candidate.action === "follow_up_ptp_via_email")?.reasonSummary,
    ).toContain("Promise-to-pay");
  });

  it("routes high wrong-contact accounts toward exceptions instead of fresh outreach", () => {
    const score = scoring.score({
      scoreId: "score-wrong-contact",
      domain: "collections",
      parentAccountId: "parent-wrong-contact",
      billingAccountId: "billing-wrong-contact",
      candidateActions: [
        "send_email_grouped_reminder",
        "send_sms_reminder",
        "place_collection_call",
        "route_to_exception",
        "hold_for_review",
      ],
      accountProfile: profiles.updateAccountProfile({
        profileId: "profile-wrong-contact",
        scope: "billing_account",
        scopeId: "billing-wrong-contact",
        parentAccountId: "parent-wrong-contact",
        billingAccountId: "billing-wrong-contact",
        computedAt: "2026-03-31T10:00:00.000Z",
        events: [],
      }),
      channelBehaviorProfiles: [
        createChannelBehaviorProfile({
          id: "channel-wrong-sms",
          ownerType: "account",
          ownerId: "billing-wrong-contact",
          parentAccountId: "parent-wrong-contact",
          billingAccountId: "billing-wrong-contact",
          channel: "sms",
          responseRate: 0.1,
          paymentConversionRate: 0,
          ptpCaptureRate: 0,
          ptpKeptRate: 0,
          wrongContactRate: 0.8,
          docRequestRate: 0.1,
          optOutRate: 0,
          connectRate: 0,
          voicemailRate: 0,
          rightPartyContactRate: 0.1,
          lastComputedAt: "2026-03-31T10:00:00.000Z",
          evidenceCount: 8,
        }),
      ],
      exceptionStates: ["triaged"],
      invoiceStates: ["matched_to_erp"],
      scoredAt: "2026-03-31T11:00:00.000Z",
    });

    expect(score.recommendedAction).toBe("route_to_exception");
    expect(score.candidateScores[0]?.reasonSummary).toContain("active exception");
  });

  it("can recommend SMS later when policy allows and the contact strongly prefers it", () => {
    const contactProfile = profiles.updateContactProfile({
      profileId: "contact-sms",
      contactId: "contact-sms",
      parentAccountId: "parent-sms",
      billingAccountId: "billing-sms",
      verificationSnapshot: {
        emailVerified: true,
        smsNumberVerified: true,
        phoneNumberVerified: true,
      },
      computedAt: "2026-03-31T10:00:00.000Z",
      events: [],
      feedback: [
        recordOperatorFeedback({
          id: "feedback-sms",
          feedbackType: "override",
          targetType: "contact_behavior_profile",
          targetId: "contact-sms",
          occurredAt: "2026-03-31T09:00:00.000Z",
          reasonCode: "sms_contact_preference",
          appliesToFutureScoring: true,
          preservesSafetyRules: true,
          afterPayload: { preferredChannel: "sms" },
        }),
      ],
    });
    const score = scoring.score({
      scoreId: "score-sms",
      domain: "collections",
      parentAccountId: "parent-sms",
      billingAccountId: "billing-sms",
      contactId: "contact-sms",
      candidateActions: [
        "send_email_grouped_reminder",
        "send_sms_reminder",
        "hold_for_review",
      ],
      contactProfile,
      channelBehaviorProfiles: [
        createChannelBehaviorProfile({
          id: "channel-sms-contact",
          ownerType: "contact",
          ownerId: "contact-sms",
          parentAccountId: "parent-sms",
          billingAccountId: "billing-sms",
          contactId: "contact-sms",
          channel: "sms",
          responseRate: 0.85,
          paymentConversionRate: 0.6,
          ptpCaptureRate: 0.2,
          ptpKeptRate: 0.2,
          wrongContactRate: 0,
          docRequestRate: 0.05,
          optOutRate: 0,
          connectRate: 0,
          voicemailRate: 0,
          rightPartyContactRate: 0.95,
          lastComputedAt: "2026-03-31T10:00:00.000Z",
          evidenceCount: 10,
          bestForIntent: { reminder: true },
        }),
      ],
      invoiceStates: ["matched_to_erp"],
      scoredAt: "2026-03-31T11:00:00.000Z",
      policy: {
        channelAvailability: {
          email: true,
          sms: true,
          call: false,
        },
      },
    });

    expect(score.recommendedAction).toBe("send_sms_reminder");
    expect(score.recommendedChannel).toBe("sms");
    expect(score.recommendedReasonSummary).toContain("preferred channel");
  });

  it("blocks collection calls for a voice-disallowed strategic account and exposes queue/workspace hooks", () => {
    const accountProfile = profiles.updateAccountProfile({
      profileId: "profile-strategic-voice",
      scope: "billing_account",
      scopeId: "billing-strategic-voice",
      parentAccountId: "parent-strategic-voice",
      billingAccountId: "billing-strategic-voice",
      computedAt: "2026-03-31T10:00:00.000Z",
      events: [],
      feedback: [
        recordOperatorFeedback({
          id: "feedback-voice",
          feedbackType: "override",
          targetType: "account_behavior_profile",
          targetId: "profile-strategic-voice",
          occurredAt: "2026-03-31T09:00:00.000Z",
          reasonCode: "voice_agent_disallowed",
          appliesToFutureScoring: true,
          preservesSafetyRules: true,
          afterPayload: { voiceAgentDisallowed: true },
        }),
      ],
    });
    const score = scoring.score({
      scoreId: "score-strategic-voice",
      domain: "collections",
      parentAccountId: "parent-strategic-voice",
      billingAccountId: "billing-strategic-voice",
      accountTier: "strategic",
      candidateActions: [
        "place_collection_call",
        "escalate_to_owner",
        "hold_for_review",
      ],
      accountProfile,
      invoiceStates: ["matched_to_erp"],
      scoredAt: "2026-03-31T11:00:00.000Z",
      policy: {
        channelAvailability: {
          email: true,
          sms: false,
          call: true,
        },
      },
    });

    const queueHook = buildCollectionsQueueNextBestActionHook(score);
    const workspaceHook = buildAccountWorkspaceNextBestActionHook({
      score,
      accountProfile,
      paymentBehaviorSnapshot: {
        centralizedPayer: true,
      },
    });

    expect(score.candidateScores.find((candidate) => candidate.action === "place_collection_call")?.blockedBySafety).toBe(true);
    expect(score.recommendedAction).toBe("escalate_to_owner");
    expect(queueHook.reasonSummary).toBe(score.recommendedReasonSummary);
    expect(workspaceHook.callReadiness).toBe("manual_only");
    expect(workspaceHook.paymentBehaviorSummary[0]).toContain("Centralized payer");
  });

  it("emits normalized learning events for every supported operator feedback type", () => {
    const cases = [
      ["contact_override", "operator_contact_overridden"],
      ["message_edit", "operator_message_edited"],
      ["match_rejected", "operator_match_rejected"],
      ["match_corrected", "operator_match_corrected"],
      ["exception_retyped", "operator_exception_retyped"],
      ["doc_bundle_changed", "operator_doc_bundle_changed"],
      ["routing_changed", "operator_routing_changed"],
      ["ptp_reclassified", "operator_ptp_reclassified"],
      ["resend_blocked", "operator_resend_blocked"],
      ["approval_rejected", "operator_approval_rejected"],
    ] as const;

    for (const [feedbackType, eventType] of cases) {
      const result = feedbackCapture.capture({
        id: `feedback-${feedbackType}`,
        tenantId: "tenant-acme",
        feedbackType,
        targetType:
          feedbackType === "contact_override"
            ? "contact"
            : feedbackType === "match_rejected" || feedbackType === "match_corrected"
              ? "payment_match"
              : feedbackType === "exception_retyped"
                ? "exception"
                : feedbackType === "doc_bundle_changed"
                  ? "document_bundle"
                  : feedbackType === "routing_changed"
                    ? "routing_decision"
                    : feedbackType === "ptp_reclassified"
                      ? "promise_to_pay"
                      : feedbackType === "resend_blocked"
                        ? "resend_decision"
                        : feedbackType === "approval_rejected"
                          ? "approval_request"
                          : "message",
        targetId: `target-${feedbackType}`,
        occurredAt: "2026-03-31T12:00:00.000Z",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        contactId: "contact-1",
        reasonCode: `reason-${feedbackType}`,
        appliesToFutureScoring: true,
        preservesSafetyRules: true,
        beforePayload: { channel: "email" },
        afterPayload: { channel: "email", invoiceIds: ["invoice-1"] },
      });

      expect(result.feedback.feedbackType).toBe(feedbackType);
      expect(result.emittedEvents[0]?.eventType).toBe(eventType);
      expect(result.emittedEvents[0]?.relatedEntityType).toBe(result.feedback.targetType);
      expect(result.emittedEvents[0]?.payload.correctedValue).toEqual(result.feedback.afterPayload);
    }
  });

  it("derives conservative cash-application behavior modifiers from future-safe supervision", () => {
    const learnedBehavior = deriveCashApplicationLearningBehavior({
      feedback: [
        recordOperatorFeedback({
          id: "feedback-cash-1",
          feedbackType: "match_corrected",
          targetType: "payment_match",
          targetId: "payment-match-1",
          occurredAt: "2026-03-31T12:00:00.000Z",
          reasonCode: "cash_application_pattern_confirmed",
          appliesToFutureScoring: true,
          preservesSafetyRules: true,
          afterPayload: {
            expectedPayerName: "Metro Retail Group Treasury",
            expectedPayerBankAccount: "0917-AR-9981",
            parentPaysForChildren: true,
            remittanceTiming: "after_payment",
            invoiceIds: ["inv-1", "inv-2"],
            varianceType: "bank_charge",
            varianceCents: 500,
            referenceQualityScore: 0.4,
          },
        }),
        recordOperatorFeedback({
          id: "feedback-cash-2",
          feedbackType: "match_corrected",
          targetType: "payment_match",
          targetId: "payment-match-2",
          occurredAt: "2026-03-31T12:05:00.000Z",
          reasonCode: "cash_application_pattern_confirmed",
          appliesToFutureScoring: true,
          preservesSafetyRules: true,
          afterPayload: {
            expectedPayerName: "Metro Retail Group Treasury",
            expectedPayerBankAccount: "0917-AR-9981",
            parentPaysForChildren: true,
            remittanceTiming: "after_payment",
            invoiceIds: ["inv-3", "inv-4"],
            varianceType: "bank_charge",
            varianceCents: 500,
            referenceQualityScore: 0.5,
          },
        }),
      ],
    });

    expect(learnedBehavior.expectedPayerNames).toContain("Metro Retail Group Treasury");
    expect(learnedBehavior.expectedPayerBankAccounts).toContain("0917-AR-9981");
    expect(learnedBehavior.parentPaysForChildren).toBe(true);
    expect(learnedBehavior.parentPayerProbability).toBe(1);
    expect(learnedBehavior.remittanceUsuallyArrivesAfterPayment).toBe(true);
    expect(learnedBehavior.typicalBundleSize).toBe(2);
    expect(learnedBehavior.commonBankChargeVarianceCents).toBe(500);
    expect(learnedBehavior.referenceQualityScore).toBe(0.45);
    expect(learnedBehavior.explanation[0]?.summary).toContain("payer identity hints");
  });

  it("updates contact and account behavior profiles from explainable operator supervision where appropriate", () => {
    const result = feedbackCapture.capture({
      id: "feedback-contact-override",
      tenantId: "tenant-acme",
      feedbackType: "contact_override",
      targetType: "contact",
      targetId: "contact-override-target",
      occurredAt: "2026-03-31T12:15:00.000Z",
      parentAccountId: "parent-1",
      billingAccountId: "billing-1",
      contactId: "contact-1",
      reasonCode: "verified_sms_contact",
      appliesToFutureScoring: true,
      preservesSafetyRules: true,
      beforePayload: {
        preferredChannel: "email",
        smsNumberVerified: false,
      },
      afterPayload: {
        preferredChannel: "sms",
        smsNumberVerified: true,
      },
      recomputeAccountProfile: {
        profileId: "account-profile-feedback",
        scope: "billing_account",
        scopeId: "billing-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
      },
      recomputeContactProfile: {
        profileId: "contact-profile-feedback",
        contactId: "contact-1",
        parentAccountId: "parent-1",
        billingAccountId: "billing-1",
        verificationSnapshot: {
          emailVerified: true,
          smsNumberVerified: false,
          phoneNumberVerified: false,
        },
      },
    });

    expect(result.updatedAccountProfile?.preferredChannel).toBe("sms");
    expect(result.updatedContactProfile?.preferredChannel).toBe("sms");
    expect(result.updatedContactProfile?.verificationSnapshot.smsNumberVerified).toBe(true);
    expect(result.updatedContactProfile?.evidenceSummary.feedbackCount).toBe(1);
  });

  it("updates document-request behavior when an operator changes the resend bundle", () => {
    const result = feedbackCapture.capture({
      id: "feedback-docs",
      feedbackType: "doc_bundle_changed",
      targetType: "document_bundle",
      targetId: "bundle-1",
      occurredAt: "2026-03-31T12:30:00.000Z",
      parentAccountId: "parent-docs",
      billingAccountId: "billing-docs",
      contactId: "contact-docs",
      reasonCode: "customer_requested_more_docs",
      appliesToFutureScoring: true,
      preservesSafetyRules: true,
      beforePayload: {
        channel: "email",
        invoiceIds: ["invoice-doc-1"],
      },
      afterPayload: {
        channel: "email",
        invoiceIds: ["invoice-doc-1"],
        docsRequested: true,
      },
      recomputeAccountProfile: {
        profileId: "account-profile-docs",
        scope: "billing_account",
        scopeId: "billing-docs",
        parentAccountId: "parent-docs",
        billingAccountId: "billing-docs",
      },
    });

    expect(result.emittedEvents[0]?.payload.docsRequested).toBe(true);
    expect(result.updatedAccountProfile?.metricsByChannel.email?.docRequests).toBe(1);
    expect(result.updatedAccountProfile?.evidenceSummary.eventCount).toBe(1);
  });
});
