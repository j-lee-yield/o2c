import type {
  CallOutcomePayload,
  CommunicationChannel,
  CommunicationProvider,
  EmailOutcomePayload,
  SmsOutcomePayload,
} from "./communications.js";

export type CommunicationProviderMaturity =
  | "email_complete"
  | "sms_ready"
  | "voice_ready";

export interface CommunicationProviderDescriptor {
  channel: CommunicationChannel;
  provider: CommunicationProvider;
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
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  providerEventType: string;
  communicationAttemptId?: string;
  providerMessageId?: string;
  occurredAt: string;
  payload: TPayload;
}

export type NormalizedCommunicationOutcomePayload =
  | {
      channel: "email";
      outcome: EmailOutcomePayload;
    }
  | {
      channel: "sms";
      outcome: SmsOutcomePayload;
    }
  | {
      channel: "call";
      outcome: CallOutcomePayload;
    };

export interface NormalizedCommunicationEventBatch {
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  communicationAttemptId: string;
  normalizedAt: string;
  outcomes: NormalizedCommunicationOutcomePayload[];
  learningEventIds: string[];
}
