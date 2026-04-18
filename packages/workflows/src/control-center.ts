import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  createCallAgentConfig,
  createControlCenterConfig,
  createControlCenterStage,
  createControlCenterWorkflow,
  createEmailTemplate,
  createTemplateFolder,
  updateCallAgentConfig,
  updateControlCenterConfig,
  updateControlCenterStage,
  updateControlCenterWorkflow,
  updateEmailTemplate,
  validateControlCenterStage,
  type BillingAccount,
  type ControlCenterCallAgentConfig,
  type ControlCenterConfig,
  type ControlCenterEmailTemplate,
  type ControlCenterStage,
  type ControlCenterTemplateFolder,
  type ControlCenterWorkflow,
  type Contact,
  type CustomerInvoice,
} from "@o2c/domain";
import type {
  ControlCenterCallAgentProviderPreview,
  ControlCenterGeneratedStageContent,
  ControlCenterStagePreview,
  ControlCenterTemplatePreview,
  ControlCenterWorkflowListItem,
} from "@o2c/contracts";

type ActivityActorRole = "ar_collector" | "ar_manager" | "controller" | "admin" | "system";
type WorkflowUpdateInput = Omit<Parameters<typeof updateControlCenterWorkflow>[1], "actor" | "at">;
type StageUpdateInput = Omit<Parameters<typeof updateControlCenterStage>[1], "actor" | "at">;
type TemplateUpdateInput = Omit<Parameters<typeof updateEmailTemplate>[1], "actor" | "at">;
type CallAgentUpdateInput = Omit<Parameters<typeof updateCallAgentConfig>[1], "actor" | "at">;
type ConfigUpdateInput = Omit<Parameters<typeof updateControlCenterConfig>[1], "actor" | "at">;

export interface ControlCenterStore {
  workflows: Map<string, ControlCenterWorkflow>;
  stages: Map<string, ControlCenterStage>;
  templates: Map<string, ControlCenterEmailTemplate>;
  folders: Map<string, ControlCenterTemplateFolder>;
  callAgentConfig?: ControlCenterCallAgentConfig;
  config?: ControlCenterConfig;
}

export interface ControlCenterGeneratedContentRequest {
  principal: Principal;
  workflowId?: string;
  stage: ControlCenterStage;
}

export interface ControlCenterGeneratedContentDeps {
  generateEmail(request: ControlCenterGeneratedContentRequest): ControlCenterGeneratedStageContent;
  generateSms(request: ControlCenterGeneratedContentRequest): ControlCenterGeneratedStageContent;
  generateVoice(request: ControlCenterGeneratedContentRequest): ControlCenterGeneratedStageContent;
}

export interface ControlCenterTemplatePreviewContext {
  account: BillingAccount;
  contact?: Contact;
  invoices: CustomerInvoice[];
  paymentUrl: string;
  asOfDate: string;
}

export interface ControlCenterPersistenceSnapshot {
  workflows: ControlCenterWorkflow[];
  stages: ControlCenterStage[];
  templates: ControlCenterEmailTemplate[];
  folders: ControlCenterTemplateFolder[];
  callAgentConfig?: ControlCenterCallAgentConfig;
  config?: ControlCenterConfig;
}

export interface ControlCenterPersistence {
  loadSnapshot(): ControlCenterPersistenceSnapshot;
  upsertWorkflow(workflow: ControlCenterWorkflow): void;
  deleteWorkflow(workflowId: string): void;
  upsertStage(stage: ControlCenterStage): void;
  deleteStage(stageId: string): void;
  upsertTemplate(template: ControlCenterEmailTemplate): void;
  upsertFolder(folder: ControlCenterTemplateFolder): void;
  upsertCallAgentConfig(config: ControlCenterCallAgentConfig): void;
  upsertConfig(config: ControlCenterConfig): void;
}

export interface ControlCenterServiceDependencies {
  activityStore: ImmutableActivityLogStore;
  store?: ControlCenterStore;
  generatedContentDeps: ControlCenterGeneratedContentDeps;
  templatePreviewResolver?: (
    template: ControlCenterEmailTemplate,
  ) => ControlCenterTemplatePreview;
  persistence?: ControlCenterPersistence;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

function toActor(principal: Principal): { actorId: string; actorRole: ActivityActorRole } {
  const role = principal.roles[0] ?? "ar_collector";
  return { actorId: principal.id, actorRole: role as ActivityActorRole };
}

export class InMemoryControlCenterStore implements ControlCenterStore {
  readonly workflows = new Map<string, ControlCenterWorkflow>();
  readonly stages = new Map<string, ControlCenterStage>();
  readonly templates = new Map<string, ControlCenterEmailTemplate>();
  readonly folders = new Map<string, ControlCenterTemplateFolder>();
  callAgentConfig?: ControlCenterCallAgentConfig;
  config?: ControlCenterConfig;
}

export class ControlCenterService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly store: ControlCenterStore;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;

  constructor(private readonly deps: ControlCenterServiceDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    let counter = 0;
    this.idGenerator =
      deps.idGenerator ??
      ((prefix) => {
        counter += 1;
        return `${prefix}_${Date.now()}_${counter}`;
      });
    this.store = deps.store ?? new InMemoryControlCenterStore();
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: () => this.idGenerator("activity"),
      now: this.now,
    });
  }

  seedDefaults(input: {
    principal: Principal;
    tenantId: string;
    workflows?: ControlCenterWorkflow[];
    stages?: ControlCenterStage[];
    templates?: ControlCenterEmailTemplate[];
    folders?: ControlCenterTemplateFolder[];
    callAgentConfig?: ControlCenterCallAgentConfig;
    config?: ControlCenterConfig;
  }): void {
    for (const workflow of input.workflows ?? []) {
      this.store.workflows.set(workflow.id, workflow);
    }
    for (const stage of input.stages ?? []) {
      this.store.stages.set(stage.id, stage);
    }
    for (const template of input.templates ?? []) {
      this.store.templates.set(template.id, template);
    }
    for (const folder of input.folders ?? []) {
      this.store.folders.set(folder.id, folder);
    }
    if (input.callAgentConfig) {
      this.store.callAgentConfig = input.callAgentConfig;
    }
    if (input.config) {
      this.store.config = input.config;
    }
  }

  getStoreSnapshot(): ControlCenterPersistenceSnapshot {
    return {
      workflows: [...this.store.workflows.values()],
      stages: [...this.store.stages.values()],
      templates: [...this.store.templates.values()],
      folders: [...this.store.folders.values()],
      callAgentConfig: this.store.callAgentConfig,
      config: this.store.config,
    };
  }

  listWorkflows(): ControlCenterWorkflowListItem[] {
    return [...this.store.workflows.values()]
      .map((workflow) => ({
        ...workflow,
        approxTargetCount: Number(workflow.metadata.demoCustomerCount ?? 0),
        stages: this.listStagesForWorkflow(workflow.id),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getWorkflowDetail(workflowId: string): { workflow: ControlCenterWorkflow; stages: ControlCenterStage[] } {
    const workflow = this.requireWorkflow(workflowId);
    return { workflow, stages: this.listStagesForWorkflow(workflowId) };
  }

  createWorkflow(input: {
    principal: Principal;
    tenantId: string;
    name: string;
    category: ControlCenterWorkflow["category"];
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
  }) {
    const { principal, tenantId, ...rest } = input;
    const workflow = createControlCenterWorkflow({
      id: this.idGenerator("cc_workflow"),
      tenantId,
      actor: toActor(principal),
      at: this.now(),
      ...rest,
    });
    this.store.workflows.set(workflow.id, workflow);
    this.persistWorkflow(workflow);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.workflow_created",
      entityType: "control_center_workflow",
      entityId: workflow.id,
      metadata: { tenantId: input.tenantId },
      after: workflow as unknown as Record<string, unknown>,
    });
    return { workflow, activityEntry: entry };
  }

  updateWorkflow(
    workflowId: string,
    input: WorkflowUpdateInput & { principal: Principal },
  ) {
    const workflow = this.requireWorkflow(workflowId);
    const updated = updateControlCenterWorkflow(workflow, {
      ...input,
      actor: toActor(input.principal),
      at: this.now(),
      stageCount: this.listStagesForWorkflow(workflowId).length,
    });
    this.store.workflows.set(updated.id, updated);
    this.persistWorkflow(updated);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.workflow_updated",
      entityType: "control_center_workflow",
      entityId: updated.id,
      metadata: { tenantId: updated.tenantId },
      before: workflow as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    return { workflow: updated, activityEntry: entry };
  }

  toggleWorkflow(workflowId: string, input: { principal: Principal; enabled: boolean }) {
    const result = this.updateWorkflow(workflowId, {
      principal: input.principal,
      enabled: input.enabled,
    });
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: input.enabled
        ? "control_center.workflow_enabled"
        : "control_center.workflow_disabled",
      entityType: "control_center_workflow",
      entityId: workflowId,
      metadata: { tenantId: result.workflow.tenantId },
      after: result.workflow as unknown as Record<string, unknown>,
    });
    return { workflow: result.workflow, activityEntries: [result.activityEntry, entry] };
  }

  deleteWorkflow(workflowId: string, input: { principal: Principal }) {
    const workflow = this.requireWorkflow(workflowId);
    const removedStages = this.listStagesForWorkflow(workflowId);
    this.store.workflows.delete(workflowId);
    for (const stage of removedStages) {
      this.store.stages.delete(stage.id);
      this.deps.persistence?.deleteStage(stage.id);
    }
    this.deps.persistence?.deleteWorkflow(workflowId);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.workflow_deleted",
      entityType: "control_center_workflow",
      entityId: workflowId,
      metadata: { tenantId: workflow.tenantId, stageCount: removedStages.length },
      before: workflow as unknown as Record<string, unknown>,
    });
    return { deleted: true, activityEntry: entry };
  }

  addStage(input: {
    principal: Principal;
    tenantId: string;
    workflowId: string;
    order?: number;
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
  }) {
    this.requireWorkflow(input.workflowId);
    const { principal, tenantId, ...rest } = input;
    const stage = createControlCenterStage({
      id: this.idGenerator("cc_stage"),
      tenantId,
      actor: toActor(principal),
      at: this.now(),
      order: input.order ?? this.listStagesForWorkflow(input.workflowId).length + 1,
      ...rest,
    });
    const validation = validateControlCenterStage(stage);
    this.store.stages.set(stage.id, stage);
    this.persistStage(stage);
    this.recalculateWorkflowStageCount(input.workflowId, input.principal);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.stage_added",
      entityType: "control_center_stage",
      entityId: stage.id,
      metadata: { workflowId: input.workflowId, valid: validation.valid },
      after: stage as unknown as Record<string, unknown>,
    });
    return { stage, validation, activityEntry: entry };
  }

  updateStage(stageId: string, input: StageUpdateInput & { principal: Principal }) {
    const stage = this.requireStage(stageId);
    const updated = updateControlCenterStage(stage, {
      ...input,
      actor: toActor(input.principal),
      at: this.now(),
    });
    const validation = validateControlCenterStage(updated);
    this.store.stages.set(updated.id, updated);
    this.persistStage(updated);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.stage_updated",
      entityType: "control_center_stage",
      entityId: updated.id,
      metadata: { workflowId: updated.workflowId, valid: validation.valid },
      before: stage as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    return { stage: updated, validation, activityEntry: entry };
  }

  reorderStages(workflowId: string, input: { principal: Principal; orderedStageIds: string[] }) {
    const stages = this.listStagesForWorkflow(workflowId);
    const byId = new Map(stages.map((stage) => [stage.id, stage]));
    const updated: ControlCenterStage[] = [];
    input.orderedStageIds.forEach((stageId, index) => {
      const current = byId.get(stageId);
      if (!current) {
        return;
      }
      const next = updateControlCenterStage(current, {
        actor: toActor(input.principal),
        at: this.now(),
        order: index + 1,
      });
      this.store.stages.set(next.id, next);
      this.persistStage(next);
      updated.push(next);
    });
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.stage_reordered",
      entityType: "control_center_workflow",
      entityId: workflowId,
      metadata: { orderedStageIds: input.orderedStageIds },
      after: { orderedStageIds: input.orderedStageIds },
    });
    return { stages: this.listStagesForWorkflow(workflowId), activityEntry: entry };
  }

  removeStage(stageId: string, input: { principal: Principal }) {
    const stage = this.requireStage(stageId);
    this.store.stages.delete(stageId);
    this.deps.persistence?.deleteStage(stageId);
    this.reindexWorkflowStages(stage.workflowId, input.principal);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.stage_deleted",
      entityType: "control_center_stage",
      entityId: stageId,
      metadata: { workflowId: stage.workflowId },
      before: stage as unknown as Record<string, unknown>,
    });
    return { deleted: true, activityEntry: entry };
  }

  previewStage(stageId: string): ControlCenterStagePreview {
    const stage = this.requireStage(stageId);
    const validation = validateControlCenterStage(stage);
    return {
      stageId,
      summary: `${stage.outreachType.toUpperCase()} stage ${stage.order} uses ${stage.templateMode === "ai_generated" ? "AI generation" : "a saved template"}.`,
      validation,
      triggerSummary: describeTrigger(stage),
    };
  }

  listTemplates(search?: string) {
    const query = search?.trim().toLowerCase();
    return [...this.store.templates.values()].filter((template) => {
      if (!query) {
        return true;
      }
      return (
        template.name.toLowerCase().includes(query) ||
        template.subject.toLowerCase().includes(query) ||
        template.body.toLowerCase().includes(query)
      );
    });
  }

  listFolders() {
    return [...this.store.folders.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  createFolder(input: { principal: Principal; tenantId: string; name: string }) {
    const folder = createTemplateFolder({
      id: this.idGenerator("cc_folder"),
      tenantId: input.tenantId,
      actor: toActor(input.principal),
      at: this.now(),
      name: input.name,
    });
    this.store.folders.set(folder.id, folder);
    this.deps.persistence?.upsertFolder(folder);
    return folder;
  }

  createTemplate(input: {
    principal: Principal;
    tenantId: string;
    name: string;
    folderId?: string;
    subject: string;
    body: string;
    ccEmails?: string[];
    channelCompatibility: ControlCenterEmailTemplate["channelCompatibility"];
    autoCorrectEnabled?: boolean;
    isDefault?: boolean;
    previewSeedKey?: string;
  }) {
    const { principal, tenantId, ...rest } = input;
    const template = createEmailTemplate({
      id: this.idGenerator("cc_template"),
      tenantId,
      actor: toActor(principal),
      at: this.now(),
      ...rest,
    });
    this.store.templates.set(template.id, template);
    this.persistTemplate(template);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.template_created",
      entityType: "control_center_template",
      entityId: template.id,
      metadata: { tenantId: input.tenantId },
      after: template as unknown as Record<string, unknown>,
    });
    return { template, activityEntry: entry };
  }

  updateTemplate(
    templateId: string,
    input: TemplateUpdateInput & { principal: Principal },
  ) {
    const template = this.requireTemplate(templateId);
    const updated = updateEmailTemplate(template, {
      ...input,
      actor: toActor(input.principal),
      at: this.now(),
    });
    this.store.templates.set(updated.id, updated);
    this.persistTemplate(updated);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: updated.isArchived
        ? "control_center.template_archived"
        : "control_center.template_updated",
      entityType: "control_center_template",
      entityId: updated.id,
      metadata: { tenantId: updated.tenantId },
      before: template as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    return { template: updated, activityEntry: entry };
  }

  previewTemplate(templateId: string) {
    const template = this.requireTemplate(templateId);
    const preview = this.deps.templatePreviewResolver
      ? this.deps.templatePreviewResolver(template)
      : renderControlCenterTemplatePreview(template, {
          account: {
            id: "preview-account",
            createdAt: this.now(),
            updatedAt: this.now(),
            parentAccountId: "preview-parent",
            accountNumber: "PREVIEW-001",
            displayName: "Acme Preview Company",
            currency: "PHP",
            accountTier: "standard",
            status: "active",
            centrallyPaid: false,
            metadata: {},
          },
          contact: {
            id: "preview-contact",
            createdAt: this.now(),
            updatedAt: this.now(),
            parentAccountId: "preview-parent",
            billingAccountId: "preview-account",
            scope: "billing_account",
            scopeId: "preview-account",
            fullName: "Maria Santos",
            email: "maria.santos@example.com",
            role: "ap",
            isPrimary: true,
            isVerified: true,
            allowAutoSend: true,
            recentSuccessfulResponses: 3,
            metadata: {},
          },
          invoices: [],
          paymentUrl: "https://pay.yieldaros.example/accounts/preview-account",
          asOfDate: this.now().slice(0, 10),
        });
    return {
      template,
      preview,
    };
  }

  getCallAgentConfig() {
    if (!this.store.callAgentConfig) {
      throw new Error("Call agent config not initialized");
    }
    return this.store.callAgentConfig;
  }

  updateCallAgent(input: CallAgentUpdateInput & { principal: Principal }) {
    const current = this.getCallAgentConfig();
    const updated = updateCallAgentConfig(current, {
      ...input,
      actor: toActor(input.principal),
      at: this.now(),
    });
    this.store.callAgentConfig = updated;
    this.deps.persistence?.upsertCallAgentConfig(updated);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: "control_center.call_agent_config_updated",
      entityType: "control_center_call_agent_config",
      entityId: updated.id,
      metadata: { tenantId: updated.tenantId },
      before: current as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    return { config: updated, activityEntry: entry };
  }

  previewCallAgentPayload(): ControlCenterCallAgentProviderPreview {
    const config = this.getCallAgentConfig();
    return {
      providerType: config.providerType ?? "retell",
      readyForHandoff: config.outboundCallingEnabled,
      payload: {
        phoneNumber: config.phoneNumber,
        handoffToHumanEnabled: config.handoffToHumanEnabled,
        humanSupportNumber: config.humanSupportNumber,
        disclaimerEnabled: config.callRecordingDisclaimerEnabled,
        instructions: config.manualAgentInstructions,
        overrideOpeningLine: config.overrideOpeningLine,
        defaultBehaviorFlags: config.defaultBehaviorFlags,
      },
    };
  }

  getConfig() {
    if (!this.store.config) {
      throw new Error("Control center config not initialized");
    }
    return this.store.config;
  }

  updateConfig(input: ConfigUpdateInput & { principal: Principal }) {
    const current = this.getConfig();
    const updated = updateControlCenterConfig(current, {
      ...input,
      actor: toActor(input.principal),
      at: this.now(),
    });
    this.store.config = updated;
    this.deps.persistence?.upsertConfig(updated);
    return updated;
  }

  generateStageContent(input: { principal: Principal; workflowId?: string; stageId: string }) {
    const stage = this.requireStage(input.stageId);
    const activityEntries: ImmutableActivityLogEntry[] = [];
    activityEntries.push(
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActor(input.principal).actorRole,
        action: "control_center.ai_generation_requested",
        entityType: "control_center_stage",
        entityId: stage.id,
        metadata: { workflowId: stage.workflowId, outreachType: stage.outreachType },
      }),
    );
    const generated =
      stage.outreachType === "email"
        ? this.deps.generatedContentDeps.generateEmail({
            principal: input.principal,
            workflowId: input.workflowId,
            stage,
          })
        : stage.outreachType === "sms"
          ? this.deps.generatedContentDeps.generateSms({
              principal: input.principal,
              workflowId: input.workflowId,
              stage,
            })
          : this.deps.generatedContentDeps.generateVoice({
              principal: input.principal,
              workflowId: input.workflowId,
              stage,
            });
    if (stage.requiresApproval) {
      generated.policy = {
        ...generated.policy,
        approvalRequired: true,
        operatorReviewRequired: true,
        reviewStatus: generated.policy.outreachAllowed ? "approval_required" : generated.policy.reviewStatus,
        warnings: generated.policy.warnings.includes("approval_required")
          ? generated.policy.warnings
          : [...generated.policy.warnings, "approval_required"],
        rationale: [...generated.policy.rationale, "Stage configuration requires approval before outreach."],
      };
    }
    activityEntries.push(
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActor(input.principal).actorRole,
        action: "control_center.ai_generation_completed",
        entityType: "control_center_stage",
        entityId: stage.id,
        metadata: { workflowId: stage.workflowId, outreachType: stage.outreachType },
        after: generated as unknown as Record<string, unknown>,
      }),
    );
    if (generated.policy.approvalRequired || !generated.policy.outreachAllowed) {
      activityEntries.push(
        this.audit.append({
          actorId: input.principal.id,
          actorRole: toActor(input.principal).actorRole,
          action: "control_center.approval_gating_triggered",
          entityType: "control_center_stage",
          entityId: stage.id,
          metadata: {
            workflowId: stage.workflowId,
            approvalRequired: generated.policy.approvalRequired,
            outreachAllowed: generated.policy.outreachAllowed,
          },
        }),
      );
    }
    return { generated, activityEntries };
  }

  recordGeneratedContentFeedback(input: {
    principal: Principal;
    stageId: string;
    accepted: boolean;
    notes?: string;
  }) {
    const stage = this.requireStage(input.stageId);
    const entry = this.audit.append({
      actorId: input.principal.id,
      actorRole: toActor(input.principal).actorRole,
      action: input.accepted
        ? "control_center.operator_accepted_generated_content"
        : "control_center.operator_rejected_generated_content",
      entityType: "control_center_stage",
      entityId: stage.id,
      metadata: {
        workflowId: stage.workflowId,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });
    return { recorded: true, activityEntry: entry };
  }

  initializeBaseConfig(input: {
    principal: Principal;
    tenantId: string;
    callAgentConfig: Omit<Parameters<typeof createCallAgentConfig>[0], "id" | "tenantId" | "actor" | "at">;
    config: Omit<Parameters<typeof createControlCenterConfig>[0], "id" | "tenantId" | "actor" | "at">;
  }) {
    this.store.callAgentConfig = createCallAgentConfig({
      id: this.idGenerator("cc_call_agent"),
      tenantId: input.tenantId,
      actor: toActor(input.principal),
      at: this.now(),
      ...input.callAgentConfig,
    });
    this.store.config = createControlCenterConfig({
      id: this.idGenerator("cc_config"),
      tenantId: input.tenantId,
      actor: toActor(input.principal),
      at: this.now(),
      ...input.config,
    });
    this.deps.persistence?.upsertCallAgentConfig(this.store.callAgentConfig);
    this.deps.persistence?.upsertConfig(this.store.config);
  }

  private requireWorkflow(workflowId: string) {
    const workflow = this.store.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} was not found.`);
    }
    return workflow;
  }

  private requireStage(stageId: string) {
    const stage = this.store.stages.get(stageId);
    if (!stage) {
      throw new Error(`Stage ${stageId} was not found.`);
    }
    return stage;
  }

  private requireTemplate(templateId: string) {
    const template = this.store.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} was not found.`);
    }
    return template;
  }

  private listStagesForWorkflow(workflowId: string) {
    return [...this.store.stages.values()]
      .filter((stage) => stage.workflowId === workflowId)
      .sort((left, right) => left.order - right.order);
  }

  private recalculateWorkflowStageCount(workflowId: string, principal: Principal) {
    const workflow = this.requireWorkflow(workflowId);
    const updated = updateControlCenterWorkflow(workflow, {
      actor: toActor(principal),
      at: this.now(),
      stageCount: this.listStagesForWorkflow(workflowId).length,
    });
    this.store.workflows.set(workflowId, updated);
    this.persistWorkflow(updated);
  }

  private reindexWorkflowStages(workflowId: string, principal: Principal) {
    this.listStagesForWorkflow(workflowId).forEach((stage, index) => {
      this.store.stages.set(
        stage.id,
        updateControlCenterStage(stage, {
          actor: toActor(principal),
          at: this.now(),
          order: index + 1,
        }),
      );
    });
    this.recalculateWorkflowStageCount(workflowId, principal);
  }

  private persistWorkflow(workflow: ControlCenterWorkflow) {
    this.deps.persistence?.upsertWorkflow(workflow);
  }

  private persistStage(stage: ControlCenterStage) {
    this.deps.persistence?.upsertStage(stage);
  }

  private persistTemplate(template: ControlCenterEmailTemplate) {
    this.deps.persistence?.upsertTemplate(template);
  }
}

function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateLabel(value?: string): string {
  if (!value) {
    return "no due date";
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAliases(template: string, aliases: Record<string, string>): string {
  return Object.entries(aliases)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((output, [alias, value]) => output.replace(new RegExp(escapeRegExp(alias), "g"), value), template);
}

function applyConditionals(template: string, numericVariables: Record<string, number>): string {
  const conditionalPatterns = [
    /\{%\s*if\s+([a-z0-9_]+)\s*>\s*0\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/gi,
    /\[\%\s*if\s+([a-z0-9_]+)\s*>\s*0\s*\%\]([\s\S]*?)\[\%\s*endif\s*\%\]/gi,
  ];
  return conditionalPatterns.reduce(
    (output, pattern) =>
      output.replace(pattern, (_match, variableName: string, content: string) =>
        (numericVariables[variableName] ?? 0) > 0 ? content : "",
      ),
    template,
  );
}

function normalizePreviewWhitespace(value: string): string {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function getPreviewInvoiceAmount(invoice: CustomerInvoice): number {
  if (typeof invoice.collectibleAmountCents === "number") {
    return invoice.collectibleAmountCents;
  }
  return Math.max(invoice.amountCents - (invoice.disputedAmountCents ?? 0), 0);
}

function isPreviewEligibleInvoice(invoice: CustomerInvoice): boolean {
  return !["paid", "voided", "credit_pending"].includes(invoice.state);
}

export function renderControlCenterTemplatePreview(
  template: ControlCenterEmailTemplate,
  context: ControlCenterTemplatePreviewContext,
): ControlCenterTemplatePreview {
  const asOfDate = context.asOfDate;
  const invoices = context.invoices.filter(isPreviewEligibleInvoice);
  const overdueInvoices = invoices.filter((invoice) => invoice.dueDate && invoice.dueDate < asOfDate);
  const upcomingInvoices = invoices.filter((invoice) => invoice.dueDate && invoice.dueDate >= asOfDate);
  const overdueBalanceCents = overdueInvoices.reduce((sum, invoice) => sum + getPreviewInvoiceAmount(invoice), 0);
  const upcomingBalanceCents = upcomingInvoices.reduce((sum, invoice) => sum + getPreviewInvoiceAmount(invoice), 0);
  const totalBalanceCents = invoices.reduce((sum, invoice) => sum + getPreviewInvoiceAmount(invoice), 0);
  const overdueInvoiceSummary = overdueInvoices.length > 0
    ? overdueInvoices
        .map(
          (invoice) =>
            `- Invoice ${invoice.invoiceNumber}: ${formatMoney(getPreviewInvoiceAmount(invoice), invoice.currency)} due on ${formatDateLabel(invoice.dueDate)}`,
        )
        .join("\n")
    : "- No overdue invoices in the preview account.";
  const sampleVariables = {
    customer_name: context.contact?.fullName ?? "Accounts Payable",
    customer_email: context.contact?.email ?? "ap@example.com",
    customer_company_name: context.account.displayName,
    billing_account_name: context.account.displayName,
    customer_external_id: context.account.erpCustomerId ?? context.account.accountNumber,
    overdue_invoice_summary: overdueInvoiceSummary,
    overdue_balance: formatMoney(overdueBalanceCents, context.account.currency),
    upcoming_balance: formatMoney(upcomingBalanceCents, context.account.currency),
    total_account_balance: formatMoney(totalBalanceCents, context.account.currency),
    payment_url: context.paymentUrl,
    num_upcoming_invoices: String(upcomingInvoices.length),
    num_overdue_invoices: String(overdueInvoices.length),
  } satisfies Record<string, string>;
  const aliases: Record<string, string> = {
    "{{customer_name}}": sampleVariables.customer_name,
    "{{customer_email}}": sampleVariables.customer_email,
    "{{customer_company_name}}": sampleVariables.customer_company_name,
    "{{billing_account_name}}": sampleVariables.billing_account_name,
    "{{customer_external_id}}": sampleVariables.customer_external_id,
    "{{overdue_invoice_summary}}": sampleVariables.overdue_invoice_summary,
    "{{overdue_balance}}": sampleVariables.overdue_balance,
    "{{upcoming_balance}}": sampleVariables.upcoming_balance,
    "{{total_account_balance}}": sampleVariables.total_account_balance,
    "{{payment_url}}": sampleVariables.payment_url,
    "Customer Name": sampleVariables.customer_name,
    "Customer Company Name": sampleVariables.customer_company_name,
    "Billing Account Name": sampleVariables.billing_account_name,
    "Customer External Id": sampleVariables.customer_external_id,
    "Customer External ID": sampleVariables.customer_external_id,
    "Overdue Invoices Summary": sampleVariables.overdue_invoice_summary,
    "Overdue Invoice Summary": sampleVariables.overdue_invoice_summary,
    "Overdue Balance": sampleVariables.overdue_balance,
    "Upcoming Balance": sampleVariables.upcoming_balance,
    "Total Account Balance": sampleVariables.total_account_balance,
    "Payment URL": sampleVariables.payment_url,
  };
  const numericVariables = {
    num_upcoming_invoices: upcomingInvoices.length,
    num_overdue_invoices: overdueInvoices.length,
  };
  const subject = normalizePreviewWhitespace(
    replaceAliases(applyConditionals(template.subject, numericVariables), aliases),
  );
  const body = normalizePreviewWhitespace(
    replaceAliases(applyConditionals(template.body, numericVariables), aliases),
  );
  const applyAutoCorrect = (value: string) =>
    template.autoCorrectEnabled
      ? value.replaceAll(" dont ", " don't ").replaceAll(" cant ", " can't ")
      : value;
  return {
    subject: applyAutoCorrect(subject),
    body: applyAutoCorrect(body),
    sampleVariables,
  };
}

function describeTrigger(stage: ControlCenterStage): string {
  const comparator = stage.triggerConfig.comparator ?? stage.triggerType;
  if (comparator === "due_in_days") {
    return `Runs ${stage.triggerConfig.offsetDays ?? 0} day(s) before due date.`;
  }
  if (comparator === "days_past_due") {
    return `Runs ${stage.triggerConfig.offsetDays ?? 0} day(s) after due date.`;
  }
  if (comparator === "no_response_after_prior_stage") {
    return `Runs after no response following stage ${stage.triggerConfig.referenceStageId ?? "previous"}.`;
  }
  if (comparator === "manual") {
    return "Operator triggers this stage manually.";
  }
  return `Trigger type: ${comparator.replaceAll("_", " ")}.`;
}
