import {
  DeterministicCommunicationOutcomeNormalizationService,
  type CallOutcome,
  type CallProviderAdapter,
  type CallProviderPayloadNormalizer,
  type CommunicationAttempt,
  type CommunicationExecutionDecision,
  type CommunicationExecutionHooks,
  type CommunicationProviderSendResult,
  type EmailDraftResult,
  type EmailFailureMetadata,
  type EmailOutcome,
  type EmailProviderAdapter,
  type EmailProviderPayloadNormalizer,
  type EmailReplyMetadata,
  type LearningEvent,
  type SmsOutcome,
  type SmsProviderAdapter,
  type SmsProviderPayloadNormalizer,
  createCallOutcome,
  createEmailOutcome,
  createSmsOutcome,
} from "@o2c/domain";

export type CommunicationProviderMaturity =
  | "email_complete"
  | "sms_ready"
  | "voice_ready";

export interface CommunicationProviderDescriptor {
  channel: CommunicationAttempt["channel"];
  provider: CommunicationAttempt["provider"];
  displayName: string;
  maturity: CommunicationProviderMaturity;
  supportsOutboundSend: boolean;
  supportsInboundEvents: boolean;
  supportsTranscriptIngestion: boolean;
  requiresVerifiedRecipient: boolean;
  allowsAutonomousNegotiation: boolean;
}

export interface CommunicationProviderInboundEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  channel: CommunicationAttempt["channel"];
  provider: CommunicationAttempt["provider"];
  providerEventType: string;
  communicationAttemptId?: string;
  providerMessageId?: string;
  occurredAt: string;
  payload: TPayload;
}

export type NormalizedCommunicationEventBatch =
  | {
      channel: "email";
      provider: CommunicationAttempt["provider"];
      communicationAttemptId: string;
      normalizedAt: string;
      outcomes: Array<{
        channel: "email";
        outcome: EmailOutcome;
      }>;
      learningEventIds: string[];
    }
  | {
      channel: "sms";
      provider: CommunicationAttempt["provider"];
      communicationAttemptId: string;
      normalizedAt: string;
      outcomes: Array<{
        channel: "sms";
        outcome: SmsOutcome;
      }>;
      learningEventIds: string[];
    }
  | {
      channel: "call";
      provider: CommunicationAttempt["provider"];
      communicationAttemptId: string;
      normalizedAt: string;
      outcomes: Array<{
        channel: "call";
        outcome: CallOutcome;
      }>;
      learningEventIds: string[];
    };

export interface ProviderExecutionResult {
  executed: boolean;
  blockedReasons: string[];
  sendResult?: CommunicationProviderSendResult;
}

export interface ProviderInboundProcessingResult<
  TOutcome extends EmailOutcome | SmsOutcome | CallOutcome,
> {
  outcome: TOutcome;
  learningEvents: LearningEvent[];
}

export interface EmailProviderBundle {
  descriptor: CommunicationProviderDescriptor & {
    channel: "email";
    maturity: "email_complete";
  };
  adapter: EmailProviderAdapter;
  normalizer: EmailProviderPayloadNormalizer;
}

export interface SmsProviderBundle {
  descriptor: CommunicationProviderDescriptor & {
    channel: "sms";
    maturity: "sms_ready";
  };
  adapter: SmsProviderAdapter;
  normalizer: SmsProviderPayloadNormalizer;
}

export interface VoiceProviderBundle {
  descriptor: CommunicationProviderDescriptor & {
    channel: "call";
    maturity: "voice_ready";
  };
  adapter: CallProviderAdapter;
  normalizer: CallProviderPayloadNormalizer;
}

export type CommunicationProviderBundle =
  | EmailProviderBundle
  | SmsProviderBundle
  | VoiceProviderBundle;

export class InMemoryCommunicationProviderRegistry {
  private readonly bundles = new Map<string, CommunicationProviderBundle>();

  register(bundle: CommunicationProviderBundle): this {
    this.bundles.set(buildRegistryKey(bundle.descriptor.channel, bundle.descriptor.provider), bundle);
    return this;
  }

  resolveForAttempt(attempt: CommunicationAttempt): CommunicationProviderBundle {
    const bundle = this.bundles.get(buildRegistryKey(attempt.channel, attempt.provider));
    if (!bundle) {
      throw new Error(
        `Missing ${attempt.channel} provider bundle for "${attempt.provider}".`,
      );
    }
    return bundle;
  }

  resolveInbound(
    envelope: CommunicationProviderInboundEnvelope,
  ): CommunicationProviderBundle {
    const bundle = this.bundles.get(buildRegistryKey(envelope.channel, envelope.provider));
    if (!bundle) {
      throw new Error(
        `Missing ${envelope.channel} provider bundle for "${envelope.provider}".`,
      );
    }
    return bundle;
  }

  listDescriptors(): CommunicationProviderDescriptor[] {
    return [...this.bundles.values()].map((bundle) => bundle.descriptor);
  }
}

export class DefaultCommunicationExecutionHooks
  implements CommunicationExecutionHooks
{
  constructor(
    private readonly config: {
      requireApprovalFor?: Array<CommunicationAttempt["channel"]>;
      allowedHours?: Partial<
        Record<
          CommunicationAttempt["channel"],
          { startHour: number; endHour: number }
        >
      >;
    } = {},
  ) {}

  checkAllowedHours(input: {
    attempt: CommunicationAttempt;
    occurredAt: string;
  }): CommunicationExecutionDecision {
    const window = this.config.allowedHours?.[input.attempt.channel];
    if (!window) {
      return { allowed: true, blockedReasons: [] };
    }

    const hour = new Date(input.occurredAt).getUTCHours();
    if (hour < window.startHour || hour >= window.endHour) {
      return {
        allowed: false,
        blockedReasons: ["outside_allowed_hours"],
      };
    }

    return { allowed: true, blockedReasons: [] };
  }

  checkApprovalGate(input: {
    attempt: CommunicationAttempt;
  }): CommunicationExecutionDecision {
    const gatedChannels = this.config.requireApprovalFor ?? [];
    if (
      gatedChannels.includes(input.attempt.channel) &&
      !input.attempt.approvalRequestId
    ) {
      return {
        allowed: false,
        blockedReasons: ["approval_required"],
      };
    }

    return { allowed: true, blockedReasons: [] };
  }

  checkChannelSafety(input: {
    attempt: CommunicationAttempt;
  }): CommunicationExecutionDecision {
    const metadata = input.attempt.metadata;
    const blockedReasons = [...input.attempt.blockedReasons];

    if (input.attempt.channel === "sms" && metadata.optOutExists === true) {
      blockedReasons.push("sms_opt_out");
    }
    if (input.attempt.channel === "call" && metadata.doNotCall === true) {
      blockedReasons.push("do_not_call");
    }
    if (
      input.attempt.channel === "call" &&
      metadata.voiceAutomationMode === "autonomous"
    ) {
      blockedReasons.push("unsafe_voice_automation");
    }

    return {
      allowed: blockedReasons.length === 0,
      blockedReasons: [...new Set(blockedReasons)],
    };
  }
}

export class CommunicationProviderExecutor {
  async executeOutbound(input: {
    attempt: CommunicationAttempt;
    occurredAt: string;
    hooks: CommunicationExecutionHooks;
    emailProvider?: EmailProviderAdapter;
    smsProvider?: SmsProviderAdapter;
    callProvider?: CallProviderAdapter;
  }): Promise<ProviderExecutionResult> {
    const decisions = [
      input.hooks.checkChannelSafety({
        attempt: input.attempt,
      }),
      input.hooks.checkAllowedHours({
        attempt: input.attempt,
        occurredAt: input.occurredAt,
      }),
      input.hooks.checkApprovalGate({
        attempt: input.attempt,
      }),
    ];
    const blockedReasons = [...new Set(decisions.flatMap((decision) => decision.blockedReasons))];

    if (blockedReasons.length > 0) {
      return {
        executed: false,
        blockedReasons,
      };
    }

    switch (input.attempt.channel) {
      case "email": {
        if (!input.emailProvider) {
          throw new Error("Missing email provider adapter.");
        }
        return {
          executed: true,
          blockedReasons: [],
          sendResult: await input.emailProvider.sendEmail({ attempt: input.attempt }),
        };
      }
      case "sms": {
        if (!input.smsProvider) {
          throw new Error("Missing SMS provider adapter.");
        }
        return {
          executed: true,
          blockedReasons: [],
          sendResult: await input.smsProvider.sendSms({ attempt: input.attempt }),
        };
      }
      case "call": {
        if (!input.callProvider) {
          throw new Error("Missing voice provider adapter.");
        }
        return {
          executed: true,
          blockedReasons: [],
          sendResult: await input.callProvider.placeCall({ attempt: input.attempt }),
        };
      }
    }
  }

  async executeOutboundWithRegistry(input: {
    attempt: CommunicationAttempt;
    occurredAt: string;
    hooks: CommunicationExecutionHooks;
    registry: InMemoryCommunicationProviderRegistry;
  }): Promise<ProviderExecutionResult> {
    const bundle = input.registry.resolveForAttempt(input.attempt);

    if (bundle.descriptor.channel === "email") {
      return this.executeOutbound({
        attempt: input.attempt,
        occurredAt: input.occurredAt,
        hooks: input.hooks,
        emailProvider: bundle.adapter as EmailProviderAdapter,
      });
    }

    if (bundle.descriptor.channel === "sms") {
      return this.executeOutbound({
        attempt: input.attempt,
        occurredAt: input.occurredAt,
        hooks: input.hooks,
        smsProvider: bundle.adapter as SmsProviderAdapter,
      });
    }

    return this.executeOutbound({
      attempt: input.attempt,
      occurredAt: input.occurredAt,
      hooks: input.hooks,
      callProvider: bundle.adapter as CallProviderAdapter,
    });
  }
}

export class CommunicationProviderEventIngestionService {
  constructor(
    private readonly normalization = new DeterministicCommunicationOutcomeNormalizationService(),
  ) {}

  ingestEmailPayload(input: {
    attempt: CommunicationAttempt;
    normalizer: EmailProviderPayloadNormalizer;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderInboundProcessingResult<EmailOutcome> {
    const result = input.normalizer.normalizeEmailProviderPayload(input);
    return {
      outcome: result.outcome,
      learningEvents: result.learningEvents,
    };
  }

  ingestSmsPayload(input: {
    attempt: CommunicationAttempt;
    normalizer: SmsProviderPayloadNormalizer;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderInboundProcessingResult<SmsOutcome> {
    const result = input.normalizer.normalizeSmsProviderPayload(input);
    return {
      outcome: result.outcome,
      learningEvents: result.learningEvents,
    };
  }

  ingestCallPayload(input: {
    attempt: CommunicationAttempt;
    normalizer: CallProviderPayloadNormalizer;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }): ProviderInboundProcessingResult<CallOutcome> {
    const result = input.normalizer.normalizeCallProviderPayload(input);
    return {
      outcome: result.outcome,
      learningEvents: result.learningEvents,
    };
  }

  ingestInboundWithRegistry(
    input: {
      attempt: CommunicationAttempt;
      envelope: CommunicationProviderInboundEnvelope;
      registry: InMemoryCommunicationProviderRegistry;
    },
  ): ProviderInboundProcessingResult<EmailOutcome | SmsOutcome | CallOutcome> {
    const bundle = input.registry.resolveInbound(input.envelope);

    if (bundle.descriptor.channel === "email") {
      return this.ingestEmailPayload({
        attempt: input.attempt,
        normalizer: bundle.normalizer as EmailProviderPayloadNormalizer,
        providerPayload: input.envelope.payload,
        occurredAt: input.envelope.occurredAt,
      });
    }

    if (bundle.descriptor.channel === "sms") {
      return this.ingestSmsPayload({
        attempt: input.attempt,
        normalizer: bundle.normalizer as SmsProviderPayloadNormalizer,
        providerPayload: input.envelope.payload,
        occurredAt: input.envelope.occurredAt,
      });
    }

    return this.ingestCallPayload({
      attempt: input.attempt,
      normalizer: bundle.normalizer as CallProviderPayloadNormalizer,
      providerPayload: input.envelope.payload,
      occurredAt: input.envelope.occurredAt,
    });
  }

  toNormalizedBatch(input: {
    envelope: CommunicationProviderInboundEnvelope;
    result: ProviderInboundProcessingResult<EmailOutcome | SmsOutcome | CallOutcome>;
  }): NormalizedCommunicationEventBatch {
    const learningEventIds = input.result.learningEvents.map((event) => event.id);

    if (input.envelope.channel === "email") {
      return {
        channel: "email",
        provider: input.envelope.provider,
        communicationAttemptId: input.result.outcome.communicationAttemptId,
        normalizedAt: input.envelope.occurredAt,
        outcomes: [
          {
            channel: "email",
            outcome: input.result.outcome as EmailOutcome,
          },
        ],
        learningEventIds,
      };
    }

    if (input.envelope.channel === "sms") {
      return {
        channel: "sms",
        provider: input.envelope.provider,
        communicationAttemptId: input.result.outcome.communicationAttemptId,
        normalizedAt: input.envelope.occurredAt,
        outcomes: [
          {
            channel: "sms",
            outcome: input.result.outcome as SmsOutcome,
          },
        ],
        learningEventIds,
      };
    }

    return {
      channel: "call",
      provider: input.envelope.provider,
      communicationAttemptId: input.result.outcome.communicationAttemptId,
      normalizedAt: input.envelope.occurredAt,
      outcomes: [
        {
          channel: "call",
          outcome: input.result.outcome as CallOutcome,
        },
      ],
      learningEventIds,
    };
  }

  protected normalizeEmailEvents(
    attempt: CommunicationAttempt,
    outcome: EmailOutcome,
  ): LearningEvent[] {
    return this.normalization.normalizeEmailOutcome({ attempt, outcome });
  }

  protected normalizeSmsEvents(
    attempt: CommunicationAttempt,
    outcome: SmsOutcome,
  ): LearningEvent[] {
    return this.normalization.normalizeSmsOutcome({ attempt, outcome });
  }

  protected normalizeCallEvents(
    attempt: CommunicationAttempt,
    outcome: CallOutcome,
  ): LearningEvent[] {
    return this.normalization.normalizeCallOutcome({ attempt, outcome });
  }
}

class BaseStubProvider {
  protected toSendResult(input: {
    attempt: CommunicationAttempt;
    providerPrefix: string;
  }): CommunicationProviderSendResult {
    return {
      attemptId: input.attempt.id,
      providerMessageId: `${input.providerPrefix}:${input.attempt.id}`,
      acceptedAt: input.attempt.createdAt,
      metadata: {
        stubbed: true,
      },
    };
  }
}

export class InternalEmailStubAdapter
  extends BaseStubProvider
  implements EmailProviderAdapter, EmailProviderPayloadNormalizer
{
  private readonly normalization = new DeterministicCommunicationOutcomeNormalizationService();

  async sendEmail(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    return this.toSendResult({ attempt: input.attempt, providerPrefix: "internal-email" });
  }

  async createDraft(input: {
    attempt: CommunicationAttempt;
  }): Promise<EmailDraftResult> {
    return {
      attemptId: input.attempt.id,
      providerDraftId: `internal-email-draft:${input.attempt.id}`,
      providerMessageId: `internal-email-message:${input.attempt.id}`,
      providerThreadId: input.attempt.providerThreadId ?? `internal-thread:${input.attempt.id}`,
      providerConversationId:
        input.attempt.providerConversationId ?? `internal-conversation:${input.attempt.id}`,
      createdAt: input.attempt.createdAt,
      metadata: {
        stubbed: true,
      },
    };
  }

  async replyToThread(input: {
    attempt: CommunicationAttempt;
    providerThreadId: string;
    replyToProviderMessageId?: string;
  }): Promise<CommunicationProviderSendResult> {
    return {
      ...this.toSendResult({ attempt: input.attempt, providerPrefix: "internal-email-reply" }),
      providerThreadId: input.providerThreadId,
      providerConversationId:
        input.attempt.providerConversationId ?? `internal-conversation:${input.providerThreadId}`,
      metadata: {
        stubbed: true,
        ...(input.replyToProviderMessageId
          ? { replyToProviderMessageId: input.replyToProviderMessageId }
          : {}),
      },
    };
  }

  async forwardMessage(input: {
    attempt: CommunicationAttempt;
    providerMessageId: string;
  }): Promise<CommunicationProviderSendResult> {
    return {
      ...this.toSendResult({ attempt: input.attempt, providerPrefix: "internal-email-forward" }),
      providerThreadId: input.attempt.providerThreadId ?? `internal-thread:${input.attempt.id}`,
      providerConversationId:
        input.attempt.providerConversationId ?? `internal-conversation:${input.attempt.id}`,
      metadata: {
        stubbed: true,
        forwardedProviderMessageId: input.providerMessageId,
      },
    };
  }

  async fetchDeliveryStatus(_input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]> {
    return [];
  }

  async fetchReplyMetadata(input: {
    providerMessageId: string;
  }): Promise<EmailReplyMetadata[]> {
    return [
      {
        providerMessageId: input.providerMessageId,
        providerThreadId: `internal-thread:${input.providerMessageId}`,
        providerConversationId: `internal-conversation:${input.providerMessageId}`,
        metadata: {
          stubbed: true,
        },
      },
    ];
  }

  async fetchOpenEvents(_input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]> {
    return [];
  }

  async fetchBounceFailureMetadata(input: {
    providerMessageId: string;
  }): Promise<EmailFailureMetadata[]> {
    void input;
    return [];
  }

  normalizeEmailProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }) {
    const outcome = createEmailOutcome({
      id: `email_outcome:${input.attempt.id}:${input.occurredAt}`,
      ...(input.attempt.tenantId ? { tenantId: input.attempt.tenantId } : {}),
      communicationAttemptId: input.attempt.id,
      occurredAt: input.occurredAt,
      delivered: readBoolean(input.providerPayload, "delivered") ?? true,
      opened: readBoolean(input.providerPayload, "opened") ?? false,
      replied: readBoolean(input.providerPayload, "replied") ?? false,
      bounced: readBoolean(input.providerPayload, "bounced") ?? false,
      linkClicked: readBoolean(input.providerPayload, "linkClicked") ?? false,
      attachmentsSent: readStringArray(input.providerPayload, "attachmentsSent"),
      docsRequested: readBoolean(input.providerPayload, "docsRequested") ?? false,
      extractedRemittanceSignal:
        readBoolean(input.providerPayload, "extractedRemittanceSignal") ?? false,
      metadata: {
        stubbed: true,
      },
    });

    return {
      outcome,
      learningEvents: this.normalization.normalizeEmailOutcome({
        attempt: input.attempt,
        outcome,
      }),
    };
  }
}

export class GmailApiStubAdapter extends InternalEmailStubAdapter {
  async sendEmail(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    return {
      ...this.toSendResult({ attempt: input.attempt, providerPrefix: "gmail-message" }),
      providerThreadId: input.attempt.providerThreadId ?? `gmail-thread:${input.attempt.id}`,
      providerConversationId:
        input.attempt.providerConversationId ?? `gmail-conversation:${input.attempt.id}`,
      metadata: {
        stubbed: true,
        provider: "gmail",
      },
    };
  }
}

export class MicrosoftGraphEmailStubAdapter extends InternalEmailStubAdapter {
  async sendEmail(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    return {
      ...this.toSendResult({ attempt: input.attempt, providerPrefix: "microsoft-graph-message" }),
      providerThreadId:
        input.attempt.providerThreadId ?? `microsoft-graph-thread:${input.attempt.id}`,
      providerConversationId:
        input.attempt.providerConversationId ??
        `microsoft-graph-conversation:${input.attempt.id}`,
      metadata: {
        stubbed: true,
        provider: "microsoft_graph",
      },
    };
  }
}

export class TwilioSmsStubAdapter
  extends BaseStubProvider
  implements SmsProviderAdapter, SmsProviderPayloadNormalizer
{
  private readonly normalization = new DeterministicCommunicationOutcomeNormalizationService();

  async sendSms(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    return this.toSendResult({ attempt: input.attempt, providerPrefix: "twilio-sms" });
  }

  async fetchDeliveryStatus(): Promise<SmsOutcome[]> {
    return [];
  }

  async receiveInboundSms(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<SmsOutcome> {
    return createSmsOutcome({
      id: `sms_outcome:twilio:${String(input.providerPayload.messageSid ?? "unknown")}`,
      communicationAttemptId: String(input.providerPayload.communicationAttemptId ?? "unknown"),
      occurredAt: String(input.providerPayload.occurredAt ?? new Date().toISOString()),
      delivered: readBoolean(input.providerPayload, "delivered") ?? false,
      replied: readBoolean(input.providerPayload, "replied") ?? true,
      clicked: readBoolean(input.providerPayload, "clicked") ?? false,
      optOutReceived: readBoolean(input.providerPayload, "optOutReceived") ?? false,
      extractedRemittanceSignal:
        readBoolean(input.providerPayload, "extractedRemittanceSignal") ?? false,
      metadata: { provider: "twilio", stubbed: true },
    });
  }

  async fetchClickEvents(): Promise<SmsOutcome[]> {
    return [];
  }

  async markOptOut(): Promise<void> {
    return;
  }

  normalizeSmsProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }) {
    const outcome = createSmsOutcome({
      id: `sms_outcome:${input.attempt.id}:${input.occurredAt}`,
      ...(input.attempt.tenantId ? { tenantId: input.attempt.tenantId } : {}),
      communicationAttemptId: input.attempt.id,
      occurredAt: input.occurredAt,
      delivered: readBoolean(input.providerPayload, "delivered") ?? false,
      replied: readBoolean(input.providerPayload, "replied") ?? false,
      clicked: readBoolean(input.providerPayload, "clicked") ?? false,
      optOutReceived: readBoolean(input.providerPayload, "optOutReceived") ?? false,
      extractedRemittanceSignal:
        readBoolean(input.providerPayload, "extractedRemittanceSignal") ?? false,
      metadata: { provider: "twilio", stubbed: true },
    });

    return {
      outcome,
      learningEvents: this.normalization.normalizeSmsOutcome({
        attempt: input.attempt,
        outcome,
      }),
    };
  }
}

abstract class BaseVoiceStubAdapter
  extends BaseStubProvider
  implements CallProviderAdapter, CallProviderPayloadNormalizer
{
  private readonly normalization = new DeterministicCommunicationOutcomeNormalizationService();

  constructor(private readonly providerKey: "vapi" | "retell" | "elevenlabs" | "twilio") {
    super();
  }

  async placeCall(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    return this.toSendResult({
      attempt: input.attempt,
      providerPrefix: `${this.providerKey}-voice`,
    });
  }

  async receiveCallStatus(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome> {
    return this.buildCallOutcome(String(input.providerPayload.communicationAttemptId ?? "unknown"), {
      occurredAt: String(input.providerPayload.occurredAt ?? new Date().toISOString()),
      providerPayload: input.providerPayload,
    });
  }

  async receiveTranscript(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome> {
    return this.buildCallOutcome(String(input.providerPayload.communicationAttemptId ?? "unknown"), {
      occurredAt: String(input.providerPayload.occurredAt ?? new Date().toISOString()),
      providerPayload: input.providerPayload,
    });
  }

  async receiveDisposition(input: {
    providerPayload: Record<string, unknown>;
  }): Promise<CallOutcome> {
    return this.buildCallOutcome(String(input.providerPayload.communicationAttemptId ?? "unknown"), {
      occurredAt: String(input.providerPayload.occurredAt ?? new Date().toISOString()),
      providerPayload: input.providerPayload,
    });
  }

  async fetchRecordingMetadata(): Promise<Record<string, unknown>> {
    return { provider: this.providerKey, stubbed: true };
  }

  async terminateCall(): Promise<void> {
    return;
  }

  normalizeCallProviderPayload(input: {
    attempt: CommunicationAttempt;
    providerPayload: Record<string, unknown>;
    occurredAt: string;
  }) {
    const outcome = this.buildCallOutcome(input.attempt.id, {
      occurredAt: input.occurredAt,
      providerPayload: input.providerPayload,
      tenantId: input.attempt.tenantId,
    });

    return {
      outcome,
      learningEvents: this.normalization.normalizeCallOutcome({
        attempt: input.attempt,
        outcome,
      }),
    };
  }

  private buildCallOutcome(
    communicationAttemptId: string,
    input: {
      occurredAt: string;
      providerPayload: Record<string, unknown>;
      tenantId?: string;
    },
  ): CallOutcome {
    return createCallOutcome({
      id: `call_outcome:${this.providerKey}:${communicationAttemptId}:${input.occurredAt}`,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      communicationAttemptId,
      occurredAt: input.occurredAt,
      answered: readBoolean(input.providerPayload, "answered") ?? false,
      disposition: readCallDisposition(input.providerPayload.disposition),
      ...(readNumber(input.providerPayload, "durationSeconds") !== undefined
        ? { durationSeconds: readNumber(input.providerPayload, "durationSeconds") }
        : {}),
      ...(readNumber(input.providerPayload, "promisedAmountCents") !== undefined
        ? { promisedAmountCents: readNumber(input.providerPayload, "promisedAmountCents") }
        : {}),
      ...(readString(input.providerPayload, "promisedDate")
        ? { promisedDate: readString(input.providerPayload, "promisedDate") }
        : {}),
      ...(readString(input.providerPayload, "transcriptUri")
        ? { transcriptUri: readString(input.providerPayload, "transcriptUri") }
        : {}),
      ...(readString(input.providerPayload, "transcriptSummary")
        ? { transcriptSummary: readString(input.providerPayload, "transcriptSummary") }
        : {}),
      transcriptSegments: readTranscriptSegments(input.providerPayload.transcriptSegments),
      ...(readSentiment(input.providerPayload.sentimentLabel)
        ? { sentimentLabel: readSentiment(input.providerPayload.sentimentLabel) }
        : {}),
      operatorReviewRequired:
        readBoolean(input.providerPayload, "operatorReviewRequired") ?? true,
      metadata: { provider: this.providerKey, stubbed: true },
    });
  }
}

export class TwilioVoiceStubAdapter extends BaseVoiceStubAdapter {
  constructor() {
    super("twilio");
  }
}

export class VapiVoiceStubAdapter extends BaseVoiceStubAdapter {
  constructor() {
    super("vapi");
  }
}

export class RetellVoiceStubAdapter extends BaseVoiceStubAdapter {
  constructor() {
    super("retell");
  }
}

export class ElevenLabsVoiceStubAdapter extends BaseVoiceStubAdapter {
  constructor() {
    super("elevenlabs");
  }
}

export function createCommunicationProviderDescriptor<
  TChannel extends CommunicationAttempt["channel"],
  TMaturity extends CommunicationProviderMaturity,
>(input: {
  channel: TChannel;
  provider: CommunicationAttempt["provider"];
  displayName: string;
  maturity: TMaturity;
}): CommunicationProviderDescriptor & {
  channel: TChannel;
  maturity: TMaturity;
} {
  return {
    channel: input.channel,
    provider: input.provider,
    displayName: input.displayName,
    maturity: input.maturity,
    supportsOutboundSend: true,
    supportsInboundEvents: true,
    supportsTranscriptIngestion: input.channel === "call",
    requiresVerifiedRecipient: true,
    allowsAutonomousNegotiation: false,
  };
}

export function createDefaultCommunicationProviderRegistry(input?: {
  gmailAdapter?: EmailProviderAdapter & EmailProviderPayloadNormalizer;
  microsoftGraphAdapter?: EmailProviderAdapter & EmailProviderPayloadNormalizer;
  internalEmailAdapter?: EmailProviderAdapter & EmailProviderPayloadNormalizer;
}): InMemoryCommunicationProviderRegistry {
  return new InMemoryCommunicationProviderRegistry()
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "email",
        provider: "internal",
        displayName: "Internal Email",
        maturity: "email_complete",
      }),
      adapter: input?.internalEmailAdapter ?? new InternalEmailStubAdapter(),
      normalizer: input?.internalEmailAdapter ?? new InternalEmailStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "email",
        provider: "gmail",
        displayName: "Gmail API",
        maturity: "email_complete",
      }),
      adapter: input?.gmailAdapter ?? new GmailApiStubAdapter(),
      normalizer: input?.gmailAdapter ?? new GmailApiStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "email",
        provider: "microsoft_graph",
        displayName: "Microsoft Graph Mail",
        maturity: "email_complete",
      }),
      adapter: input?.microsoftGraphAdapter ?? new MicrosoftGraphEmailStubAdapter(),
      normalizer: input?.microsoftGraphAdapter ?? new MicrosoftGraphEmailStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "sms",
        provider: "twilio",
        displayName: "Twilio SMS",
        maturity: "sms_ready",
      }),
      adapter: new TwilioSmsStubAdapter(),
      normalizer: new TwilioSmsStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "call",
        provider: "twilio",
        displayName: "Twilio Voice",
        maturity: "voice_ready",
      }),
      adapter: new TwilioVoiceStubAdapter(),
      normalizer: new TwilioVoiceStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "call",
        provider: "vapi",
        displayName: "Vapi Voice",
        maturity: "voice_ready",
      }),
      adapter: new VapiVoiceStubAdapter(),
      normalizer: new VapiVoiceStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "call",
        provider: "retell",
        displayName: "Retell Voice",
        maturity: "voice_ready",
      }),
      adapter: new RetellVoiceStubAdapter(),
      normalizer: new RetellVoiceStubAdapter(),
    })
    .register({
      descriptor: createCommunicationProviderDescriptor({
        channel: "call",
        provider: "elevenlabs",
        displayName: "ElevenLabs Voice",
        maturity: "voice_ready",
      }),
      adapter: new ElevenLabsVoiceStubAdapter(),
      normalizer: new ElevenLabsVoiceStubAdapter(),
    });
}

function buildRegistryKey(
  channel: CommunicationAttempt["channel"],
  provider: CommunicationAttempt["provider"],
): string {
  return `${channel}:${provider}`;
}

function readBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

function readStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readCallDisposition(value: unknown): CallOutcome["disposition"] {
  return value === "connected" ||
    value === "missed" ||
    value === "voicemail_left" ||
    value === "wrong_contact" ||
    value === "callback_requested" ||
    value === "operator_review_required"
    ? value
    : "operator_review_required";
}

function readSentiment(value: unknown): CallOutcome["sentimentLabel"] | undefined {
  return value === "positive" || value === "neutral" || value === "negative"
    ? value
    : undefined;
}

function readTranscriptSegments(
  value: unknown,
): CallOutcome["transcriptSegments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((segment) => {
      if (!segment || typeof segment !== "object") {
        return undefined;
      }
      const entry = segment as Record<string, unknown>;
      const text = typeof entry.text === "string" ? entry.text : undefined;
      if (!text) {
        return undefined;
      }
      return {
        speaker:
          entry.speaker === "agent" ||
          entry.speaker === "customer" ||
          entry.speaker === "unknown"
            ? entry.speaker
            : "unknown",
        ...(typeof entry.startedAtSeconds === "number"
          ? { startedAtSeconds: entry.startedAtSeconds }
          : {}),
        text,
      };
    })
    .filter((segment): segment is CallOutcome["transcriptSegments"][number] => Boolean(segment));
}
