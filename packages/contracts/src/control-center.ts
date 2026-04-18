import type {
  OutreachContextExplanation,
  OutreachEmailDraft,
  OutreachPolicyDecision,
  OutreachSmsDraft,
  VoiceAgentContextPayload,
} from "./collections/outreach.js";

export interface ControlCenterWorkflow {
  id: string;
  tenantId: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  category: "collections" | "payments";
  name: string;
  enabled: boolean;
  senderIdentityId?: string;
  senderEmail?: string;
  testEmailRecipient?: string;
  testCallRecipient?: string;
  timezone: string;
  outreachWindowStart: string;
  outreachWindowEnd: string;
  outreachDays: Array<
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  >;
  weekendCallingEnabled: boolean;
  stageCount: number;
  metadata: Record<string, unknown>;
}

export interface ControlCenterStage {
  id: string;
  tenantId?: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  workflowId: string;
  order: number;
  outreachType: "email" | "call" | "sms";
  triggerType:
    | "relative_due_date"
    | "promise_to_pay_state"
    | "payment_signal_state"
    | "response_gap"
    | "manual_operator_trigger";
  triggerConfig: {
    comparator?:
      | "due_in_days"
      | "due_today"
      | "days_past_due"
      | "promise_missed"
      | "remittance_missing_after_payment"
      | "no_response_after_prior_stage"
      | "manual";
    offsetDays?: number;
    referenceStageId?: string;
    paymentSignalType?: "payment_detected" | "remittance_missing";
    promiseState?: "accepted" | "due_today" | "broken";
    metadata?: Record<string, unknown>;
  };
  templateMode: "pre_saved_template" | "ai_generated";
  templateId?: string;
  aiStrategyId?: string;
  notes: string;
  enabled: boolean;
  requiresApproval: boolean;
  riskHints: string[];
}

export interface ControlCenterEmailTemplate {
  id: string;
  tenantId: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  folderId?: string;
  subject: string;
  body: string;
  ccEmails: string[];
  channelCompatibility: Array<"email" | "sms" | "voice_agent">;
  autoCorrectEnabled: boolean;
  isDefault: boolean;
  isArchived: boolean;
  previewSeedKey?: string;
}

export interface ControlCenterTemplateFolder {
  id: string;
  tenantId: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  name: string;
}

export interface ControlCenterCallAgentConfig {
  id: string;
  tenantId: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  phoneNumber: string;
  smsEnabled: boolean;
  outboundCallingEnabled: boolean;
  humanSupportNumber?: string;
  handoffToHumanEnabled: boolean;
  manualAgentInstructions: string;
  overrideOpeningLine?: string;
  callRecordingDisclaimerEnabled: boolean;
  providerType?: "retell" | "other";
  providerConfigMetadata: Record<string, unknown>;
  defaultBehaviorFlags: string[];
}

export interface ControlCenterConfig {
  id: string;
  tenantId: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  defaultTimezone: string;
  defaultSenderBehavior: "preferred_identity" | "workflow_specific" | "manual_selection";
  allowedChannels: Array<"email" | "sms" | "call">;
  channelFallbackPolicy: "none" | "same_day_safe_fallback" | "manual_review_only";
  sandboxMode: "off" | "test_recipients_only" | "audit_preview_only";
  defaultRiskApprovalMode: "standard" | "strict";
  seededDemoFlags: Record<string, boolean>;
}

export interface ControlCenterWorkflowListItem extends ControlCenterWorkflow {
  approxTargetCount: number;
  stages: ControlCenterStage[];
}

export interface ControlCenterTemplatePreview {
  subject: string;
  body: string;
  sampleVariables: Record<string, string>;
}

export interface ControlCenterStagePreview {
  stageId?: string;
  summary: string;
  validation: {
    valid: boolean;
    issues: string[];
    warnings: string[];
  };
  triggerSummary: string;
}

export interface ControlCenterGeneratedStageContent {
  channel: "email" | "sms" | "voice_agent";
  retrievedContext: OutreachContextExplanation;
  policy: OutreachPolicyDecision;
  emailDraft?: OutreachEmailDraft;
  smsDraft?: OutreachSmsDraft;
  voicePayload?: VoiceAgentContextPayload;
}

export interface ControlCenterCallAgentProviderPreview {
  providerType: "retell" | "other";
  readyForHandoff: boolean;
  payload: Record<string, unknown>;
}

export interface ControlCenterConsoleData {
  workflows: ControlCenterWorkflowListItem[];
  templates: ControlCenterEmailTemplate[];
  folders: ControlCenterTemplateFolder[];
  callAgentConfig: ControlCenterCallAgentConfig;
  config: ControlCenterConfig;
  generationPreview: {
    email: ControlCenterGeneratedStageContent;
    sms: ControlCenterGeneratedStageContent;
    voice: ControlCenterGeneratedStageContent;
  };
  providerPreview: ControlCenterCallAgentProviderPreview;
}

export interface ControlCenterListWorkflowsResponse {
  workflows: ControlCenterWorkflowListItem[];
}

export interface ControlCenterWorkflowDetailResponse {
  workflow: ControlCenterWorkflow;
  stages: ControlCenterStage[];
}

export interface ControlCenterListTemplatesResponse {
  templates: ControlCenterEmailTemplate[];
  folders: ControlCenterTemplateFolder[];
}

export interface ControlCenterTemplatePreviewResponse {
  template: ControlCenterEmailTemplate;
  preview: ControlCenterTemplatePreview;
}
