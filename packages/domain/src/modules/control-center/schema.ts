import type { DomainEntity } from "../../shared/types.js";

export const controlCenterWorkflowCategories = ["collections", "payments"] as const;
export type ControlCenterWorkflowCategory = (typeof controlCenterWorkflowCategories)[number];

export const controlCenterOutreachTypes = ["email", "call", "sms"] as const;
export type ControlCenterOutreachType = (typeof controlCenterOutreachTypes)[number];

export const controlCenterTemplateModes = ["pre_saved_template", "ai_generated"] as const;
export type ControlCenterTemplateMode = (typeof controlCenterTemplateModes)[number];

export const controlCenterTriggerTypes = [
  "relative_due_date",
  "promise_to_pay_state",
  "payment_signal_state",
  "response_gap",
  "manual_operator_trigger",
] as const;
export type ControlCenterTriggerType = (typeof controlCenterTriggerTypes)[number];

export const controlCenterAiStrategyChannels = ["email", "sms", "voice_agent"] as const;
export type ControlCenterAiStrategyChannel = (typeof controlCenterAiStrategyChannels)[number];

export type ControlCenterWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface ControlCenterTriggerConfig {
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
}

export interface ControlCenterAIContentStrategy extends DomainEntity {
  tenantId: string;
  name: string;
  channel: ControlCenterAiStrategyChannel;
  intent: string;
  policyNotes: string[];
  metadata: Record<string, unknown>;
}

export interface ControlCenterStage extends DomainEntity {
  workflowId: string;
  order: number;
  outreachType: ControlCenterOutreachType;
  triggerType: ControlCenterTriggerType;
  triggerConfig: ControlCenterTriggerConfig;
  templateMode: ControlCenterTemplateMode;
  templateId?: string;
  aiStrategyId?: string;
  notes: string;
  enabled: boolean;
  requiresApproval: boolean;
  riskHints: string[];
}

export interface ControlCenterWorkflow extends DomainEntity {
  tenantId: string;
  category: ControlCenterWorkflowCategory;
  name: string;
  enabled: boolean;
  senderIdentityId?: string;
  senderEmail?: string;
  testEmailRecipient?: string;
  testCallRecipient?: string;
  timezone: string;
  outreachWindowStart: string;
  outreachWindowEnd: string;
  outreachDays: ControlCenterWeekday[];
  weekendCallingEnabled: boolean;
  stageCount: number;
  metadata: Record<string, unknown>;
}

export interface ControlCenterTemplateFolder extends DomainEntity {
  tenantId: string;
  name: string;
}

export interface ControlCenterEmailTemplate extends DomainEntity {
  tenantId: string;
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

export interface ControlCenterCallAgentConfig extends DomainEntity {
  tenantId: string;
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

export interface ControlCenterConfig extends DomainEntity {
  tenantId: string;
  defaultTimezone: string;
  defaultSenderBehavior: "preferred_identity" | "workflow_specific" | "manual_selection";
  allowedChannels: Array<"email" | "sms" | "call">;
  channelFallbackPolicy: "none" | "same_day_safe_fallback" | "manual_review_only";
  sandboxMode: "off" | "test_recipients_only" | "audit_preview_only";
  defaultRiskApprovalMode: "standard" | "strict";
  seededDemoFlags: Record<string, boolean>;
}

export interface ControlCenterStageValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export const controlCenterSchema = {
  workflow: "control_center_workflows",
  stage: "control_center_stages",
  template: "control_center_email_templates",
  folder: "control_center_template_folders",
  callAgentConfig: "control_center_call_agent_configs",
  config: "control_center_configs",
} as const;
