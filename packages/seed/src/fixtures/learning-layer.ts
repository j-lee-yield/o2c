import {
  DeterministicCommunicationOutcomeNormalizationService,
  DeterministicBehaviorProfileUpdateService,
  DeterministicLearningEventIngestionService,
  DeterministicNextBestActionScoringService,
  SafeCommunicationAttemptFactory,
  createCallOutcome,
  createChannelBehaviorProfile,
  createEmailOutcome,
  createSmsOutcome,
  recordOperatorFeedback,
  type AccountBehaviorProfile,
  type CallOutcome,
  type ChannelBehaviorProfile,
  type CommunicationAttempt,
  type ContactBehaviorProfile,
  type EmailOutcome,
  type LearningEvent,
  type NextBestActionScore,
  type OperatorFeedback,
  type SmsOutcome,
} from "@o2c/domain";
import type { LearningDemoScenario } from "@o2c/contracts";

export interface LearningLayerSeedBundle {
  communicationAttempts: CommunicationAttempt[];
  channelBehaviorProfiles: ChannelBehaviorProfile[];
  emailOutcomes: EmailOutcome[];
  smsOutcomes: SmsOutcome[];
  callOutcomes: CallOutcome[];
  learningEvents: LearningEvent[];
  accountBehaviorProfiles: AccountBehaviorProfile[];
  contactBehaviorProfiles: ContactBehaviorProfile[];
  operatorFeedback: OperatorFeedback[];
  nextBestActionScores: NextBestActionScore[];
}

export function buildLearningLayerDemoScenarios(): LearningDemoScenario[] {
  return [
    {
      id: "billing_seed_1",
      accountName: "Metro Retail Group - Strategic Procurement",
      billingAccountId: "billing_seed_1",
      workspace: {
        accountPaymentBehaviorSummary: {
          summary: "Centralized payer usually settles grouped balances after document review.",
          sparseFallback: false,
        },
        preferredContactRecommendation: {
          contactName: "Roberto Lim",
          contactMethod: "roberto.lim@puregold.com.ph",
          reasonSummary: "Shared finance contact has the clearest response trail.",
          sparseFallback: false,
        },
        preferredChannelRecommendation: {
          channel: "email",
          reasonSummary: "Email is safest because SMS is blocked by opt-out history.",
          sparseFallback: false,
        },
        preferredSendTiming: {
          label: "Weekday mornings",
          reasonSummary: "Responses cluster in early business hours.",
          sparseFallback: false,
        },
        documentBundleRecommendation: {
          label: "Invoice + SOA + proof request",
          reasonSummary: "This account often asks for supporting documents before payment.",
          sparseFallback: false,
        },
        ptpReliabilityIndicator: {
          level: "medium",
          reasonSummary: "Promises are usable, but proof of payment usually arrives late.",
        },
        nextBestActionScore: {
          action: "hold_for_review",
          score: 0.2,
          channel: "email",
          reasonSummary: "Strategic controls keep the next step manual.",
          channelReasonSummaries: [
            { channel: "email", summary: "Email remains the safest approved path." },
            { channel: "sms", summary: "SMS is blocked by opt-out history." },
            { channel: "call", summary: "Voice needs explicit approval on strategic accounts." },
          ],
          rankedRecommendations: [
            {
              action: "hold_for_review",
              score: 0.2,
              channel: "email",
              blockedBySafety: false,
              reasonSummary: "Strategic controls keep the next step manual.",
            },
            {
              action: "send_email_grouped_reminder",
              score: 0.12,
              channel: "email",
              blockedBySafety: true,
              reasonSummary: "Approval-sensitive outreach should stay manual first.",
            },
          ],
          sparseFallback: false,
        },
      },
      collections: {
        preferredContactRecommendation: {
          contactName: "Roberto Lim",
          contactMethod: "roberto.lim@puregold.com.ph",
          reasonSummary: "Shared finance contact handles centralized payment releases.",
          sparseFallback: false,
        },
        preferredChannelRecommendation: {
          channel: "email",
          reasonSummary: "Email remains the approved first channel for this account.",
          sparseFallback: false,
        },
        preferredSendTiming: {
          label: "Weekday mornings",
          reasonSummary: "Best response window is still morning business hours.",
          sparseFallback: false,
        },
        documentBundleRecommendation: {
          label: "Grouped reminder with bundle",
          reasonSummary: "Grouped documents fit the centralized payer workflow.",
          sparseFallback: false,
        },
        ptpReliabilityIndicator: {
          level: "medium",
          reasonSummary: "Follow up on promises, but keep proof checks manual.",
        },
        nextBestActionScore: {
          action: "hold_for_review",
          score: 0.2,
          channel: "email",
          reasonSummary: "Approval-sensitive outreach stays manual.",
          channelReasonSummaries: [
            { channel: "email", summary: "Email is preferred when approval clears." },
            { channel: "sms", summary: "SMS should stay off because learning is blocked by opt-out." },
            { channel: "call", summary: "Call can happen later, but only on a reviewed path." },
          ],
          rankedRecommendations: [
            {
              action: "hold_for_review",
              score: 0.2,
              channel: "email",
              blockedBySafety: false,
              reasonSummary: "Approval-sensitive outreach stays manual.",
            },
            {
              action: "send_email_grouped_reminder",
              score: 0.11,
              channel: "email",
              blockedBySafety: true,
              reasonSummary: "Fresh outreach should wait for reviewed approval on this account.",
            },
          ],
          sparseFallback: false,
        },
      },
      cashApplication: {
        matchConfidenceExplanation: {
          label: "Review suggested",
          reasonSummary: "Centralized payer history helps, but strategic approval still governs release.",
        },
      },
      exception: {
        exceptionPlaybookRecommendation: {
          playbookLabel: "Dispute hold",
          nextStep: "Route to dispute owner",
          reasonSummary: "Keep collections paused until the dispute owner clears the account.",
        },
      },
    },
    {
      id: "billing_sparse_demo",
      accountName: "Northpoint Wholesale - Manila",
      billingAccountId: "billing_sparse_demo",
      workspace: {
        accountPaymentBehaviorSummary: {
          summary: "Payment history is sparse, so the console stays on safe manual defaults.",
          sparseFallback: true,
        },
        preferredContactRecommendation: {
          contactName: "Treasury team",
          reasonSummary: "Use the verified treasury route until a better payer pattern is learned.",
          sparseFallback: true,
        },
        preferredChannelRecommendation: {
          channel: "email",
          reasonSummary: "Email-first fallback stays safest when learned channel history is thin.",
          sparseFallback: true,
        },
        preferredSendTiming: {
          label: "Business hours",
          reasonSummary: "Default send windows apply until enough response timing is learned.",
          sparseFallback: true,
        },
        documentBundleRecommendation: {
          label: "Invoice only",
          reasonSummary: "Keep the bundle light until the account requests more documents.",
          sparseFallback: true,
        },
        ptpReliabilityIndicator: {
          level: "unknown",
          reasonSummary: "Not enough promise history yet.",
        },
        nextBestActionScore: {
          action: "hold_for_review",
          score: 0,
          channel: "email",
          reasonSummary: "Sparse learning data keeps the workflow conservative.",
          channelReasonSummaries: [
            { channel: "email", summary: "Email-first fallback is available." },
            { channel: "sms", summary: "SMS remains disabled until contact and policy are clearer." },
            { channel: "call", summary: "Call should stay manual until a right-party pattern is known." },
          ],
          rankedRecommendations: [
            {
              action: "hold_for_review",
              score: 0,
              channel: "email",
              blockedBySafety: false,
              reasonSummary: "Sparse learning data keeps the workflow conservative.",
            },
          ],
          sparseFallback: true,
        },
      },
      collections: {
        preferredContactRecommendation: {
          contactName: "Treasury team",
          reasonSummary: "Treasury is the safest fallback contact while payer identity is unresolved.",
          sparseFallback: true,
        },
        preferredChannelRecommendation: {
          channel: "email",
          reasonSummary: "Email fallback avoids risky first-contact escalation.",
          sparseFallback: true,
        },
        preferredSendTiming: {
          label: "Business hours",
          reasonSummary: "Use the default send window until the account shows a stronger timing pattern.",
          sparseFallback: true,
        },
        documentBundleRecommendation: {
          label: "Invoice only",
          reasonSummary: "Wait for a document request before expanding the bundle.",
          sparseFallback: true,
        },
        ptpReliabilityIndicator: {
          level: "unknown",
          reasonSummary: "No reliable promise-to-pay pattern yet.",
        },
        nextBestActionScore: {
          action: "hold_for_review",
          score: 0,
          channel: "email",
          reasonSummary: "Unknown payer risk outweighs sparse learned signals.",
          channelReasonSummaries: [
            { channel: "email", summary: "Email fallback is safest." },
            { channel: "sms", summary: "SMS is not trusted yet for this account." },
            { channel: "call", summary: "Manual treasury outreach is safer than voice automation." },
          ],
          rankedRecommendations: [
            {
              action: "hold_for_review",
              score: 0,
              channel: "email",
              blockedBySafety: false,
              reasonSummary: "Unknown payer risk outweighs sparse learned signals.",
            },
          ],
          sparseFallback: true,
        },
      },
      cashApplication: {
        matchConfidenceExplanation: {
          label: "Manual review",
          reasonSummary: "Learning is sparse, so confidence relies on explicit payer proof instead.",
        },
      },
      exception: {
        exceptionPlaybookRecommendation: {
          playbookLabel: "Unknown payer",
          nextStep: "Collect payer proof",
          reasonSummary: "Evidence collection is safer than guessing the billing account.",
        },
      },
    },
  ];
}

export function buildLearningLayerSeedBundle(): LearningLayerSeedBundle {
  const events = new DeterministicLearningEventIngestionService();
  const profiles = new DeterministicBehaviorProfileUpdateService();
  const scoring = new DeterministicNextBestActionScoringService();
  const attempts = new SafeCommunicationAttemptFactory();
  const normalization = new DeterministicCommunicationOutcomeNormalizationService();

  const seededEvents = [
    events.ingest({
      id: "learning_event_seed_1",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      occurredAt: "2026-03-26T08:00:00.000Z",
      sourceSystem: "collections",
      eventType: "email_sent",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      communicationStatus: "sent",
      invoiceIds: ["invoice_seed_1"],
    }),
    events.ingest({
      id: "learning_event_seed_2",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      occurredAt: "2026-03-26T10:00:00.000Z",
      sourceSystem: "email_provider",
      eventType: "email_replied",
      channel: "email",
      provider: "internal",
      direction: "inbound",
      intentType: "reminder",
      communicationStatus: "replied",
      invoiceIds: ["invoice_seed_1"],
      payload: { responseLatencyHours: 2 },
    }),
    events.ingest({
      id: "learning_event_seed_3",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      occurredAt: "2026-03-26T11:00:00.000Z",
      sourceSystem: "collections",
      eventType: "payment_outcome_after_communication",
      channel: "email",
      provider: "internal",
      direction: "inbound",
      intentType: "reminder",
      invoiceIds: ["invoice_seed_1"],
      payload: { paymentReceived: true },
    }),
    events.ingest({
      id: "learning_event_seed_4",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      occurredAt: "2026-03-26T12:00:00.000Z",
      sourceSystem: "sms_provider",
      eventType: "sms_opt_out_received",
      channel: "sms",
      provider: "twilio",
      direction: "inbound",
      intentType: "reminder",
      invoiceIds: ["invoice_seed_1"],
      payload: { optOutReceived: true },
    }),
  ];

  const operatorFeedback = [
    recordOperatorFeedback({
      id: "operator_feedback_seed_1",
      tenantId: "default",
      feedbackType: "contact_override",
      targetType: "contact",
      targetId: "contact_seed_1",
      occurredAt: "2026-03-26T12:30:00.000Z",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      reasonCode: "operator_prefers_email",
      appliesToFutureScoring: true,
      preservesSafetyRules: true,
      beforePayload: { preferredChannel: "email", smsNumberVerified: false },
      afterPayload: { preferredChannel: "email", smsNumberVerified: true },
    }),
  ];

  const communicationAttempts = [
    attempts.create({
      attemptId: "communication_attempt_seed_1",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      channel: "email",
      provider: "internal",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        email: "ap@example.com",
        displayName: "AP Contact",
        verified: true,
      },
      invoiceIds: ["invoice_seed_1"],
      subjectLine: "Reminder",
      contentTemplateKey: "collections_grouped_email_v1",
      bodyPreview: "Friendly reminder",
      createdAt: "2026-03-26T08:00:00.000Z",
    }),
    attempts.create({
      attemptId: "communication_attempt_seed_2",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      channel: "sms",
      provider: "twilio",
      direction: "outbound",
      intentType: "reminder",
      recipient: {
        phoneNumber: "+639171234567",
        displayName: "AP Contact",
        verified: false,
      },
      invoiceIds: ["invoice_seed_1"],
      bodyPreview: "SMS reminder",
      createdAt: "2026-03-26T09:00:00.000Z",
    }),
    attempts.create({
      attemptId: "communication_attempt_seed_3",
      tenantId: "default",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      channel: "call",
      provider: "vapi",
      direction: "outbound",
      intentType: "escalation",
      recipient: {
        phoneNumber: "+639171234567",
        displayName: "AP Contact",
        verified: true,
      },
      invoiceIds: ["invoice_seed_1"],
      createdAt: "2026-03-26T09:30:00.000Z",
      metadata: {
        voiceAutomationMode: "autonomous",
      },
    }),
  ];

  const emailOutcomes = [
    createEmailOutcome({
      id: "email_outcome_seed_1",
      tenantId: "default",
      communicationAttemptId: "communication_attempt_seed_1",
      occurredAt: "2026-03-26T10:00:00.000Z",
      delivered: true,
      opened: true,
      replied: true,
      docsRequested: false,
      extractedRemittanceSignal: false,
    }),
  ];
  const smsOutcomes = [
    createSmsOutcome({
      id: "sms_outcome_seed_1",
      tenantId: "default",
      communicationAttemptId: "communication_attempt_seed_2",
      occurredAt: "2026-03-26T10:05:00.000Z",
      delivered: false,
      optOutReceived: true,
    }),
  ];
  const callOutcomes = [
    createCallOutcome({
      id: "call_outcome_seed_1",
      tenantId: "default",
      communicationAttemptId: "communication_attempt_seed_3",
      occurredAt: "2026-03-26T10:15:00.000Z",
      answered: false,
      disposition: "operator_review_required",
      transcriptSummary: "Operator review required before any voice follow-up.",
      operatorReviewRequired: true,
    }),
  ];

  const accountBehaviorProfile = profiles.updateAccountProfile({
    profileId: "account_behavior_profile_seed_1",
    scope: "billing_account",
    scopeId: "billing_seed_1",
    parentAccountId: "parent_seed_1",
    billingAccountId: "billing_seed_1",
    events: seededEvents,
    feedback: operatorFeedback,
    computedAt: "2026-03-26T13:00:00.000Z",
  });
  const contactBehaviorProfile = profiles.updateContactProfile({
    profileId: "contact_behavior_profile_seed_1",
    contactId: "contact_seed_1",
    parentAccountId: "parent_seed_1",
    billingAccountId: "billing_seed_1",
    verificationSnapshot: {
      emailVerified: true,
      smsNumberVerified: true,
      phoneNumberVerified: false,
    },
    events: seededEvents,
    feedback: operatorFeedback,
    computedAt: "2026-03-26T13:00:00.000Z",
  });

  const nextBestActionScores = [
    scoring.score({
      scoreId: "next_best_action_score_seed_1",
      domain: "collections",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      contactId: "contact_seed_1",
      candidateActions: [
        "send_email_grouped_reminder",
        "send_sms_reminder",
      ],
      hardSafetyBlocks: ["no_sms_if_opt_out_exists"],
      requiresApproval: false,
      accountProfile: accountBehaviorProfile,
      contactProfile: contactBehaviorProfile,
      scoredAt: "2026-03-26T13:05:00.000Z",
    }),
  ];

  const channelBehaviorProfiles = [
    createChannelBehaviorProfile({
      id: "channel_behavior_profile_seed_1",
      tenantId: "default",
      ownerType: "account",
      ownerId: "billing_seed_1",
      parentAccountId: "parent_seed_1",
      billingAccountId: "billing_seed_1",
      channel: "email",
      responseRate: accountBehaviorProfile.metricsByChannel.email?.responseRate ?? 0,
      avgResponseLatencyHours:
        accountBehaviorProfile.metricsByChannel.email?.avgResponseLatencyHours,
      paymentConversionRate:
        accountBehaviorProfile.metricsByChannel.email?.paymentConversionRate ?? 0,
      ptpCaptureRate:
        accountBehaviorProfile.metricsByChannel.email?.ptpCaptureRate ?? 0,
      ptpKeptRate: accountBehaviorProfile.metricsByChannel.email?.ptpKeptRate ?? 0,
      wrongContactRate:
        accountBehaviorProfile.metricsByChannel.email?.wrongContactRate ?? 0,
      docRequestRate: accountBehaviorProfile.metricsByChannel.email?.docRequestRate ?? 0,
      optOutRate: accountBehaviorProfile.metricsByChannel.email?.optOutRate ?? 0,
      connectRate: accountBehaviorProfile.metricsByChannel.email?.connectRate ?? 0,
      voicemailRate: accountBehaviorProfile.metricsByChannel.email?.voicemailRate ?? 0,
      rightPartyContactRate:
        accountBehaviorProfile.metricsByChannel.email?.rightPartyContactRate ?? 0,
      bestForIntent: { reminder: true },
      lastComputedAt: "2026-03-26T13:00:00.000Z",
      evidenceCount: seededEvents.length,
    }),
  ];

  const learningEvents = [
    ...seededEvents,
    ...communicationAttempts.flatMap((attempt) =>
      normalization.normalizeAttemptCreated({ attempt }),
    ),
    ...normalization.normalizeEmailOutcome({
      attempt: communicationAttempts[0]!,
      outcome: emailOutcomes[0]!,
    }),
    ...normalization.normalizeSmsOutcome({
      attempt: communicationAttempts[1]!,
      outcome: smsOutcomes[0]!,
    }),
    ...normalization.normalizeCallOutcome({
      attempt: communicationAttempts[2]!,
      outcome: callOutcomes[0]!,
    }),
  ];

  return {
    communicationAttempts,
    channelBehaviorProfiles,
    emailOutcomes,
    smsOutcomes,
    callOutcomes,
    learningEvents,
    accountBehaviorProfiles: [accountBehaviorProfile],
    contactBehaviorProfiles: [contactBehaviorProfile],
    operatorFeedback,
    nextBestActionScores,
  };
}
