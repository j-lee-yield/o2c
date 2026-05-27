import { describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { ControlCenterService, InMemoryControlCenterStore } from "./control-center.js";

const principal = { id: "tester", roles: ["ar_manager"] as const };

function createGeneratedContentDeps() {
  return {
    generateEmail: () => ({
      channel: "email" as const,
      retrievedContext: {
        sourcesUsed: ["current_receivable_context"],
        selectedThreadIds: [],
        omittedThreadIds: [],
        retrievalOrder: ["current_receivable_context"],
        notes: [],
      },
      policy: {
        outreachAllowed: true,
        operatorReviewRequired: false,
        approvalRequired: false,
        escalationRequired: false,
        confidenceLow: false,
        reviewStatus: "ready_for_review" as const,
        disallowedStatements: [],
        prohibitedClaims: [],
        warnings: [],
        channelRestrictions: {
          email: [],
          voiceAgent: [],
          sms: [],
          autoSendAllowed: true,
          handoffAllowed: true,
        },
        rationale: ["safe"],
      },
      emailDraft: {
        kind: "email" as const,
        subjectSuggestions: ["Subject"],
        emailBody: "Email",
        toneLabel: "conservative",
        personalizationSummary: "summary",
        warnings: [],
        contextUsed: {
          sourcesUsed: ["current_receivable_context"],
          selectedThreadIds: [],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context"],
          notes: [],
        },
      },
    }),
    generateSms: () => ({
      channel: "sms" as const,
      retrievedContext: {
        sourcesUsed: ["current_receivable_context"],
        selectedThreadIds: [],
        omittedThreadIds: [],
        retrievalOrder: ["current_receivable_context"],
        notes: [],
      },
      policy: {
        outreachAllowed: false,
        operatorReviewRequired: true,
        approvalRequired: true,
        escalationRequired: false,
        confidenceLow: true,
        reviewStatus: "approval_required" as const,
        disallowedStatements: [],
        prohibitedClaims: [],
        warnings: ["unverified_contact"],
        channelRestrictions: {
          email: [],
          voiceAgent: [],
          sms: [],
          autoSendAllowed: false,
          handoffAllowed: false,
        },
        rationale: ["review"],
      },
      smsDraft: {
        kind: "sms" as const,
        variants: ["SMS"],
        messagePurposeLabel: "payment_follow_up",
        toneLabel: "conservative",
        personalizationSummary: "summary",
        warnings: ["unverified_contact"],
        contextUsed: {
          sourcesUsed: ["current_receivable_context"],
          selectedThreadIds: [],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context"],
          notes: [],
        },
      },
    }),
    generateVoice: () => ({
      channel: "voice_agent" as const,
      retrievedContext: {
        sourcesUsed: ["current_receivable_context"],
        selectedThreadIds: [],
        omittedThreadIds: [],
        retrievalOrder: ["current_receivable_context"],
        notes: [],
      },
      policy: {
        outreachAllowed: false,
        operatorReviewRequired: true,
        approvalRequired: true,
        escalationRequired: true,
        confidenceLow: true,
        reviewStatus: "blocked" as const,
        disallowedStatements: ["Do not chase disputed invoices"],
        prohibitedClaims: [],
        warnings: ["disputed_invoice"],
        channelRestrictions: {
          email: [],
          voiceAgent: [],
          sms: [],
          autoSendAllowed: false,
          handoffAllowed: false,
        },
        rationale: ["blocked"],
      },
      voicePayload: {
        kind: "voice_agent" as const,
        agentBrief: "Brief",
        conversationGoal: "Goal",
        customerContext: ["Customer"],
        receivablesContext: ["Receivable"],
        safeTalkingPoints: ["Talk point"],
        disallowedStatements: ["Do not chase disputed invoices"],
        objectionHandlingGuidance: ["Guide"],
        handoffConditions: ["Handoff"],
        toneGuidance: "Calm",
        postCallOutcomeSchema: [{ field: "outcome", description: "Outcome", required: true }],
        warnings: ["disputed_invoice"],
        contextUsed: {
          sourcesUsed: ["current_receivable_context"],
          selectedThreadIds: [],
          omittedThreadIds: [],
          retrievalOrder: ["current_receivable_context"],
          notes: [],
        },
      },
    }),
  };
}

function createService() {
  const store = new InMemoryControlCenterStore();
  const service = new ControlCenterService({
    activityStore: new InMemoryImmutableActivityLogStore(),
    store,
    generatedContentDeps: createGeneratedContentDeps(),
  });
  service.initializeBaseConfig({
    principal,
    tenantId: "default",
    callAgentConfig: {
      phoneNumber: "+63 2 8555 0188",
      smsEnabled: true,
      outboundCallingEnabled: true,
      handoffToHumanEnabled: true,
      manualAgentInstructions: "Help",
      callRecordingDisclaimerEnabled: true,
      defaultBehaviorFlags: [],
    },
    config: {
      defaultTimezone: "Asia/Manila",
      defaultSenderBehavior: "workflow_specific",
      allowedChannels: ["email", "sms", "call"],
      channelFallbackPolicy: "manual_review_only",
      sandboxMode: "test_recipients_only",
      defaultRiskApprovalMode: "strict",
    },
  });
  return service;
}

function createPersistenceTracker() {
  return {
    loadSnapshot: () => ({
      workflows: [],
      stages: [],
      executions: [],
      templates: [],
      folders: [],
      callAgentConfig: undefined,
      config: undefined,
    }),
    upsertWorkflowCalls: [] as string[],
    deleteWorkflowCalls: [] as string[],
    upsertStageCalls: [] as string[],
    deleteStageCalls: [] as string[],
    upsertExecutionCalls: [] as string[],
    deleteExecutionCalls: [] as string[],
    upsertTemplateCalls: [] as string[],
    upsertFolderCalls: [] as string[],
    upsertCallAgentConfigCalls: [] as string[],
    upsertConfigCalls: [] as string[],
    upsertWorkflow(workflow: { id: string }) {
      this.upsertWorkflowCalls.push(workflow.id);
    },
    deleteWorkflow(workflowId: string) {
      this.deleteWorkflowCalls.push(workflowId);
    },
    upsertStage(stage: { id: string }) {
      this.upsertStageCalls.push(stage.id);
    },
    deleteStage(stageId: string) {
      this.deleteStageCalls.push(stageId);
    },
    upsertExecution(execution: { id: string }) {
      this.upsertExecutionCalls.push(execution.id);
    },
    deleteExecution(executionId: string) {
      this.deleteExecutionCalls.push(executionId);
    },
    upsertTemplate(template: { id: string }) {
      this.upsertTemplateCalls.push(template.id);
    },
    upsertFolder(folder: { id: string }) {
      this.upsertFolderCalls.push(folder.id);
    },
    upsertCallAgentConfig(config: { id: string }) {
      this.upsertCallAgentConfigCalls.push(config.id);
    },
    upsertConfig(config: { id: string }) {
      this.upsertConfigCalls.push(config.id);
    },
  };
}

describe("ControlCenterService", () => {
  it("supports workflow and stage CRUD with reorder", () => {
    const service = createService();
    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Collections",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday", "tuesday"],
    }).workflow;

    const stageOne = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "email",
      triggerType: "relative_due_date",
      triggerConfig: { comparator: "due_in_days", offsetDays: 2 },
      templateMode: "ai_generated",
      aiStrategyId: "email_default",
    }).stage;
    const stageTwo = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "sms",
      triggerType: "response_gap",
      triggerConfig: { comparator: "no_response_after_prior_stage", referenceStageId: stageOne.id },
      templateMode: "ai_generated",
      aiStrategyId: "sms_default",
    }).stage;

    service.reorderStages(workflow.id, {
      principal,
      orderedStageIds: [stageTwo.id, stageOne.id],
    });

    expect(service.getWorkflowDetail(workflow.id).stages.map((stage) => stage.id)).toEqual([
      stageTwo.id,
      stageOne.id,
    ]);

    service.removeStage(stageOne.id, { principal });
    expect(service.getWorkflowDetail(workflow.id).stages).toHaveLength(1);
  });

  it("validates stage requirements by outreach type and mode", () => {
    const service = createService();
    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Collections",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday"],
    }).workflow;

    const result = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "call",
      triggerType: "response_gap",
      triggerConfig: { comparator: "no_response_after_prior_stage" },
      templateMode: "pre_saved_template",
      templateId: "template_1",
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues[0]).toContain("reference a prior stage");
    expect(result.validation.warnings[0]).toContain("Call stages");
  });

  it("supports template preview and call agent updates", () => {
    const service = createService();
    const folder = service.createFolder({ principal, tenantId: "default", name: "Collections" });
    const template = service.createTemplate({
      principal,
      tenantId: "default",
      folderId: folder.id,
      name: "Reminder",
      subject: "Reminder for Customer Company Name",
      body:
        "Hi Customer Name\nOverdue Invoices Summary\n{% if num_upcoming_invoices > 0 %}Upcoming Balance{% endif %}\nOverdue Balance",
      ccEmails: ["collector@example.com"],
      channelCompatibility: ["email"],
      autoCorrectEnabled: true,
    }).template;

    expect(template.ccEmails).toEqual(["collector@example.com"]);
    expect(template.autoCorrectEnabled).toBe(true);
    expect(service.previewTemplate(template.id).preview.body).toContain("Maria Santos");
    expect(service.previewTemplate(template.id).preview.body).not.toContain("Customer Name");
    expect(service.updateCallAgent({ principal, phoneNumber: "+63 2 8999 0000" }).config.phoneNumber).toBe(
      "+63 2 8999 0000",
    );
  });

  it("persists workflow, stage, and config mutations through the configured adapter", () => {
    const persistence = createPersistenceTracker();
    const service = new ControlCenterService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      store: new InMemoryControlCenterStore(),
      persistence,
      generatedContentDeps: createGeneratedContentDeps(),
    });
    service.initializeBaseConfig({
      principal,
      tenantId: "default",
      callAgentConfig: {
        phoneNumber: "+63 2 8555 0188",
        smsEnabled: true,
        outboundCallingEnabled: true,
        handoffToHumanEnabled: true,
        manualAgentInstructions: "Help",
        callRecordingDisclaimerEnabled: true,
        defaultBehaviorFlags: [],
      },
      config: {
        defaultTimezone: "Asia/Manila",
        defaultSenderBehavior: "workflow_specific",
        allowedChannels: ["email", "sms", "call"],
        channelFallbackPolicy: "manual_review_only",
        sandboxMode: "test_recipients_only",
        defaultRiskApprovalMode: "strict",
      },
    });

    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Persisted Workflow",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday"],
    }).workflow;
    const stage = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "email",
      triggerType: "relative_due_date",
      triggerConfig: { comparator: "due_in_days", offsetDays: 1 },
      templateMode: "ai_generated",
      aiStrategyId: "email_default",
    }).stage;

    service.removeStage(stage.id, { principal });
    service.deleteWorkflow(workflow.id, { principal });

    expect(persistence.upsertCallAgentConfigCalls).toHaveLength(1);
    expect(persistence.upsertConfigCalls).toHaveLength(1);
    expect(persistence.upsertWorkflowCalls).toContain(workflow.id);
    expect(persistence.upsertStageCalls).toContain(stage.id);
    expect(persistence.deleteStageCalls).toContain(stage.id);
    expect(persistence.deleteWorkflowCalls).toContain(workflow.id);
  });

  it("assigns billing accounts into workflows idempotently and counts live assignments", () => {
    const persistence = createPersistenceTracker();
    const service = new ControlCenterService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      store: new InMemoryControlCenterStore(),
      persistence,
      generatedContentDeps: createGeneratedContentDeps(),
    });
    service.initializeBaseConfig({
      principal,
      tenantId: "default",
      callAgentConfig: {
        phoneNumber: "+63 2 8555 0188",
        smsEnabled: true,
        outboundCallingEnabled: true,
        handoffToHumanEnabled: true,
        manualAgentInstructions: "Help",
        callRecordingDisclaimerEnabled: true,
        defaultBehaviorFlags: [],
      },
      config: {
        defaultTimezone: "Asia/Manila",
        defaultSenderBehavior: "workflow_specific",
        allowedChannels: ["email", "sms", "call"],
        channelFallbackPolicy: "manual_review_only",
        sandboxMode: "test_recipients_only",
        defaultRiskApprovalMode: "strict",
      },
    });
    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Assigned Workflow",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday"],
    }).workflow;

    const first = service.assignWorkflowCustomer({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      billingAccountId: "11111111-1111-4111-8111-111111111111",
      parentAccountId: "22222222-2222-4222-8222-222222222222",
    });
    const duplicate = service.assignWorkflowCustomer({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      billingAccountId: "11111111-1111-4111-8111-111111111111",
      parentAccountId: "22222222-2222-4222-8222-222222222222",
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(service.listWorkflowExecutions(workflow.id)).toHaveLength(1);
    expect(service.listWorkflows().find((item) => item.id === workflow.id)?.approxTargetCount).toBe(1);
    expect(persistence.upsertExecutionCalls).toContain(first.execution.id);
  });

  it("pauses, resumes, and unenrolls workflow customers", () => {
    const persistence = createPersistenceTracker();
    const service = new ControlCenterService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      store: new InMemoryControlCenterStore(),
      persistence,
      generatedContentDeps: createGeneratedContentDeps(),
    });
    service.initializeBaseConfig({
      principal,
      tenantId: "default",
      callAgentConfig: {
        phoneNumber: "+63 2 8555 0188",
        smsEnabled: true,
        outboundCallingEnabled: true,
        handoffToHumanEnabled: true,
        manualAgentInstructions: "Help",
        callRecordingDisclaimerEnabled: true,
        defaultBehaviorFlags: [],
      },
      config: {
        defaultTimezone: "Asia/Manila",
        defaultSenderBehavior: "workflow_specific",
        allowedChannels: ["email", "sms", "call"],
        channelFallbackPolicy: "manual_review_only",
        sandboxMode: "test_recipients_only",
        defaultRiskApprovalMode: "strict",
      },
    });
    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Managed Enrollments",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday"],
    }).workflow;
    const assigned = service.assignWorkflowCustomer({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      billingAccountId: "33333333-3333-4333-8333-333333333333",
      parentAccountId: "44444444-4444-4444-8444-444444444444",
    }).execution;

    const paused = service.pauseWorkflowCustomer({
      principal,
      workflowId: workflow.id,
      executionId: assigned.id,
      reason: "Operator paused this customer while reviewing account health.",
    }).execution;
    expect(paused.status).toBe("paused");

    const resumed = service.resumeWorkflowCustomer({
      principal,
      workflowId: workflow.id,
      executionId: assigned.id,
    }).execution;
    expect(resumed.status).toBe("active");

    const unenrolled = service.unenrollWorkflowCustomer({
      principal,
      workflowId: workflow.id,
      executionId: assigned.id,
    });
    expect(unenrolled.unenrolled).toBe(true);
    expect(service.listWorkflowExecutions(workflow.id)).toHaveLength(0);
    expect(persistence.deleteExecutionCalls).toContain(assigned.id);
  });

  it("generates conservative channel outputs and records feedback", () => {
    const service = createService();
    const workflow = service.createWorkflow({
      principal,
      tenantId: "default",
      category: "collections",
      name: "Collections",
      timezone: "Asia/Manila",
      outreachWindowStart: "08:00",
      outreachWindowEnd: "17:00",
      outreachDays: ["monday"],
    }).workflow;

    const emailStage = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "email",
      triggerType: "relative_due_date",
      triggerConfig: { comparator: "days_past_due", offsetDays: 1 },
      templateMode: "ai_generated",
      aiStrategyId: "email_default",
    }).stage;
    const smsStage = service.addStage({
      principal,
      tenantId: "default",
      workflowId: workflow.id,
      outreachType: "sms",
      triggerType: "relative_due_date",
      triggerConfig: { comparator: "days_past_due", offsetDays: 3 },
      templateMode: "ai_generated",
      aiStrategyId: "sms_default",
    }).stage;

    expect(service.generateStageContent({ principal, stageId: emailStage.id }).generated.emailDraft?.emailBody).toBe(
      "Email",
    );
    const sms = service.generateStageContent({ principal, stageId: smsStage.id }).generated;
    expect(sms.policy.approvalRequired).toBe(true);
    expect(sms.smsDraft?.warnings).toContain("unverified_contact");
    expect(service.recordGeneratedContentFeedback({ principal, stageId: smsStage.id, accepted: false }).recorded).toBe(
      true,
    );
  });
});
