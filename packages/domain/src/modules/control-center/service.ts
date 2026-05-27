import { createEntityMetadata, evolveEntityMetadata, type ActorContext } from "../../shared/types.js";
import type {
  ControlCenterCallAgentConfig,
  ControlCenterConfig,
  ControlCenterWorkflowDecision,
  ControlCenterWorkflowExecution,
  ControlCenterEmailTemplate,
  ControlCenterStage,
  ControlCenterStageValidationResult,
  ControlCenterTemplateFolder,
  ControlCenterWorkflow,
  ControlCenterWorkflowCategory,
} from "./schema.js";

export function createControlCenterWorkflow(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  name: string;
  category: ControlCenterWorkflowCategory;
  enabled?: boolean;
  senderIdentityId?: string;
  senderEmail?: string;
  testEmailRecipient?: string;
  testCallRecipient?: string;
  timezone: string;
  outreachWindowStart: string;
  outreachWindowEnd: string;
  outreachDays: ControlCenterWorkflow["outreachDays"];
  weekendCallingEnabled?: boolean;
  metadata?: Record<string, unknown>;
}): ControlCenterWorkflow {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    category: input.category,
    name: input.name.trim(),
    enabled: input.enabled ?? false,
    ...(input.senderIdentityId ? { senderIdentityId: input.senderIdentityId } : {}),
    ...(input.senderEmail ? { senderEmail: input.senderEmail } : {}),
    ...(input.testEmailRecipient ? { testEmailRecipient: input.testEmailRecipient } : {}),
    ...(input.testCallRecipient ? { testCallRecipient: input.testCallRecipient } : {}),
    timezone: input.timezone,
    outreachWindowStart: input.outreachWindowStart,
    outreachWindowEnd: input.outreachWindowEnd,
    outreachDays: [...input.outreachDays],
    weekendCallingEnabled: input.weekendCallingEnabled ?? false,
    stageCount: 0,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function createControlCenterWorkflowExecution(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  workflowId: string;
  billingAccountId: string;
  parentAccountId: string;
  currentTrack?: ControlCenterWorkflowExecution["currentTrack"];
  status?: ControlCenterWorkflowExecution["status"];
  requiresHumanReview?: boolean;
  effectiveUntil?: string;
  rationaleSummary?: string;
  reasoningMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ControlCenterWorkflowExecution {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    billingAccountId: input.billingAccountId,
    parentAccountId: input.parentAccountId,
    status: input.status ?? "active",
    currentTrack: input.currentTrack ?? "standard_reminders",
    requiresHumanReview: input.requiresHumanReview ?? false,
    ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
    ...(input.rationaleSummary ? { rationaleSummary: input.rationaleSummary } : {}),
    reasoningMetadata: { ...(input.reasoningMetadata ?? {}) },
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function updateControlCenterWorkflow(
  workflow: ControlCenterWorkflow,
  input: {
    actor: ActorContext;
    at: string;
    name?: string;
    category?: ControlCenterWorkflowCategory;
    enabled?: boolean;
    senderIdentityId?: string | null;
    senderEmail?: string | null;
    testEmailRecipient?: string | null;
    testCallRecipient?: string | null;
    timezone?: string;
    outreachWindowStart?: string;
    outreachWindowEnd?: string;
    outreachDays?: ControlCenterWorkflow["outreachDays"];
    weekendCallingEnabled?: boolean;
    stageCount?: number;
    metadata?: Record<string, unknown>;
  },
): ControlCenterWorkflow {
  const updated: ControlCenterWorkflow = {
    ...workflow,
    ...evolveEntityMetadata(workflow, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.outreachWindowStart !== undefined
      ? { outreachWindowStart: input.outreachWindowStart }
      : {}),
    ...(input.outreachWindowEnd !== undefined ? { outreachWindowEnd: input.outreachWindowEnd } : {}),
    ...(input.outreachDays !== undefined ? { outreachDays: [...input.outreachDays] } : {}),
    ...(input.weekendCallingEnabled !== undefined
      ? { weekendCallingEnabled: input.weekendCallingEnabled }
      : {}),
    ...(input.stageCount !== undefined ? { stageCount: input.stageCount } : {}),
    ...(input.metadata !== undefined ? { metadata: { ...input.metadata } } : {}),
  };

  assignOptionalString(updated, "senderIdentityId", input.senderIdentityId);
  assignOptionalString(updated, "senderEmail", input.senderEmail);
  assignOptionalString(updated, "testEmailRecipient", input.testEmailRecipient);
  assignOptionalString(updated, "testCallRecipient", input.testCallRecipient);
  return updated;
}

export function applyControlCenterWorkflowDecision(
  execution: ControlCenterWorkflowExecution,
  input: {
    actor: ActorContext;
    at: string;
    decision: ControlCenterWorkflowDecision;
    metadata?: Record<string, unknown>;
  },
): ControlCenterWorkflowExecution {
  const preserveLockedState =
    input.decision.action === "continue" && input.decision.reason === "manual_lock_active";
  const nextStatus = nextExecutionStatus(execution, input.decision);
  const nextEffectiveUntil =
    input.decision.action === "pause"
      ? input.decision.effectiveUntil
      : preserveLockedState
        ? execution.effectiveUntil
        : undefined;
  const { effectiveUntil: _priorEffectiveUntil, ...executionWithoutPauseWindow } = execution;

  return {
    ...executionWithoutPauseWindow,
    ...evolveEntityMetadata(execution, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    status: nextStatus,
    currentTrack: input.decision.targetTrack ?? execution.currentTrack,
    lastDecisionAction: input.decision.action,
    lastDecisionReason: input.decision.reason,
    lastDecisionConfidence: input.decision.confidence,
    requiresHumanReview: input.decision.requiresHumanReview,
    ...(nextEffectiveUntil ? { effectiveUntil: nextEffectiveUntil } : {}),
    ...(input.decision.rationaleSummary
      ? { rationaleSummary: input.decision.rationaleSummary }
      : {}),
    reasoningMetadata: { ...input.decision.reasoningMetadata },
    metadata: {
      ...execution.metadata,
      ...(input.metadata ?? {}),
    },
  };
}

export function createControlCenterStage(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  workflowId: string;
  order: number;
  outreachType: ControlCenterStage["outreachType"];
  triggerType: ControlCenterStage["triggerType"];
  triggerConfig: ControlCenterStage["triggerConfig"];
  templateMode: ControlCenterStage["templateMode"];
  templateId?: string;
  aiStrategyId?: string;
  notes?: string;
  enabled?: boolean;
  requiresApproval?: boolean;
  riskHints?: string[];
}): ControlCenterStage {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    workflowId: input.workflowId,
    order: input.order,
    outreachType: input.outreachType,
    triggerType: input.triggerType,
    triggerConfig: { ...input.triggerConfig },
    templateMode: input.templateMode,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.aiStrategyId ? { aiStrategyId: input.aiStrategyId } : {}),
    notes: input.notes?.trim() ?? "",
    enabled: input.enabled ?? true,
    requiresApproval: input.requiresApproval ?? false,
    riskHints: [...(input.riskHints ?? [])],
  };
}

export function updateControlCenterStage(
  stage: ControlCenterStage,
  input: {
    actor: ActorContext;
    at: string;
    order?: number;
    outreachType?: ControlCenterStage["outreachType"];
    triggerType?: ControlCenterStage["triggerType"];
    triggerConfig?: ControlCenterStage["triggerConfig"];
    templateMode?: ControlCenterStage["templateMode"];
    templateId?: string | null;
    aiStrategyId?: string | null;
    notes?: string;
    enabled?: boolean;
    requiresApproval?: boolean;
    riskHints?: string[];
  },
): ControlCenterStage {
  const updated: ControlCenterStage = {
    ...stage,
    ...evolveEntityMetadata(stage, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.outreachType !== undefined ? { outreachType: input.outreachType } : {}),
    ...(input.triggerType !== undefined ? { triggerType: input.triggerType } : {}),
    ...(input.triggerConfig !== undefined ? { triggerConfig: { ...input.triggerConfig } } : {}),
    ...(input.templateMode !== undefined ? { templateMode: input.templateMode } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.requiresApproval !== undefined ? { requiresApproval: input.requiresApproval } : {}),
    ...(input.riskHints !== undefined ? { riskHints: [...input.riskHints] } : {}),
  };
  assignOptionalString(updated, "templateId", input.templateId);
  assignOptionalString(updated, "aiStrategyId", input.aiStrategyId);
  return updated;
}

export function validateControlCenterStage(stage: Pick<
  ControlCenterStage,
  "outreachType" | "templateMode" | "templateId" | "aiStrategyId" | "triggerConfig"
>): ControlCenterStageValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (stage.templateMode === "pre_saved_template" && !stage.templateId) {
    issues.push("A pre-saved template stage must reference a template.");
  }

  if (stage.templateMode === "ai_generated" && !stage.aiStrategyId) {
    issues.push("An AI-generated stage must reference an AI strategy.");
  }

  if (stage.outreachType === "call" && stage.templateMode === "pre_saved_template") {
    warnings.push("Call stages use the saved template as agent context, not a verbatim script.");
  }

  if (
    stage.triggerConfig.comparator === "no_response_after_prior_stage" &&
    !stage.triggerConfig.referenceStageId
  ) {
    issues.push("No-response triggers must reference a prior stage.");
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export function createTemplateFolder(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  name: string;
}): ControlCenterTemplateFolder {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    name: input.name.trim(),
  };
}

export function createEmailTemplate(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  name: string;
  folderId?: string;
  subject: string;
  body: string;
  ccEmails?: string[];
  channelCompatibility: ControlCenterEmailTemplate["channelCompatibility"];
  autoCorrectEnabled?: boolean;
  isDefault?: boolean;
  isArchived?: boolean;
  previewSeedKey?: string;
}): ControlCenterEmailTemplate {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    name: input.name.trim(),
    ...(input.folderId ? { folderId: input.folderId } : {}),
    subject: input.subject,
    body: input.body,
    ccEmails: [...(input.ccEmails ?? [])],
    channelCompatibility: [...input.channelCompatibility],
    autoCorrectEnabled: input.autoCorrectEnabled ?? true,
    isDefault: input.isDefault ?? false,
    isArchived: input.isArchived ?? false,
    ...(input.previewSeedKey ? { previewSeedKey: input.previewSeedKey } : {}),
  };
}

export function updateEmailTemplate(
  template: ControlCenterEmailTemplate,
  input: {
    actor: ActorContext;
    at: string;
    name?: string;
    folderId?: string | null;
    subject?: string;
    body?: string;
    ccEmails?: string[];
    channelCompatibility?: ControlCenterEmailTemplate["channelCompatibility"];
    autoCorrectEnabled?: boolean;
    isDefault?: boolean;
    isArchived?: boolean;
    previewSeedKey?: string | null;
  },
): ControlCenterEmailTemplate {
  const updated: ControlCenterEmailTemplate = {
    ...template,
    ...evolveEntityMetadata(template, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.ccEmails !== undefined ? { ccEmails: [...input.ccEmails] } : {}),
    ...(input.channelCompatibility !== undefined
      ? { channelCompatibility: [...input.channelCompatibility] }
      : {}),
    ...(input.autoCorrectEnabled !== undefined
      ? { autoCorrectEnabled: input.autoCorrectEnabled }
      : {}),
    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
  };
  assignOptionalString(updated, "folderId", input.folderId);
  assignOptionalString(updated, "previewSeedKey", input.previewSeedKey);
  return updated;
}

export function createCallAgentConfig(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  phoneNumber: string;
  smsEnabled: boolean;
  outboundCallingEnabled: boolean;
  humanSupportNumber?: string;
  handoffToHumanEnabled: boolean;
  manualAgentInstructions: string;
  overrideOpeningLine?: string;
  callRecordingDisclaimerEnabled: boolean;
  providerType?: "retell" | "other";
  providerConfigMetadata?: Record<string, unknown>;
  defaultBehaviorFlags?: string[];
}): ControlCenterCallAgentConfig {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    phoneNumber: input.phoneNumber,
    smsEnabled: input.smsEnabled,
    outboundCallingEnabled: input.outboundCallingEnabled,
    ...(input.humanSupportNumber ? { humanSupportNumber: input.humanSupportNumber } : {}),
    handoffToHumanEnabled: input.handoffToHumanEnabled,
    manualAgentInstructions: input.manualAgentInstructions,
    ...(input.overrideOpeningLine ? { overrideOpeningLine: input.overrideOpeningLine } : {}),
    callRecordingDisclaimerEnabled: input.callRecordingDisclaimerEnabled,
    ...(input.providerType ? { providerType: input.providerType } : {}),
    providerConfigMetadata: { ...(input.providerConfigMetadata ?? {}) },
    defaultBehaviorFlags: [...(input.defaultBehaviorFlags ?? [])],
  };
}

export function updateCallAgentConfig(
  config: ControlCenterCallAgentConfig,
  input: {
    actor: ActorContext;
    at: string;
    phoneNumber?: string;
    smsEnabled?: boolean;
    outboundCallingEnabled?: boolean;
    humanSupportNumber?: string | null;
    handoffToHumanEnabled?: boolean;
    manualAgentInstructions?: string;
    overrideOpeningLine?: string | null;
    callRecordingDisclaimerEnabled?: boolean;
    providerType?: "retell" | "other" | null;
    providerConfigMetadata?: Record<string, unknown>;
    defaultBehaviorFlags?: string[];
  },
): ControlCenterCallAgentConfig {
  const updated: ControlCenterCallAgentConfig = {
    ...config,
    ...evolveEntityMetadata(config, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
    ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
    ...(input.outboundCallingEnabled !== undefined
      ? { outboundCallingEnabled: input.outboundCallingEnabled }
      : {}),
    ...(input.handoffToHumanEnabled !== undefined
      ? { handoffToHumanEnabled: input.handoffToHumanEnabled }
      : {}),
    ...(input.manualAgentInstructions !== undefined
      ? { manualAgentInstructions: input.manualAgentInstructions }
      : {}),
    ...(input.callRecordingDisclaimerEnabled !== undefined
      ? { callRecordingDisclaimerEnabled: input.callRecordingDisclaimerEnabled }
      : {}),
    ...(input.providerConfigMetadata !== undefined
      ? { providerConfigMetadata: { ...input.providerConfigMetadata } }
      : {}),
    ...(input.defaultBehaviorFlags !== undefined
      ? { defaultBehaviorFlags: [...input.defaultBehaviorFlags] }
      : {}),
  };
  assignOptionalString(updated, "humanSupportNumber", input.humanSupportNumber);
  assignOptionalString(updated, "overrideOpeningLine", input.overrideOpeningLine);
  assignOptionalEnum(updated, "providerType", input.providerType);
  return updated;
}

export function createControlCenterConfig(input: {
  id: string;
  tenantId: string;
  actor: ActorContext;
  at: string;
  defaultTimezone: string;
  defaultSenderBehavior: ControlCenterConfig["defaultSenderBehavior"];
  allowedChannels: ControlCenterConfig["allowedChannels"];
  channelFallbackPolicy: ControlCenterConfig["channelFallbackPolicy"];
  sandboxMode: ControlCenterConfig["sandboxMode"];
  defaultRiskApprovalMode: ControlCenterConfig["defaultRiskApprovalMode"];
  seededDemoFlags?: Record<string, boolean>;
}): ControlCenterConfig {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.at,
      tenantId: input.tenantId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    tenantId: input.tenantId,
    defaultTimezone: input.defaultTimezone,
    defaultSenderBehavior: input.defaultSenderBehavior,
    allowedChannels: [...input.allowedChannels],
    channelFallbackPolicy: input.channelFallbackPolicy,
    sandboxMode: input.sandboxMode,
    defaultRiskApprovalMode: input.defaultRiskApprovalMode,
    seededDemoFlags: { ...(input.seededDemoFlags ?? {}) },
  };
}

export function updateControlCenterConfig(
  config: ControlCenterConfig,
  input: {
    actor: ActorContext;
    at: string;
    defaultTimezone?: string;
    defaultSenderBehavior?: ControlCenterConfig["defaultSenderBehavior"];
    allowedChannels?: ControlCenterConfig["allowedChannels"];
    channelFallbackPolicy?: ControlCenterConfig["channelFallbackPolicy"];
    sandboxMode?: ControlCenterConfig["sandboxMode"];
    defaultRiskApprovalMode?: ControlCenterConfig["defaultRiskApprovalMode"];
    seededDemoFlags?: Record<string, boolean>;
  },
): ControlCenterConfig {
  return {
    ...config,
    ...evolveEntityMetadata(config, {
      at: input.at,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.defaultTimezone !== undefined ? { defaultTimezone: input.defaultTimezone } : {}),
    ...(input.defaultSenderBehavior !== undefined
      ? { defaultSenderBehavior: input.defaultSenderBehavior }
      : {}),
    ...(input.allowedChannels !== undefined ? { allowedChannels: [...input.allowedChannels] } : {}),
    ...(input.channelFallbackPolicy !== undefined
      ? { channelFallbackPolicy: input.channelFallbackPolicy }
      : {}),
    ...(input.sandboxMode !== undefined ? { sandboxMode: input.sandboxMode } : {}),
    ...(input.defaultRiskApprovalMode !== undefined
      ? { defaultRiskApprovalMode: input.defaultRiskApprovalMode }
      : {}),
    ...(input.seededDemoFlags !== undefined ? { seededDemoFlags: { ...input.seededDemoFlags } } : {}),
  };
}

function assignOptionalString<T extends object>(
  target: T,
  key: keyof T,
  value: string | null | undefined,
): void {
  const mutable = target as Record<string, unknown>;
  if (value === undefined) {
    return;
  }
  if (value === null || value.length === 0) {
    delete mutable[key as string];
    return;
  }
  mutable[key as string] = value;
}

function assignOptionalEnum<T extends object>(
  target: T,
  key: keyof T,
  value: string | null | undefined,
): void {
  const mutable = target as Record<string, unknown>;
  if (value === undefined) {
    return;
  }
  if (value === null) {
    delete mutable[key as string];
    return;
  }
  mutable[key as string] = value;
}

function nextExecutionStatus(
  execution: ControlCenterWorkflowExecution,
  decision: ControlCenterWorkflowDecision,
): ControlCenterWorkflowExecution["status"] {
  switch (decision.action) {
    case "pause":
      return "paused";
    case "opt_out":
      return "opted_out";
    case "escalate_for_review":
      return "manual_review";
    case "switch_track":
      return decision.requiresHumanReview ? "manual_review" : "active";
    case "continue":
      if (decision.reason === "manual_lock_active") {
        return execution.status;
      }
    default:
      return execution.status === "opted_out" ? "opted_out" : "active";
  }
}
