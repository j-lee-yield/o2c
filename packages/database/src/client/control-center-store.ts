import type {
  ActorRole,
  ControlCenterCallAgentConfig,
  ControlCenterConfig,
  ControlCenterEmailTemplate,
  ControlCenterStage,
  ControlCenterTemplateFolder,
  ControlCenterWorkflow,
  ControlCenterWorkflowExecution,
} from "@o2c/domain";
import type {
  ControlCenterPersistence,
  ControlCenterPersistenceSnapshot,
} from "@o2c/workflows";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

type WorkflowRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  category: ControlCenterWorkflow["category"];
  name: string;
  enabled: boolean;
  senderIdentityId?: string;
  senderEmail?: string;
  testEmailRecipient?: string;
  testCallRecipient?: string;
  timezone: string;
  outreachWindowStart: string;
  outreachWindowEnd: string;
  outreachDays: ControlCenterWorkflow["outreachDays"];
  weekendCallingEnabled: boolean;
  stageCount: number;
  metadata: Record<string, unknown>;
};

type StageRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  workflowId: string;
  order: number;
  outreachType: ControlCenterStage["outreachType"];
  triggerType: ControlCenterStage["triggerType"];
  triggerConfig: ControlCenterStage["triggerConfig"];
  templateMode: ControlCenterStage["templateMode"];
  templateId?: string;
  aiStrategyId?: string;
  notes: string;
  enabled: boolean;
  requiresApproval: boolean;
  riskHints: string[];
};

type ExecutionRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  workflowId: string;
  billingAccountId: string;
  parentAccountId: string;
  status: ControlCenterWorkflowExecution["status"];
  currentTrack: ControlCenterWorkflowExecution["currentTrack"];
  lastDecisionAction?: ControlCenterWorkflowExecution["lastDecisionAction"];
  lastDecisionReason?: string;
  lastDecisionConfidence?: number;
  requiresHumanReview: boolean;
  effectiveUntil?: string;
  rationaleSummary?: string;
  reasoningMetadata: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type TemplateRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  name: string;
  folderId?: string;
  subject: string;
  body: string;
  ccEmails: string[];
  channelCompatibility: ControlCenterEmailTemplate["channelCompatibility"];
  autoCorrectEnabled: boolean;
  isDefault: boolean;
  isArchived: boolean;
  previewSeedKey?: string;
};

type FolderRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  name: string;
};

type CallAgentConfigRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  phoneNumber: string;
  smsEnabled: boolean;
  outboundCallingEnabled: boolean;
  humanSupportNumber?: string;
  handoffToHumanEnabled: boolean;
  manualAgentInstructions: string;
  overrideOpeningLine?: string;
  callRecordingDisclaimerEnabled: boolean;
  providerType?: ControlCenterCallAgentConfig["providerType"];
  providerConfigMetadata: Record<string, unknown>;
  defaultBehaviorFlags: string[];
};

type ConfigRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: ActorRole;
  updatedByActorId?: string;
  updatedByActorRole?: ActorRole;
  defaultTimezone: string;
  defaultSenderBehavior: ControlCenterConfig["defaultSenderBehavior"];
  allowedChannels: ControlCenterConfig["allowedChannels"];
  channelFallbackPolicy: ControlCenterConfig["channelFallbackPolicy"];
  sandboxMode: ControlCenterConfig["sandboxMode"];
  defaultRiskApprovalMode: ControlCenterConfig["defaultRiskApprovalMode"];
  seededDemoFlags: Record<string, boolean>;
};

export class PostgresControlCenterPersistence implements ControlCenterPersistence {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  loadSnapshot(): ControlCenterPersistenceSnapshot {
    const callAgentConfig = this.getCallAgentConfig();
    const config = this.getConfig();
    return {
      workflows: this.listWorkflows(),
      stages: this.listStages(),
      executions: this.listExecutions(),
      templates: this.listTemplates(),
      folders: this.listFolders(),
      ...(callAgentConfig ? { callAgentConfig } : {}),
      ...(config ? { config } : {}),
    };
  }

  upsertWorkflow(workflow: ControlCenterWorkflow): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_workflow (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          category, name, enabled, sender_identity_id, sender_email, test_email_recipient,
          test_call_recipient, timezone, outreach_window_start, outreach_window_end,
          outreach_days, weekend_calling_enabled, stage_count, metadata
        )
        VALUES (
          '${quoteLiteral(workflow.id)}',
          '${quoteLiteral(workflow.tenantId ?? this.tenantId)}',
          ${workflow.version ?? 1},
          '${quoteLiteral(workflow.createdAt)}'::timestamptz,
          '${quoteLiteral(workflow.updatedAt)}'::timestamptz,
          ${workflow.deletedAt ? `'${quoteLiteral(workflow.deletedAt)}'::timestamptz` : "NULL"},
          ${workflow.createdByActorId ? `'${quoteLiteral(workflow.createdByActorId)}'` : "NULL"},
          ${workflow.createdByActorRole ? `'${quoteLiteral(workflow.createdByActorRole)}'` : "NULL"},
          ${workflow.updatedByActorId ? `'${quoteLiteral(workflow.updatedByActorId)}'` : "NULL"},
          ${workflow.updatedByActorRole ? `'${quoteLiteral(workflow.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(workflow.category)}',
          '${quoteLiteral(workflow.name)}',
          ${workflow.enabled ? "TRUE" : "FALSE"},
          ${workflow.senderIdentityId ? `'${quoteLiteral(workflow.senderIdentityId)}'` : "NULL"},
          ${workflow.senderEmail ? `'${quoteLiteral(workflow.senderEmail)}'` : "NULL"},
          ${workflow.testEmailRecipient ? `'${quoteLiteral(workflow.testEmailRecipient)}'` : "NULL"},
          ${workflow.testCallRecipient ? `'${quoteLiteral(workflow.testCallRecipient)}'` : "NULL"},
          '${quoteLiteral(workflow.timezone)}',
          '${quoteLiteral(workflow.outreachWindowStart)}',
          '${quoteLiteral(workflow.outreachWindowEnd)}',
          '${jsonLiteral(workflow.outreachDays)}'::jsonb,
          ${workflow.weekendCallingEnabled ? "TRUE" : "FALSE"},
          ${workflow.stageCount},
          '${jsonLiteral(workflow.metadata ?? {})}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          category = EXCLUDED.category,
          name = EXCLUDED.name,
          enabled = EXCLUDED.enabled,
          sender_identity_id = EXCLUDED.sender_identity_id,
          sender_email = EXCLUDED.sender_email,
          test_email_recipient = EXCLUDED.test_email_recipient,
          test_call_recipient = EXCLUDED.test_call_recipient,
          timezone = EXCLUDED.timezone,
          outreach_window_start = EXCLUDED.outreach_window_start,
          outreach_window_end = EXCLUDED.outreach_window_end,
          outreach_days = EXCLUDED.outreach_days,
          weekend_calling_enabled = EXCLUDED.weekend_calling_enabled,
          stage_count = EXCLUDED.stage_count,
          metadata = EXCLUDED.metadata;
      `,
    );
  }

  deleteWorkflow(workflowId: string): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM control_center_workflow
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND id = '${quoteLiteral(workflowId)}';
      `,
    );
  }

  upsertStage(stage: ControlCenterStage): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_stage (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          workflow_id, stage_order, outreach_type, trigger_type, trigger_config, template_mode,
          template_id, ai_strategy_id, notes, enabled, requires_approval, risk_hints
        )
        VALUES (
          '${quoteLiteral(stage.id)}',
          '${quoteLiteral(stage.tenantId ?? this.tenantId)}',
          ${stage.version ?? 1},
          '${quoteLiteral(stage.createdAt)}'::timestamptz,
          '${quoteLiteral(stage.updatedAt)}'::timestamptz,
          ${stage.deletedAt ? `'${quoteLiteral(stage.deletedAt)}'::timestamptz` : "NULL"},
          ${stage.createdByActorId ? `'${quoteLiteral(stage.createdByActorId)}'` : "NULL"},
          ${stage.createdByActorRole ? `'${quoteLiteral(stage.createdByActorRole)}'` : "NULL"},
          ${stage.updatedByActorId ? `'${quoteLiteral(stage.updatedByActorId)}'` : "NULL"},
          ${stage.updatedByActorRole ? `'${quoteLiteral(stage.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(stage.workflowId)}',
          ${stage.order},
          '${quoteLiteral(stage.outreachType)}',
          '${quoteLiteral(stage.triggerType)}',
          '${jsonLiteral(stage.triggerConfig)}'::jsonb,
          '${quoteLiteral(stage.templateMode)}',
          ${stage.templateId ? `'${quoteLiteral(stage.templateId)}'` : "NULL"},
          ${stage.aiStrategyId ? `'${quoteLiteral(stage.aiStrategyId)}'` : "NULL"},
          '${quoteLiteral(stage.notes)}',
          ${stage.enabled ? "TRUE" : "FALSE"},
          ${stage.requiresApproval ? "TRUE" : "FALSE"},
          '${jsonLiteral(stage.riskHints ?? [])}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          workflow_id = EXCLUDED.workflow_id,
          stage_order = EXCLUDED.stage_order,
          outreach_type = EXCLUDED.outreach_type,
          trigger_type = EXCLUDED.trigger_type,
          trigger_config = EXCLUDED.trigger_config,
          template_mode = EXCLUDED.template_mode,
          template_id = EXCLUDED.template_id,
          ai_strategy_id = EXCLUDED.ai_strategy_id,
          notes = EXCLUDED.notes,
          enabled = EXCLUDED.enabled,
          requires_approval = EXCLUDED.requires_approval,
          risk_hints = EXCLUDED.risk_hints;
      `,
    );
  }

  deleteStage(stageId: string): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM control_center_stage
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND id = '${quoteLiteral(stageId)}';
      `,
    );
  }

  upsertExecution(execution: ControlCenterWorkflowExecution): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_workflow_execution (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          workflow_id, billing_account_id, parent_account_id, status, current_track,
          last_decision_action, last_decision_reason, last_decision_confidence,
          requires_human_review, effective_until, rationale_summary, reasoning_metadata, metadata
        )
        VALUES (
          '${quoteLiteral(execution.id)}',
          '${quoteLiteral(execution.tenantId ?? this.tenantId)}',
          ${execution.version ?? 1},
          '${quoteLiteral(execution.createdAt)}'::timestamptz,
          '${quoteLiteral(execution.updatedAt)}'::timestamptz,
          ${execution.deletedAt ? `'${quoteLiteral(execution.deletedAt)}'::timestamptz` : "NULL"},
          ${execution.createdByActorId ? `'${quoteLiteral(execution.createdByActorId)}'` : "NULL"},
          ${execution.createdByActorRole ? `'${quoteLiteral(execution.createdByActorRole)}'` : "NULL"},
          ${execution.updatedByActorId ? `'${quoteLiteral(execution.updatedByActorId)}'` : "NULL"},
          ${execution.updatedByActorRole ? `'${quoteLiteral(execution.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(execution.workflowId)}',
          '${quoteLiteral(execution.billingAccountId)}'::uuid,
          '${quoteLiteral(execution.parentAccountId)}'::uuid,
          '${quoteLiteral(execution.status)}',
          '${quoteLiteral(execution.currentTrack)}',
          ${execution.lastDecisionAction ? `'${quoteLiteral(execution.lastDecisionAction)}'` : "NULL"},
          ${execution.lastDecisionReason ? `'${quoteLiteral(execution.lastDecisionReason)}'` : "NULL"},
          ${execution.lastDecisionConfidence !== undefined ? execution.lastDecisionConfidence : "NULL"},
          ${execution.requiresHumanReview ? "TRUE" : "FALSE"},
          ${execution.effectiveUntil ? `'${quoteLiteral(execution.effectiveUntil)}'::timestamptz` : "NULL"},
          ${execution.rationaleSummary ? `'${quoteLiteral(execution.rationaleSummary)}'` : "NULL"},
          '${jsonLiteral(execution.reasoningMetadata ?? {})}'::jsonb,
          '${jsonLiteral(execution.metadata ?? {})}'::jsonb
        )
        ON CONFLICT (tenant_id, workflow_id, billing_account_id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          status = EXCLUDED.status,
          current_track = EXCLUDED.current_track,
          last_decision_action = EXCLUDED.last_decision_action,
          last_decision_reason = EXCLUDED.last_decision_reason,
          last_decision_confidence = EXCLUDED.last_decision_confidence,
          requires_human_review = EXCLUDED.requires_human_review,
          effective_until = EXCLUDED.effective_until,
          rationale_summary = EXCLUDED.rationale_summary,
          reasoning_metadata = EXCLUDED.reasoning_metadata,
          metadata = EXCLUDED.metadata;
      `,
    );
  }

  deleteExecution(executionId: string): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM control_center_workflow_execution
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND id = '${quoteLiteral(executionId)}';
      `,
    );
  }

  upsertTemplate(template: ControlCenterEmailTemplate): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_email_template (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          name, folder_id, subject, body, cc_emails, channel_compatibility,
          auto_correct_enabled, is_default, is_archived, preview_seed_key
        )
        VALUES (
          '${quoteLiteral(template.id)}',
          '${quoteLiteral(template.tenantId ?? this.tenantId)}',
          ${template.version ?? 1},
          '${quoteLiteral(template.createdAt)}'::timestamptz,
          '${quoteLiteral(template.updatedAt)}'::timestamptz,
          ${template.deletedAt ? `'${quoteLiteral(template.deletedAt)}'::timestamptz` : "NULL"},
          ${template.createdByActorId ? `'${quoteLiteral(template.createdByActorId)}'` : "NULL"},
          ${template.createdByActorRole ? `'${quoteLiteral(template.createdByActorRole)}'` : "NULL"},
          ${template.updatedByActorId ? `'${quoteLiteral(template.updatedByActorId)}'` : "NULL"},
          ${template.updatedByActorRole ? `'${quoteLiteral(template.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(template.name)}',
          ${template.folderId ? `'${quoteLiteral(template.folderId)}'` : "NULL"},
          '${quoteLiteral(template.subject)}',
          '${quoteLiteral(template.body)}',
          '${jsonLiteral(template.ccEmails ?? [])}'::jsonb,
          '${jsonLiteral(template.channelCompatibility)}'::jsonb,
          ${template.autoCorrectEnabled ? "TRUE" : "FALSE"},
          ${template.isDefault ? "TRUE" : "FALSE"},
          ${template.isArchived ? "TRUE" : "FALSE"},
          ${template.previewSeedKey ? `'${quoteLiteral(template.previewSeedKey)}'` : "NULL"}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          name = EXCLUDED.name,
          folder_id = EXCLUDED.folder_id,
          subject = EXCLUDED.subject,
          body = EXCLUDED.body,
          cc_emails = EXCLUDED.cc_emails,
          channel_compatibility = EXCLUDED.channel_compatibility,
          auto_correct_enabled = EXCLUDED.auto_correct_enabled,
          is_default = EXCLUDED.is_default,
          is_archived = EXCLUDED.is_archived,
          preview_seed_key = EXCLUDED.preview_seed_key;
      `,
    );
  }

  upsertFolder(folder: ControlCenterTemplateFolder): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_template_folder (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role, name
        )
        VALUES (
          '${quoteLiteral(folder.id)}',
          '${quoteLiteral(folder.tenantId ?? this.tenantId)}',
          ${folder.version ?? 1},
          '${quoteLiteral(folder.createdAt)}'::timestamptz,
          '${quoteLiteral(folder.updatedAt)}'::timestamptz,
          ${folder.deletedAt ? `'${quoteLiteral(folder.deletedAt)}'::timestamptz` : "NULL"},
          ${folder.createdByActorId ? `'${quoteLiteral(folder.createdByActorId)}'` : "NULL"},
          ${folder.createdByActorRole ? `'${quoteLiteral(folder.createdByActorRole)}'` : "NULL"},
          ${folder.updatedByActorId ? `'${quoteLiteral(folder.updatedByActorId)}'` : "NULL"},
          ${folder.updatedByActorRole ? `'${quoteLiteral(folder.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(folder.name)}'
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          name = EXCLUDED.name;
      `,
    );
  }

  upsertCallAgentConfig(config: ControlCenterCallAgentConfig): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_call_agent_config (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          phone_number, sms_enabled, outbound_calling_enabled, human_support_number,
          handoff_to_human_enabled, manual_agent_instructions, override_opening_line,
          call_recording_disclaimer_enabled, provider_type, provider_config_metadata, default_behavior_flags
        )
        VALUES (
          '${quoteLiteral(config.id)}',
          '${quoteLiteral(config.tenantId ?? this.tenantId)}',
          ${config.version ?? 1},
          '${quoteLiteral(config.createdAt)}'::timestamptz,
          '${quoteLiteral(config.updatedAt)}'::timestamptz,
          ${config.deletedAt ? `'${quoteLiteral(config.deletedAt)}'::timestamptz` : "NULL"},
          ${config.createdByActorId ? `'${quoteLiteral(config.createdByActorId)}'` : "NULL"},
          ${config.createdByActorRole ? `'${quoteLiteral(config.createdByActorRole)}'` : "NULL"},
          ${config.updatedByActorId ? `'${quoteLiteral(config.updatedByActorId)}'` : "NULL"},
          ${config.updatedByActorRole ? `'${quoteLiteral(config.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(config.phoneNumber)}',
          ${config.smsEnabled ? "TRUE" : "FALSE"},
          ${config.outboundCallingEnabled ? "TRUE" : "FALSE"},
          ${config.humanSupportNumber ? `'${quoteLiteral(config.humanSupportNumber)}'` : "NULL"},
          ${config.handoffToHumanEnabled ? "TRUE" : "FALSE"},
          '${quoteLiteral(config.manualAgentInstructions)}',
          ${config.overrideOpeningLine ? `'${quoteLiteral(config.overrideOpeningLine)}'` : "NULL"},
          ${config.callRecordingDisclaimerEnabled ? "TRUE" : "FALSE"},
          ${config.providerType ? `'${quoteLiteral(config.providerType)}'` : "NULL"},
          '${jsonLiteral(config.providerConfigMetadata ?? {})}'::jsonb,
          '${jsonLiteral(config.defaultBehaviorFlags ?? [])}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          phone_number = EXCLUDED.phone_number,
          sms_enabled = EXCLUDED.sms_enabled,
          outbound_calling_enabled = EXCLUDED.outbound_calling_enabled,
          human_support_number = EXCLUDED.human_support_number,
          handoff_to_human_enabled = EXCLUDED.handoff_to_human_enabled,
          manual_agent_instructions = EXCLUDED.manual_agent_instructions,
          override_opening_line = EXCLUDED.override_opening_line,
          call_recording_disclaimer_enabled = EXCLUDED.call_recording_disclaimer_enabled,
          provider_type = EXCLUDED.provider_type,
          provider_config_metadata = EXCLUDED.provider_config_metadata,
          default_behavior_flags = EXCLUDED.default_behavior_flags;
      `,
    );
  }

  upsertConfig(config: ControlCenterConfig): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO control_center_config (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          default_timezone, default_sender_behavior, allowed_channels, channel_fallback_policy,
          sandbox_mode, default_risk_approval_mode, seeded_demo_flags
        )
        VALUES (
          '${quoteLiteral(config.id)}',
          '${quoteLiteral(config.tenantId ?? this.tenantId)}',
          ${config.version ?? 1},
          '${quoteLiteral(config.createdAt)}'::timestamptz,
          '${quoteLiteral(config.updatedAt)}'::timestamptz,
          ${config.deletedAt ? `'${quoteLiteral(config.deletedAt)}'::timestamptz` : "NULL"},
          ${config.createdByActorId ? `'${quoteLiteral(config.createdByActorId)}'` : "NULL"},
          ${config.createdByActorRole ? `'${quoteLiteral(config.createdByActorRole)}'` : "NULL"},
          ${config.updatedByActorId ? `'${quoteLiteral(config.updatedByActorId)}'` : "NULL"},
          ${config.updatedByActorRole ? `'${quoteLiteral(config.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(config.defaultTimezone)}',
          '${quoteLiteral(config.defaultSenderBehavior)}',
          '${jsonLiteral(config.allowedChannels)}'::jsonb,
          '${quoteLiteral(config.channelFallbackPolicy)}',
          '${quoteLiteral(config.sandboxMode)}',
          '${quoteLiteral(config.defaultRiskApprovalMode)}',
          '${jsonLiteral(config.seededDemoFlags ?? {})}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          default_timezone = EXCLUDED.default_timezone,
          default_sender_behavior = EXCLUDED.default_sender_behavior,
          allowed_channels = EXCLUDED.allowed_channels,
          channel_fallback_policy = EXCLUDED.channel_fallback_policy,
          sandbox_mode = EXCLUDED.sandbox_mode,
          default_risk_approval_mode = EXCLUDED.default_risk_approval_mode,
          seeded_demo_flags = EXCLUDED.seeded_demo_flags;
      `,
    );
  }

  private listWorkflows(): ControlCenterWorkflow[] {
    return queryJsonRows<WorkflowRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            category,
            name,
            enabled,
            sender_identity_id AS "senderIdentityId",
            sender_email AS "senderEmail",
            test_email_recipient AS "testEmailRecipient",
            test_call_recipient AS "testCallRecipient",
            timezone,
            outreach_window_start AS "outreachWindowStart",
            outreach_window_end AS "outreachWindowEnd",
            outreach_days AS "outreachDays",
            weekend_calling_enabled AS "weekendCallingEnabled",
            stage_count AS "stageCount",
            metadata
          FROM control_center_workflow
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
        ) q;
      `,
    ).map(normalizeWorkflowRow);
  }

  private listStages(): ControlCenterStage[] {
    return queryJsonRows<StageRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            workflow_id AS "workflowId",
            stage_order AS "order",
            outreach_type AS "outreachType",
            trigger_type AS "triggerType",
            trigger_config AS "triggerConfig",
            template_mode AS "templateMode",
            template_id AS "templateId",
            ai_strategy_id AS "aiStrategyId",
            notes,
            enabled,
            requires_approval AS "requiresApproval",
            risk_hints AS "riskHints"
          FROM control_center_stage
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY workflow_id, stage_order
        ) q;
      `,
    ).map(normalizeStageRow);
  }

  private listExecutions(): ControlCenterWorkflowExecution[] {
    try {
      return queryJsonRows<ExecutionRow>(
        this.databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              id,
              tenant_id AS "tenantId",
              version,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              deleted_at AS "deletedAt",
              created_by_actor_id AS "createdByActorId",
              created_by_actor_role AS "createdByActorRole",
              updated_by_actor_id AS "updatedByActorId",
              updated_by_actor_role AS "updatedByActorRole",
              workflow_id AS "workflowId",
              billing_account_id::text AS "billingAccountId",
              parent_account_id::text AS "parentAccountId",
              status,
              current_track AS "currentTrack",
              last_decision_action AS "lastDecisionAction",
              last_decision_reason AS "lastDecisionReason",
              last_decision_confidence AS "lastDecisionConfidence",
              requires_human_review AS "requiresHumanReview",
              effective_until AS "effectiveUntil",
              rationale_summary AS "rationaleSummary",
              reasoning_metadata AS "reasoningMetadata",
              metadata
            FROM control_center_workflow_execution
            WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            ORDER BY updated_at DESC
          ) q;
        `,
      ).map(normalizeExecutionRow);
    } catch (error) {
      if (isMissingRelationError(error, "control_center_workflow_execution")) {
        return [];
      }
      throw error;
    }
  }

  private listTemplates(): ControlCenterEmailTemplate[] {
    return queryJsonRows<TemplateRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            name,
            folder_id AS "folderId",
            subject,
            body,
            cc_emails AS "ccEmails",
            channel_compatibility AS "channelCompatibility",
            auto_correct_enabled AS "autoCorrectEnabled",
            is_default AS "isDefault",
            is_archived AS "isArchived",
            preview_seed_key AS "previewSeedKey"
          FROM control_center_email_template
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
        ) q;
      `,
    ).map(normalizeTemplateRow);
  }

  private listFolders(): ControlCenterTemplateFolder[] {
    return queryJsonRows<FolderRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            name
          FROM control_center_template_folder
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY name ASC
        ) q;
      `,
    ).map(normalizeFolderRow);
  }

  private getCallAgentConfig(): ControlCenterCallAgentConfig | undefined {
    const row = queryJsonRows<CallAgentConfigRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            phone_number AS "phoneNumber",
            sms_enabled AS "smsEnabled",
            outbound_calling_enabled AS "outboundCallingEnabled",
            human_support_number AS "humanSupportNumber",
            handoff_to_human_enabled AS "handoffToHumanEnabled",
            manual_agent_instructions AS "manualAgentInstructions",
            override_opening_line AS "overrideOpeningLine",
            call_recording_disclaimer_enabled AS "callRecordingDisclaimerEnabled",
            provider_type AS "providerType",
            provider_config_metadata AS "providerConfigMetadata",
            default_behavior_flags AS "defaultBehaviorFlags"
          FROM control_center_call_agent_config
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
          LIMIT 1
        ) q;
      `,
    )[0];
    return row ? normalizeCallAgentConfigRow(row) : undefined;
  }

  private getConfig(): ControlCenterConfig | undefined {
    const row = queryJsonRows<ConfigRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            default_timezone AS "defaultTimezone",
            default_sender_behavior AS "defaultSenderBehavior",
            allowed_channels AS "allowedChannels",
            channel_fallback_policy AS "channelFallbackPolicy",
            sandbox_mode AS "sandboxMode",
            default_risk_approval_mode AS "defaultRiskApprovalMode",
            seeded_demo_flags AS "seededDemoFlags"
          FROM control_center_config
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY updated_at DESC
          LIMIT 1
        ) q;
      `,
    )[0];
    return row ? normalizeConfigRow(row) : undefined;
  }
}

function normalizeWorkflowRow(row: WorkflowRow): ControlCenterWorkflow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    category: row.category,
    name: row.name,
    enabled: row.enabled,
    ...(row.senderIdentityId ? { senderIdentityId: row.senderIdentityId } : {}),
    ...(row.senderEmail ? { senderEmail: row.senderEmail } : {}),
    ...(row.testEmailRecipient ? { testEmailRecipient: row.testEmailRecipient } : {}),
    ...(row.testCallRecipient ? { testCallRecipient: row.testCallRecipient } : {}),
    timezone: row.timezone,
    outreachWindowStart: row.outreachWindowStart,
    outreachWindowEnd: row.outreachWindowEnd,
    outreachDays: row.outreachDays,
    weekendCallingEnabled: row.weekendCallingEnabled,
    stageCount: row.stageCount,
    metadata: row.metadata ?? {},
  };
}

function normalizeStageRow(row: StageRow): ControlCenterStage {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    workflowId: row.workflowId,
    order: row.order,
    outreachType: row.outreachType,
    triggerType: row.triggerType,
    triggerConfig: row.triggerConfig,
    templateMode: row.templateMode,
    ...(row.templateId ? { templateId: row.templateId } : {}),
    ...(row.aiStrategyId ? { aiStrategyId: row.aiStrategyId } : {}),
    notes: row.notes,
    enabled: row.enabled,
    requiresApproval: row.requiresApproval,
    riskHints: row.riskHints ?? [],
  };
}

function normalizeExecutionRow(row: ExecutionRow): ControlCenterWorkflowExecution {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    workflowId: row.workflowId,
    billingAccountId: row.billingAccountId,
    parentAccountId: row.parentAccountId,
    status: row.status,
    currentTrack: row.currentTrack,
    ...(row.lastDecisionAction ? { lastDecisionAction: row.lastDecisionAction } : {}),
    ...(row.lastDecisionReason ? { lastDecisionReason: row.lastDecisionReason } : {}),
    ...(row.lastDecisionConfidence !== undefined
      ? { lastDecisionConfidence: row.lastDecisionConfidence }
      : {}),
    requiresHumanReview: row.requiresHumanReview,
    ...(row.effectiveUntil ? { effectiveUntil: row.effectiveUntil } : {}),
    ...(row.rationaleSummary ? { rationaleSummary: row.rationaleSummary } : {}),
    reasoningMetadata: row.reasoningMetadata ?? {},
    metadata: row.metadata ?? {},
  };
}

function normalizeTemplateRow(row: TemplateRow): ControlCenterEmailTemplate {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    name: row.name,
    ...(row.folderId ? { folderId: row.folderId } : {}),
    subject: row.subject,
    body: row.body,
    ccEmails: row.ccEmails ?? [],
    channelCompatibility: row.channelCompatibility,
    autoCorrectEnabled: row.autoCorrectEnabled,
    isDefault: row.isDefault,
    isArchived: row.isArchived,
    ...(row.previewSeedKey ? { previewSeedKey: row.previewSeedKey } : {}),
  };
}

function normalizeFolderRow(row: FolderRow): ControlCenterTemplateFolder {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    name: row.name,
  };
}

function normalizeCallAgentConfigRow(row: CallAgentConfigRow): ControlCenterCallAgentConfig {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    phoneNumber: row.phoneNumber,
    smsEnabled: row.smsEnabled,
    outboundCallingEnabled: row.outboundCallingEnabled,
    ...(row.humanSupportNumber ? { humanSupportNumber: row.humanSupportNumber } : {}),
    handoffToHumanEnabled: row.handoffToHumanEnabled,
    manualAgentInstructions: row.manualAgentInstructions,
    ...(row.overrideOpeningLine ? { overrideOpeningLine: row.overrideOpeningLine } : {}),
    callRecordingDisclaimerEnabled: row.callRecordingDisclaimerEnabled,
    ...(row.providerType ? { providerType: row.providerType } : {}),
    providerConfigMetadata: row.providerConfigMetadata ?? {},
    defaultBehaviorFlags: row.defaultBehaviorFlags ?? [],
  };
}

function normalizeConfigRow(row: ConfigRow): ControlCenterConfig {
  return {
    id: row.id,
    tenantId: row.tenantId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    defaultTimezone: row.defaultTimezone,
    defaultSenderBehavior: row.defaultSenderBehavior,
    allowedChannels: row.allowedChannels,
    channelFallbackPolicy: row.channelFallbackPolicy,
    sandboxMode: row.sandboxMode,
    defaultRiskApprovalMode: row.defaultRiskApprovalMode,
    seededDemoFlags: row.seededDemoFlags ?? {},
  };
}

function isMissingRelationError(error: unknown, relationName: string) {
  return error instanceof Error && error.message.includes(`relation "${relationName}" does not exist`);
}
