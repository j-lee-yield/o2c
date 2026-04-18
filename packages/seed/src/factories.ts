import type {
  AccountBehaviorProfile,
  ActivityLog,
  ApprovalRequest,
  BillingAccount,
  Branch,
  CallOutcome,
  ChannelBehaviorProfile,
  CommunicationAttempt,
  Contact,
  ContactBehaviorProfile,
  DomainException,
  EmailOutcome,
  Invoice,
  LearningEvent,
  NextBestActionScore,
  OperatorFeedback,
  ParentAccount,
  Payment,
  PromiseToPay,
  Remittance,
  SmsOutcome,
  UploadedDocument
} from "@o2c/domain";
import {
  createEntityMetadata,
  createTypedException,
  defaultLearningLayerPolicy,
} from "@o2c/domain";

const now = () => "2026-03-26T00:00:00.000Z";

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${String(sequence).padStart(4, "0")}`;
}

function baseEntity(at = now()) {
  return createEntityMetadata({
    at,
    actorId: "seed_user",
    actorRole: "system"
  });
}

export function makeParentAccount(overrides: Partial<ParentAccount> = {}): ParentAccount {
  return {
    id: nextId("parent_account"),
    ...baseEntity(),
    name: "Acme Parent",
    status: "active",
    metadata: {},
    ...overrides
  };
}

export function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: nextId("branch"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    billingAccountId: nextId("billing_account_ref"),
    code: "MNL",
    name: "Manila",
    status: "active",
    metadata: {},
    ...overrides
  };
}

export function makeBillingAccount(
  overrides: Partial<BillingAccount> = {}
): BillingAccount {
  return {
    id: nextId("billing_account"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    accountNumber: "BA-1001",
    displayName: "Acme Billing",
    currency: "USD",
    accountTier: "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {},
    ...overrides
  };
}

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: nextId("contact"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    scope: "billing_account",
    scopeId: nextId("billing_account_ref"),
    fullName: "A. Contact",
    role: "customer",
    isPrimary: true,
    isVerified: false,
    allowAutoSend: false,
    recentSuccessfulResponses: 0,
    metadata: {},
    ...overrides
  };
}

export function makeUploadedDocument(
  overrides: Partial<UploadedDocument> = {}
): UploadedDocument {
  return {
    id: nextId("uploaded_document"),
    ...baseEntity(),
    documentType: "invoice",
    source: "portal",
    storageKey: "documents/invoice.pdf",
    checksum: "abc123",
    uploadedBy: "user_001",
    uploadedAt: now(),
    metadata: {},
    ...overrides
  };
}

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: nextId("invoice"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    billingAccountId: nextId("billing_account_ref"),
    invoiceNumber: "INV-1001",
    currency: "USD",
    amountCents: 100_00,
    state: "uploaded_unmatched",
    metadata: {},
    ...overrides
  };
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: nextId("payment"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    paymentReference: "PAY-1001",
    currency: "USD",
    amountCents: 100_00,
    receivedAt: now(),
    state: "ingested_unmatched",
    metadata: {},
    ...overrides
  };
}

export function makeRemittance(overrides: Partial<Remittance> = {}): Remittance {
  return {
    id: nextId("remittance"),
    ...baseEntity(),
    sourceChannel: "email",
    rawPayload: { invoiceNumbers: ["INV-1001"] },
    state: "received_unparsed",
    metadata: {},
    ...overrides
  };
}

export function makePromiseToPay(
  overrides: Partial<PromiseToPay> = {}
): PromiseToPay {
  return {
    id: nextId("promise_to_pay"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    billingAccountId: nextId("billing_account_ref"),
    promisedAmountCents: 100_00,
    currency: "USD",
    promiseDate: "2026-03-26",
    state: "detected_unconfirmed",
    metadata: {},
    ...overrides
  };
}

export function makeException(
  overrides: Partial<DomainException> = {}
): DomainException {
  const base = createTypedException({
    id: nextId("exception"),
    entityType: "invoice",
    entityId: nextId("invoice_ref"),
    kind: "missing_supporting_docs",
    createdAt: now(),
    metadata: {},
  });

  return {
    ...base,
    ...overrides
  };
}

export function makeActivityLog(
  overrides: Partial<ActivityLog> = {}
): ActivityLog {
  return {
    id: nextId("activity_log"),
    ...baseEntity(),
    entityType: "invoice",
    entityId: nextId("invoice_ref"),
    action: "transition",
    actorId: "user_001",
    actorRole: "admin",
    occurredAt: now(),
    immutable: true,
    payload: {},
    ...overrides
  };
}

export function makeApprovalRequest(
  overrides: Partial<ApprovalRequest> = {}
): ApprovalRequest {
  return {
    id: nextId("approval_request"),
    ...baseEntity(),
    requestType: "writeoff",
    status: "pending_approval",
    requestedBy: "user_001",
    requestedAt: now(),
    payload: {},
    policyContext: {},
    ...overrides
  };
}

export function makeLearningEvent(
  overrides: Partial<LearningEvent> = {}
): LearningEvent {
  return {
    id: nextId("learning_event"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    eventType: "communication_attempt_created",
    sourceSystem: "collections",
    occurredAt: now(),
    invoiceIds: [],
    explanation: [],
    payload: {},
    reversible: true,
    metadata: {},
    ...overrides,
  };
}

export function makeCommunicationAttempt(
  overrides: Partial<CommunicationAttempt> = {}
): CommunicationAttempt {
  return {
    id: nextId("communication_attempt"),
    ...baseEntity(),
    parentAccountId: nextId("parent_account_ref"),
    channel: "email",
    provider: "internal",
    direction: "outbound",
    intentType: "reminder",
    status: "queued",
    recipient: {
      email: "ap@example.com",
      displayName: "A. Contact",
      verified: true,
    },
    invoiceIds: [],
    blockedReasons: [],
    explanation: [],
    metadata: {},
    ...overrides,
  };
}

export function makeChannelBehaviorProfile(
  overrides: Partial<ChannelBehaviorProfile> = {}
): ChannelBehaviorProfile {
  return {
    id: nextId("channel_behavior_profile"),
    ...baseEntity(),
    ownerType: "account",
    ownerId: nextId("billing_account_ref"),
    parentAccountId: nextId("parent_account_ref"),
    channel: "email",
    responseRate: 0.8,
    paymentConversionRate: 0.6,
    ptpCaptureRate: 0.2,
    ptpKeptRate: 0.8,
    wrongContactRate: 0,
    docRequestRate: 0.1,
    optOutRate: 0,
    connectRate: 0,
    voicemailRate: 0,
    rightPartyContactRate: 0.8,
    bestForIntent: { reminder: true },
    lastComputedAt: now(),
    evidenceCount: 5,
    explanation: [],
    metadata: {},
    ...overrides,
  };
}

export function makeEmailOutcome(
  overrides: Partial<EmailOutcome> = {}
): EmailOutcome {
  return {
    id: nextId("email_outcome"),
    ...baseEntity(),
    communicationAttemptId: nextId("communication_attempt_ref"),
    delivered: true,
    opened: true,
    replied: false,
    bounced: false,
    linkClicked: false,
    attachmentsSent: [],
    docsRequested: false,
    extractedRemittanceSignal: false,
    occurredAt: now(),
    metadata: {},
    ...overrides,
  };
}

export function makeSmsOutcome(
  overrides: Partial<SmsOutcome> = {}
): SmsOutcome {
  return {
    id: nextId("sms_outcome"),
    ...baseEntity(),
    communicationAttemptId: nextId("communication_attempt_ref"),
    delivered: true,
    replied: false,
    clicked: false,
    optOutReceived: false,
    extractedRemittanceSignal: false,
    occurredAt: now(),
    metadata: {},
    ...overrides,
  };
}

export function makeCallOutcome(
  overrides: Partial<CallOutcome> = {}
): CallOutcome {
  return {
    id: nextId("call_outcome"),
    ...baseEntity(),
    communicationAttemptId: nextId("communication_attempt_ref"),
    answered: false,
    disposition: "operator_review_required",
    transcriptSegments: [],
    operatorReviewRequired: true,
    occurredAt: now(),
    metadata: {},
    ...overrides,
  };
}

export function makeAccountBehaviorProfile(
  overrides: Partial<AccountBehaviorProfile> = {}
): AccountBehaviorProfile {
  return {
    id: nextId("account_behavior_profile"),
    ...baseEntity(),
    scope: "billing_account",
    scopeId: nextId("billing_account_ref"),
    parentAccountId: nextId("parent_account_ref"),
    preferredChannel: "email",
    fallbackChannel: "call",
    channelPriorityOrder: ["email", "call", "sms"],
    bestChannelByIntent: { reminder: "email" },
    metricsByChannel: {},
    safetyFlags: {
      doNotSms: false,
      doNotCall: false,
      voiceAgentAllowed: true,
    },
    evidenceSummary: {
      eventCount: 0,
      feedbackCount: 0,
      lookbackWindowDays: defaultLearningLayerPolicy().lookbackWindowDays,
    },
    explanation: [],
    policySnapshot: defaultLearningLayerPolicy(),
    lastComputedAt: now(),
    metadata: {},
    ...overrides,
  };
}

export function makeContactBehaviorProfile(
  overrides: Partial<ContactBehaviorProfile> = {}
): ContactBehaviorProfile {
  return {
    id: nextId("contact_behavior_profile"),
    ...baseEntity(),
    contactId: nextId("contact_ref"),
    parentAccountId: nextId("parent_account_ref"),
    preferredChannel: "email",
    fallbackChannel: "call",
    channelPriorityOrder: ["email", "call", "sms"],
    bestChannelByIntent: { reminder: "email" },
    metricsByChannel: {},
    verificationSnapshot: {
      emailVerified: true,
      smsNumberVerified: false,
      phoneNumberVerified: false,
    },
    evidenceSummary: {
      eventCount: 0,
      feedbackCount: 0,
      lookbackWindowDays: defaultLearningLayerPolicy().lookbackWindowDays,
    },
    explanation: [],
    policySnapshot: defaultLearningLayerPolicy(),
    lastComputedAt: now(),
    metadata: {},
    ...overrides,
  };
}

export function makeOperatorFeedback(
  overrides: Partial<OperatorFeedback> = {}
): OperatorFeedback {
  return {
    id: nextId("operator_feedback"),
    ...baseEntity(),
    feedbackType: "override",
    targetType: "next_best_action_score",
    targetId: nextId("target_ref"),
    occurredAt: now(),
    reasonCode: "seed_feedback",
    appliesToFutureScoring: true,
    preservesSafetyRules: true,
    metadata: {},
    ...overrides,
  };
}

export function makeNextBestActionScore(
  overrides: Partial<NextBestActionScore> = {}
): NextBestActionScore {
  return {
    id: nextId("next_best_action_score"),
    ...baseEntity(),
    domain: "collections",
    parentAccountId: nextId("parent_account_ref"),
    recommendedAction: "send_email_grouped_reminder",
    recommendedChannel: "email",
    intentType: "reminder",
    score: 0.8,
    recommendedReasonSummary: "Email remains the default MVP channel for reminders.",
    requiresApproval: false,
    hardSafetyBlocks: [],
    candidateScores: [],
    explanation: [],
    sourceProfileIds: {},
    policySnapshot: defaultLearningLayerPolicy(),
    scoredAt: now(),
    metadata: {},
    ...overrides,
  };
}
