import {
  createEntityMetadata,
  type DomainEntity,
} from "../../shared/types.js";
import type {
  LearningChannel,
  LearningCommunicationStatus,
  LearningDirection,
  LearningEvent,
  LearningIntentType,
  LearningProvider,
  LearningReason,
} from "./schema.js";
import {
  DeterministicLearningEventIngestionService,
  type LearningEventIngestionService,
} from "./service.js";

export interface CommunicationRecipient {
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  verified: boolean;
}

export interface CommunicationAttempt extends DomainEntity {
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  approvalRequestId?: string;
  channel: LearningChannel;
  provider: LearningProvider;
  senderIdentityId?: string;
  senderEmail?: string;
  senderDisplayName?: string;
  direction: LearningDirection;
  intentType: LearningIntentType;
  status: LearningCommunicationStatus;
  recipient: CommunicationRecipient;
  invoiceIds: string[];
  subjectLine?: string;
  contentTemplateKey?: string;
  bodyPreview?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  inReplyToProviderMessageId?: string;
  blockedReasons: string[];
  explanation: LearningReason[];
  metadata: Record<string, unknown>;
}

export interface ChannelBehaviorProfile extends DomainEntity {
  ownerType: "account" | "contact";
  ownerId: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  channel: LearningChannel;
  responseRate: number;
  avgResponseLatencyHours?: number;
  paymentConversionRate: number;
  ptpCaptureRate: number;
  ptpKeptRate: number;
  wrongContactRate: number;
  docRequestRate: number;
  optOutRate: number;
  connectRate: number;
  voicemailRate: number;
  rightPartyContactRate: number;
  bestForIntent: Partial<Record<LearningIntentType, boolean>>;
  lastComputedAt: string;
  evidenceCount: number;
  explanation: LearningReason[];
  metadata: Record<string, unknown>;
}

export interface EmailOutcome extends DomainEntity {
  communicationAttemptId: string;
  delivered: boolean;
  opened: boolean;
  replied: boolean;
  bounced: boolean;
  linkClicked: boolean;
  attachmentsSent: string[];
  docsRequested: boolean;
  extractedPtp?: {
    promisedAmountCents?: number;
    promisedDate?: string;
  };
  extractedRemittanceSignal: boolean;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface SmsOutcome extends DomainEntity {
  communicationAttemptId: string;
  delivered: boolean;
  replied: boolean;
  clicked: boolean;
  optOutReceived: boolean;
  extractedPtp?: {
    promisedAmountCents?: number;
    promisedDate?: string;
  };
  extractedRemittanceSignal: boolean;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface CallOutcome extends DomainEntity {
  communicationAttemptId: string;
  answered: boolean;
  durationSeconds?: number;
  disposition:
    | "connected"
    | "missed"
    | "voicemail_left"
    | "wrong_contact"
    | "callback_requested"
    | "operator_review_required";
  promisedAmountCents?: number;
  promisedDate?: string;
  transcriptUri?: string;
  transcriptSummary?: string;
  transcriptSegments: Array<{
    speaker: "agent" | "customer" | "unknown";
    startedAtSeconds?: number;
    text: string;
  }>;
  sentimentLabel?: "positive" | "neutral" | "negative";
  operatorReviewRequired: boolean;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface CommunicationProviderSendResult {
  attemptId: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  acceptedAt: string;
  metadata?: Record<string, unknown>;
}

export interface EmailDraftResult {
  attemptId: string;
  providerDraftId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface EmailReplyMetadata {
  communicationAttemptId?: string;
  providerMessageId: string;
  providerThreadId?: string;
  providerConversationId?: string;
  replyToProviderMessageId?: string;
  fromEmail?: string;
  receivedAt?: string;
  metadata: Record<string, unknown>;
}

export interface EmailFailureMetadata {
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  failureKind:
    | "bounce"
    | "rejected"
    | "mailbox_disconnected"
    | "invalid_recipient"
    | "provider_error";
  occurredAt: string;
  reasonSummary: string;
  metadata: Record<string, unknown>;
}

export interface CommunicationExecutionDecision {
  allowed: boolean;
  blockedReasons: string[];
  metadata?: Record<string, unknown>;
}

export interface CommunicationExecutionHooks {
  checkAllowedHours(input: {
    attempt: CommunicationAttempt;
    occurredAt: string;
  }): CommunicationExecutionDecision;
  checkApprovalGate(input: {
    attempt: CommunicationAttempt;
  }): CommunicationExecutionDecision;
  checkChannelSafety(input: {
    attempt: CommunicationAttempt;
  }): CommunicationExecutionDecision;
}

export interface ProviderOutcomeNormalizationResult<
  TOutcome extends EmailOutcome | SmsOutcome | CallOutcome,
> {
  outcome: TOutcome;
  learningEvents: LearningEvent[];
}

export interface EmailProviderAdapter {
  sendEmail(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult>;
  createDraft(input: {
    attempt: CommunicationAttempt;
  }): Promise<EmailDraftResult>;
  replyToThread(input: {
    attempt: CommunicationAttempt;
    providerThreadId: string;
    replyToProviderMessageId?: string;
  }): Promise<CommunicationProviderSendResult>;
  forwardMessage(input: {
    attempt: CommunicationAttempt;
    providerMessageId: string;
  }): Promise<CommunicationProviderSendResult>;
  fetchDeliveryStatus(input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]>;
  fetchReplyMetadata(input: {
    providerMessageId: string;
  }): Promise<EmailReplyMetadata[]>;
  fetchOpenEvents(input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]>;
  fetchBounceFailureMetadata(input: {
    providerMessageId: string;
  }): Promise<EmailFailureMetadata[]>;
}

export interface EmailProviderPayloadNormalizer {
  normalizeEmailProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderOutcomeNormalizationResult<EmailOutcome>;
}

export interface SmsProviderAdapter {
  sendSms(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult>;
  fetchDeliveryStatus(input: {
    providerMessageId: string;
  }): Promise<SmsOutcome[]>;
  receiveInboundSms(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<SmsOutcome>;
  fetchClickEvents(input: {
    providerMessageId: string;
  }): Promise<SmsOutcome[]>;
  markOptOut(input: {
    phoneNumber: string;
  }): Promise<void>;
}

export interface SmsProviderPayloadNormalizer {
  normalizeSmsProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderOutcomeNormalizationResult<SmsOutcome>;
}

export interface CallProviderAdapter {
  placeCall(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult>;
  receiveCallStatus(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome>;
  receiveTranscript(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome>;
  receiveDisposition(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome>;
  fetchRecordingMetadata(input: {
    providerMessageId: string;
  }): Promise<Record<string, unknown>>;
  terminateCall(input: {
    providerMessageId: string;
  }): Promise<void>;
}

export interface CallProviderPayloadNormalizer {
  normalizeCallProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderOutcomeNormalizationResult<CallOutcome>;
}

export interface CommunicationAttemptFactory {
  create(input: {
    attemptId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    contactId?: string;
    approvalRequestId?: string;
    channel: LearningChannel;
    provider: LearningProvider;
    senderIdentityId?: string;
    senderEmail?: string;
    senderDisplayName?: string;
    direction: LearningDirection;
    intentType: LearningIntentType;
    recipient: CommunicationRecipient;
    invoiceIds?: string[];
    subjectLine?: string;
    contentTemplateKey?: string;
    bodyPreview?: string;
    providerMessageId?: string;
    providerThreadId?: string;
    providerConversationId?: string;
    inReplyToProviderMessageId?: string;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
    createdAt: string;
  }): CommunicationAttempt;
}

export interface CommunicationOutcomeNormalizationService {
  normalizeAttemptCreated(input: {
    attempt: CommunicationAttempt;
  }): LearningEvent[];
  normalizeEmailOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: EmailOutcome;
  }): LearningEvent[];
  normalizeSmsOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: SmsOutcome;
  }): LearningEvent[];
  normalizeCallOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: CallOutcome;
  }): LearningEvent[];
}

export class SafeCommunicationAttemptFactory
  implements CommunicationAttemptFactory
{
  create(input: {
    attemptId: string;
    parentAccountId: string;
    billingAccountId?: string;
    branchId?: string;
    contactId?: string;
    approvalRequestId?: string;
    channel: LearningChannel;
    provider: LearningProvider;
    senderIdentityId?: string;
    senderEmail?: string;
    senderDisplayName?: string;
    direction: LearningDirection;
    intentType: LearningIntentType;
    recipient: CommunicationRecipient;
    invoiceIds?: string[];
    subjectLine?: string;
    contentTemplateKey?: string;
    bodyPreview?: string;
    providerMessageId?: string;
    providerThreadId?: string;
    providerConversationId?: string;
    inReplyToProviderMessageId?: string;
    metadata?: Record<string, unknown>;
    actorId?: string;
    actorRole?: "system" | "user";
    tenantId?: string;
    createdAt: string;
  }): CommunicationAttempt {
    const blockedReasons = deriveBlockedReasons(input);
    const status =
      blockedReasons.length > 0
        ? "blocked"
        : input.direction === "outbound"
          ? "queued"
          : "completed";
    const explanation: LearningReason[] = [
      {
        code:
          blockedReasons.length > 0
            ? "communication_blocked"
            : "communication_attempt_created",
        summary:
          blockedReasons.length > 0
            ? `Attempt blocked: ${blockedReasons.join(", ")}.`
            : `${input.channel} attempt prepared for ${input.intentType}.`,
      },
    ];

    return {
      id: input.attemptId,
      ...createEntityMetadata(buildEntityMetadataInput(
        input.createdAt,
        input.tenantId,
        input.actorId,
        input.actorRole,
      )),
      parentAccountId: input.parentAccountId,
      ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
      channel: input.channel,
      provider: input.provider,
      ...(input.senderIdentityId ? { senderIdentityId: input.senderIdentityId } : {}),
      ...(input.senderEmail ? { senderEmail: input.senderEmail } : {}),
      ...(input.senderDisplayName ? { senderDisplayName: input.senderDisplayName } : {}),
      direction: input.direction,
      intentType: input.intentType,
      status,
      recipient: input.recipient,
      invoiceIds: input.invoiceIds ?? [],
      ...(input.subjectLine ? { subjectLine: input.subjectLine } : {}),
      ...(input.contentTemplateKey
        ? { contentTemplateKey: input.contentTemplateKey }
        : {}),
      ...(input.bodyPreview ? { bodyPreview: input.bodyPreview } : {}),
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
      ...(input.providerConversationId
        ? { providerConversationId: input.providerConversationId }
        : {}),
      ...(input.inReplyToProviderMessageId
        ? { inReplyToProviderMessageId: input.inReplyToProviderMessageId }
        : {}),
      blockedReasons,
      explanation,
      metadata: input.metadata ?? {},
    };
  }
}

export class DeterministicCommunicationOutcomeNormalizationService
  implements CommunicationOutcomeNormalizationService
{
  constructor(
    private readonly events: LearningEventIngestionService = new DeterministicLearningEventIngestionService(),
  ) {}

  normalizeAttemptCreated(input: {
    attempt: CommunicationAttempt;
  }): LearningEvent[] {
    return [
      this.events.ingest({
        id: `${input.attempt.id}:created`,
        ...(input.attempt.tenantId ? { tenantId: input.attempt.tenantId } : {}),
        parentAccountId: input.attempt.parentAccountId,
        ...(input.attempt.billingAccountId
          ? { billingAccountId: input.attempt.billingAccountId }
          : {}),
        ...(input.attempt.branchId ? { branchId: input.attempt.branchId } : {}),
        ...(input.attempt.contactId ? { contactId: input.attempt.contactId } : {}),
        occurredAt: input.attempt.createdAt,
        sourceSystem: sourceSystemForAttempt(input.attempt.channel),
        eventType:
          input.attempt.status === "blocked"
            ? "communication_blocked"
            : "communication_attempt_created",
        channel: input.attempt.channel,
        provider: input.attempt.provider,
        direction: input.attempt.direction,
        intentType: input.attempt.intentType,
        communicationStatus: input.attempt.status,
        invoiceIds: input.attempt.invoiceIds,
        relatedEntityType: "communication_attempt",
        relatedEntityId: input.attempt.id,
        explanation: input.attempt.explanation,
        payload: {
          blockedReasons: input.attempt.blockedReasons,
          recipientVerified: input.attempt.recipient.verified,
        },
      }),
    ];
  }

  normalizeEmailOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: EmailOutcome;
  }): LearningEvent[] {
    const events: LearningEvent[] = [];
    if (input.outcome.delivered) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "email_delivered", "delivered"));
    }
    if (input.outcome.opened) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "email_opened", "opened"));
    }
    if (input.outcome.replied) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "email_replied", "replied"));
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "customer_response_received", "replied"));
    }
    if (input.outcome.bounced) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "email_bounced", "bounced"));
    }
    if (input.outcome.linkClicked) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "email_link_clicked", "clicked"));
    }
    return events;
  }

  normalizeSmsOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: SmsOutcome;
  }): LearningEvent[] {
    const events: LearningEvent[] = [];
    if (input.outcome.delivered) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "sms_delivered", "delivered"));
    }
    if (input.outcome.replied) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "sms_replied", "replied"));
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "customer_response_received", "replied"));
    }
    if (input.outcome.clicked) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "sms_link_clicked", "clicked"));
    }
    if (input.outcome.optOutReceived) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "sms_opt_out_received", "blocked"));
    }
    return events;
  }

  normalizeCallOutcome(input: {
    attempt: CommunicationAttempt;
    outcome: CallOutcome;
  }): LearningEvent[] {
    const events: LearningEvent[] = [];
    if (input.outcome.answered) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_connected", "connected"));
    }
    if (!input.outcome.answered && input.outcome.disposition === "missed") {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_missed", "missed"));
    }
    if (input.outcome.disposition === "voicemail_left") {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "voicemail_left", "voicemail_left"));
    }
    if (input.outcome.disposition === "wrong_contact") {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_wrong_contact", "completed"));
    }
    events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_disposition_logged", "completed"));
    if (input.outcome.transcriptUri || input.outcome.transcriptSummary) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_transcript_ingested", "completed"));
    }
    if (input.outcome.promisedDate || input.outcome.promisedAmountCents !== undefined) {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "call_ptp_captured", "completed"));
    }
    if (input.outcome.disposition === "callback_requested") {
      events.push(this.buildOutcomeEvent(input.attempt, input.outcome, "callback_requested", "completed"));
    }
    return events;
  }

  private buildOutcomeEvent(
    attempt: CommunicationAttempt,
    outcome: EmailOutcome | SmsOutcome | CallOutcome,
    eventType: LearningEvent["eventType"],
    communicationStatus: LearningCommunicationStatus,
  ): LearningEvent {
    return this.events.ingest({
      id: `${attempt.id}:${eventType}:${outcome.id}`,
      ...(attempt.tenantId ? { tenantId: attempt.tenantId } : {}),
      parentAccountId: attempt.parentAccountId,
      ...(attempt.billingAccountId ? { billingAccountId: attempt.billingAccountId } : {}),
      ...(attempt.branchId ? { branchId: attempt.branchId } : {}),
      ...(attempt.contactId ? { contactId: attempt.contactId } : {}),
      occurredAt: outcome.occurredAt,
      sourceSystem: sourceSystemForAttempt(attempt.channel),
      eventType,
      channel: attempt.channel,
      provider: attempt.provider,
      direction: "inbound",
      intentType: attempt.intentType,
      communicationStatus,
      invoiceIds: attempt.invoiceIds,
      relatedEntityType: "communication_attempt",
      relatedEntityId: attempt.id,
      payload: normalizeOutcomePayload(outcome),
    });
  }
}

export function createEmailOutcome(input: {
  id: string;
  communicationAttemptId: string;
  occurredAt: string;
  delivered: boolean;
  opened?: boolean;
  replied?: boolean;
  bounced?: boolean;
  linkClicked?: boolean;
  attachmentsSent?: string[];
  docsRequested?: boolean;
  extractedPtp?: EmailOutcome["extractedPtp"];
  extractedRemittanceSignal?: boolean;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): EmailOutcome {
  return {
    id: input.id,
    ...createEntityMetadata(buildEntityMetadataInput(
      input.occurredAt,
      input.tenantId,
      input.actorId,
      input.actorRole,
    )),
    communicationAttemptId: input.communicationAttemptId,
    delivered: input.delivered,
    opened: input.opened ?? false,
    replied: input.replied ?? false,
    bounced: input.bounced ?? false,
    linkClicked: input.linkClicked ?? false,
    attachmentsSent: input.attachmentsSent ?? [],
    docsRequested: input.docsRequested ?? false,
    ...(input.extractedPtp ? { extractedPtp: input.extractedPtp } : {}),
    extractedRemittanceSignal: input.extractedRemittanceSignal ?? false,
    occurredAt: input.occurredAt,
    metadata: input.metadata ?? {},
  };
}

export function createSmsOutcome(input: {
  id: string;
  communicationAttemptId: string;
  occurredAt: string;
  delivered: boolean;
  replied?: boolean;
  clicked?: boolean;
  optOutReceived?: boolean;
  extractedPtp?: SmsOutcome["extractedPtp"];
  extractedRemittanceSignal?: boolean;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): SmsOutcome {
  return {
    id: input.id,
    ...createEntityMetadata(buildEntityMetadataInput(
      input.occurredAt,
      input.tenantId,
      input.actorId,
      input.actorRole,
    )),
    communicationAttemptId: input.communicationAttemptId,
    delivered: input.delivered,
    replied: input.replied ?? false,
    clicked: input.clicked ?? false,
    optOutReceived: input.optOutReceived ?? false,
    ...(input.extractedPtp ? { extractedPtp: input.extractedPtp } : {}),
    extractedRemittanceSignal: input.extractedRemittanceSignal ?? false,
    occurredAt: input.occurredAt,
    metadata: input.metadata ?? {},
  };
}

export function createCallOutcome(input: {
  id: string;
  communicationAttemptId: string;
  occurredAt: string;
  answered: boolean;
  disposition: CallOutcome["disposition"];
  durationSeconds?: number;
  promisedAmountCents?: number;
  promisedDate?: string;
  transcriptUri?: string;
  transcriptSummary?: string;
  transcriptSegments?: CallOutcome["transcriptSegments"];
  sentimentLabel?: CallOutcome["sentimentLabel"];
  operatorReviewRequired?: boolean;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): CallOutcome {
  return {
    id: input.id,
    ...createEntityMetadata(buildEntityMetadataInput(
      input.occurredAt,
      input.tenantId,
      input.actorId,
      input.actorRole,
    )),
    communicationAttemptId: input.communicationAttemptId,
    answered: input.answered,
    ...(input.durationSeconds !== undefined
      ? { durationSeconds: input.durationSeconds }
      : {}),
    disposition: input.disposition,
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.transcriptUri ? { transcriptUri: input.transcriptUri } : {}),
    ...(input.transcriptSummary ? { transcriptSummary: input.transcriptSummary } : {}),
    transcriptSegments: input.transcriptSegments ?? [],
    ...(input.sentimentLabel ? { sentimentLabel: input.sentimentLabel } : {}),
    operatorReviewRequired: input.operatorReviewRequired ?? true,
    occurredAt: input.occurredAt,
    metadata: input.metadata ?? {},
  };
}

export function createChannelBehaviorProfile(input: {
  id: string;
  ownerType: "account" | "contact";
  ownerId: string;
  parentAccountId: string;
  channel: LearningChannel;
  responseRate: number;
  paymentConversionRate: number;
  ptpCaptureRate: number;
  ptpKeptRate: number;
  wrongContactRate: number;
  docRequestRate: number;
  optOutRate: number;
  connectRate: number;
  voicemailRate: number;
  rightPartyContactRate: number;
  lastComputedAt: string;
  evidenceCount: number;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
  avgResponseLatencyHours?: number;
  bestForIntent?: Partial<Record<LearningIntentType, boolean>>;
  explanation?: LearningReason[];
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): ChannelBehaviorProfile {
  return {
    id: input.id,
    ...createEntityMetadata(buildEntityMetadataInput(
      input.lastComputedAt,
      input.tenantId,
      input.actorId,
      input.actorRole,
    )),
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    parentAccountId: input.parentAccountId,
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    channel: input.channel,
    responseRate: input.responseRate,
    ...(input.avgResponseLatencyHours !== undefined
      ? { avgResponseLatencyHours: input.avgResponseLatencyHours }
      : {}),
    paymentConversionRate: input.paymentConversionRate,
    ptpCaptureRate: input.ptpCaptureRate,
    ptpKeptRate: input.ptpKeptRate,
    wrongContactRate: input.wrongContactRate,
    docRequestRate: input.docRequestRate,
    optOutRate: input.optOutRate,
    connectRate: input.connectRate,
    voicemailRate: input.voicemailRate,
    rightPartyContactRate: input.rightPartyContactRate,
    bestForIntent: input.bestForIntent ?? {},
    lastComputedAt: input.lastComputedAt,
    evidenceCount: input.evidenceCount,
    explanation: input.explanation ?? [],
    metadata: input.metadata ?? {},
  };
}

function deriveBlockedReasons(input: {
  channel: LearningChannel;
  recipient: CommunicationRecipient;
  direction: LearningDirection;
  metadata?: Record<string, unknown>;
}): string[] {
  if (input.direction !== "outbound") {
    return [];
  }

  const reasons: string[] = [];
  if (!input.recipient.verified) {
    reasons.push(
      input.channel === "email"
        ? "unverified_contact"
        : "unverified_number",
    );
  }
  if (
    input.channel === "email" &&
    !input.recipient.email
  ) {
    reasons.push("missing_email_address");
  }
  if (
    (input.channel === "sms" || input.channel === "call") &&
    !input.recipient.phoneNumber
  ) {
    reasons.push("missing_phone_number");
  }
  if (
    input.channel === "call" &&
    input.metadata?.voiceAutomationMode === "autonomous"
  ) {
    reasons.push("unsafe_voice_automation");
  }
  return reasons;
}

function sourceSystemForAttempt(channel: LearningChannel): LearningEvent["sourceSystem"] {
  switch (channel) {
    case "sms":
      return "sms_provider";
    case "call":
      return "voice_provider";
    case "email":
    default:
      return "email_provider";
  }
}

function normalizeOutcomePayload(
  outcome: EmailOutcome | SmsOutcome | CallOutcome,
): Record<string, unknown> {
  if ("communicationAttemptId" in outcome) {
    return {
      ...outcome.metadata,
      ...(outcome.id ? { outcomeId: outcome.id } : {}),
      ...(outcome.communicationAttemptId
        ? { communicationAttemptId: outcome.communicationAttemptId }
        : {}),
      ...(hasExtractedPtp(outcome) ? { ptpCaptured: true } : {}),
      ...(hasDocsRequested(outcome) ? { docsRequested: true } : {}),
      ...(hasOptOut(outcome) ? { optOutReceived: true } : {}),
      ...(hasTranscript(outcome) ? { transcriptReady: true } : {}),
      ...(hasWrongContactDisposition(outcome) ? { wrongContact: true } : {}),
    };
  }
  return {};
}

function hasExtractedPtp(outcome: EmailOutcome | SmsOutcome | CallOutcome): boolean {
  if ("extractedPtp" in outcome) {
    return outcome.extractedPtp !== undefined;
  }
  return (
    ("promisedDate" in outcome && outcome.promisedDate !== undefined) ||
    ("promisedAmountCents" in outcome && outcome.promisedAmountCents !== undefined)
  );
}

function hasDocsRequested(outcome: EmailOutcome | SmsOutcome | CallOutcome): boolean {
  return "docsRequested" in outcome ? outcome.docsRequested : false;
}

function hasOptOut(outcome: EmailOutcome | SmsOutcome | CallOutcome): boolean {
  return "optOutReceived" in outcome ? outcome.optOutReceived : false;
}

function hasTranscript(outcome: EmailOutcome | SmsOutcome | CallOutcome): boolean {
  return "transcriptUri" in outcome || "transcriptSummary" in outcome;
}

function hasWrongContactDisposition(
  outcome: EmailOutcome | SmsOutcome | CallOutcome,
): boolean {
  return "disposition" in outcome ? outcome.disposition === "wrong_contact" : false;
}

function buildEntityMetadataInput(
  at: string,
  tenantId?: string,
  actorId?: string,
  actorRole?: "system" | "user",
): {
  at: string;
  tenantId?: string;
  actorId?: string;
  actorRole?: "system" | "user";
} {
  return {
    at,
    ...(tenantId ? { tenantId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(actorRole ? { actorRole } : {}),
  };
}
