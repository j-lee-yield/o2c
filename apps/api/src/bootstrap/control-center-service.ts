import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresControlCenterPersistence,
  PostgresImmutableActivityLogStore,
} from "@o2c/database";
import {
  type ControlCenterGeneratedStageContent,
  type ControlCenterConsoleData,
} from "@o2c/contracts";
import type { Principal } from "@o2c/auth";
import type { Contact } from "@o2c/domain";
import { buildDemoSeedBundle } from "@o2c/seed";
import {
  ControlCenterService,
  InMemoryControlCenterStore,
  renderControlCenterTemplatePreview,
  type ControlCenterGeneratedContentRequest,
} from "@o2c/workflows";
import { getOutreachIntelligenceService } from "./outreach-intelligence-service.js";

const defaultPrincipal: Principal = { id: "control_center_seed", roles: ["admin"] };
let controlCenterService: ControlCenterService | undefined;

export function getControlCenterService(): ControlCenterService {
  if (controlCenterService) {
    return controlCenterService;
  }

  const databaseUrl = createDatabaseClientConfig().connectionString;
  const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
  const persistence = databaseBacked
    ? new PostgresControlCenterPersistence(databaseUrl, "default")
    : undefined;
  const store = new InMemoryControlCenterStore();
  const outreach = getOutreachIntelligenceService();
  const demo = buildDemoSeedBundle();
  const sampleAccount = demo.billingAccounts[0]!;
  const sampleInvoices = demo.invoices.filter((invoice) => invoice.billingAccountId === sampleAccount.id).slice(0, 2);
  const sampleContact: Contact = {
    id: "control_center_contact_1",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
    parentAccountId: sampleAccount.parentAccountId,
    billingAccountId: sampleAccount.id,
    ...(sampleAccount.branchId ? { branchId: sampleAccount.branchId } : {}),
    scope: "billing_account",
    scopeId: sampleAccount.id,
    fullName: "Maria Santos",
    email: "maria.santos@example.com",
    phone: "+639171234567",
    role: "ap",
    isPrimary: true,
    isVerified: true,
    allowAutoSend: true,
    recentSuccessfulResponses: 4,
    metadata: {},
  };

  const buildGeneration = (
    channel: "email" | "sms" | "voice_agent",
    request: ControlCenterGeneratedContentRequest,
  ): ControlCenterGeneratedStageContent => {
    const generatedBase = {
      principal: request.principal,
      tenantId: "default",
      channel,
      intent:
        request.stage.triggerConfig.comparator === "remittance_missing_after_payment"
          ? ("request_remittance" as const)
          : request.stage.triggerConfig.comparator === "promise_missed"
            ? ("ptp_follow_up" as const)
            : ("overdue_follow_up" as const),
      account: sampleAccount,
      invoices: request.stage.triggerConfig.comparator === "promise_missed"
        ? sampleInvoices.map((invoice, index) =>
            index === 0 ? { ...invoice, state: "matched_to_erp" as const } : invoice,
          )
        : sampleInvoices,
      contact: sampleContact,
      operatorIntent: request.stage.notes,
    };

    if (channel === "email") {
      const result = outreach.generateEmailDraft(generatedBase);
      return {
        channel,
        retrievedContext: result.bundle.explanation,
        policy: result.policy,
        emailDraft: result.draft,
      };
    }
    if (channel === "sms") {
      const result = outreach.generateSmsDraft(generatedBase);
      return {
        channel,
        retrievedContext: result.bundle.explanation,
        policy: result.policy,
        smsDraft: result.draft,
      };
    }
    const result = outreach.generateVoiceAgentPayload(generatedBase);
    return {
      channel,
      retrievedContext: result.bundle.explanation,
      policy: result.policy,
      voicePayload: result.payload,
    };
  };

  controlCenterService = new ControlCenterService({
    activityStore: databaseBacked
      ? new PostgresImmutableActivityLogStore(databaseUrl, "default")
      : new InMemoryImmutableActivityLogStore(),
    store,
    ...(persistence ? { persistence } : {}),
    generatedContentDeps: {
      generateEmail: (request) => buildGeneration("email", request),
      generateSms: (request) => buildGeneration("sms", request),
      generateVoice: (request) => buildGeneration("voice_agent", request),
    },
    templatePreviewResolver: (template) => {
      const previewAccount =
        demo.billingAccounts.find((account) => account.id === template.previewSeedKey) ??
        demo.billingAccounts.find((account) => account.displayName === template.previewSeedKey) ??
        sampleAccount;
      const previewInvoices = demo.invoices.filter((invoice) => invoice.billingAccountId === previewAccount.id);
      return renderControlCenterTemplatePreview(template, {
        account: previewAccount,
        contact: sampleContact,
        invoices: previewInvoices,
        paymentUrl: `https://pay.yieldaros.example/accounts/${previewAccount.id}`,
        asOfDate: "2026-04-16",
      });
    },
  });

  const snapshot = persistence?.loadSnapshot();
  if (snapshot) {
    controlCenterService.seedDefaults({
      principal: defaultPrincipal,
      tenantId: "default",
      ...snapshot,
    });
  }
  hydrateOrSeedControlCenter(controlCenterService);

  return controlCenterService;
}

function hydrateOrSeedControlCenter(service: ControlCenterService) {
  const snapshot = service.getStoreSnapshot();

  if (!snapshot.callAgentConfig || !snapshot.config) {
    service.initializeBaseConfig({
      principal: defaultPrincipal,
      tenantId: "default",
      callAgentConfig: {
        phoneNumber: "+63 2 8555 0188",
        smsEnabled: true,
        outboundCallingEnabled: true,
        humanSupportNumber: "+63 2 8555 0199",
        handoffToHumanEnabled: true,
        manualAgentInstructions:
          "Stay factual, ask for remittance or payment timing, and hand off disputes or ambiguity to a human operator.",
        overrideOpeningLine:
          "Hello, this is Yield AROS following up on your supplier receivables account.",
        callRecordingDisclaimerEnabled: true,
        providerType: "retell",
        providerConfigMetadata: { environment: "preview", region: "ph" },
        defaultBehaviorFlags: ["collect_branch_context", "capture_ptp", "escalate_on_dispute"],
      },
      config: {
        defaultTimezone: "Asia/Manila",
        defaultSenderBehavior: "workflow_specific",
        allowedChannels: ["email", "sms", "call"],
        channelFallbackPolicy: "manual_review_only",
        sandboxMode: "test_recipients_only",
        defaultRiskApprovalMode: "strict",
        seededDemoFlags: { showSeedTargetCounts: true, allowPreviewHandoffs: true },
      },
    });
  }

  if (snapshot.workflows.length > 0) {
    return;
  }

  const collectionsWorkflow = service.createWorkflow({
    principal: defaultPrincipal,
    tenantId: "default",
    name: "Standard Overdue Collections",
    category: "collections",
    enabled: true,
    senderEmail: "collections@yieldaros.example",
    testEmailRecipient: "qa-collections@yieldaros.example",
    testCallRecipient: "+639171110000",
    timezone: "Asia/Manila",
    outreachWindowStart: "08:00",
    outreachWindowEnd: "17:30",
    outreachDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    weekendCallingEnabled: false,
    metadata: { demoCustomerCount: 42, seeded: true },
  }).workflow;

  const paymentsWorkflow = service.createWorkflow({
    principal: defaultPrincipal,
    tenantId: "default",
    name: "Payment Follow-up Escalations",
    category: "payments",
    enabled: false,
    senderEmail: "payments@yieldaros.example",
    timezone: "Asia/Manila",
    outreachWindowStart: "09:00",
    outreachWindowEnd: "16:30",
    outreachDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    weekendCallingEnabled: false,
    metadata: { demoCustomerCount: 18, seeded: true },
  }).workflow;

  const folder = service.createFolder({
    principal: defaultPrincipal,
    tenantId: "default",
    name: "Collections Core",
  });
  const reminderTemplate = service.createTemplate({
    principal: defaultPrincipal,
    tenantId: "default",
    name: "Friendly Due Reminder",
    folderId: folder.id,
    subject: "Follow-up for {{billing_account_name}} invoices",
    body:
      "Hi {{customer_name}},\n\nWe are following up on {{invoice_numbers}} for {{billing_account_name}} / {{branch_name}}. If payment has already been released, please share the remittance reference so we can review it safely.\n\nThank you.",
    ccEmails: ["collections.manager@yieldaros.example"],
    channelCompatibility: ["email", "sms"],
    autoCorrectEnabled: true,
    isDefault: true,
    previewSeedKey: "bill-default",
  }).template;
  service.createTemplate({
    principal: defaultPrincipal,
    tenantId: "default",
    name: "Call Follow-up Notes",
    folderId: folder.id,
    subject: "Voice follow-up context",
    body:
      "Confirm payment timing, ask for remittance if available, and avoid claiming cash application certainty when branch or entity ownership is unclear.",
    ccEmails: [],
    channelCompatibility: ["voice_agent"],
    autoCorrectEnabled: false,
    previewSeedKey: "bill-default",
  });

  service.addStage({
    principal: defaultPrincipal,
    tenantId: "default",
    workflowId: collectionsWorkflow.id,
    outreachType: "email",
    triggerType: "relative_due_date",
    triggerConfig: { comparator: "due_in_days", offsetDays: 3 },
    templateMode: "pre_saved_template",
    templateId: reminderTemplate.id,
    notes: "Friendly pre-due reminder for verified AP contacts.",
    enabled: true,
    requiresApproval: false,
    riskHints: ["verified_contact_only", "preserve_branch_context"],
  });
  service.addStage({
    principal: defaultPrincipal,
    tenantId: "default",
    workflowId: collectionsWorkflow.id,
    outreachType: "sms",
    triggerType: "relative_due_date",
    triggerConfig: { comparator: "days_past_due", offsetDays: 5 },
    templateMode: "ai_generated",
    aiStrategyId: "strategy_sms_conservative",
    notes: "Conservative short reminder when no reply exists after email.",
    enabled: true,
    requiresApproval: true,
    riskHints: ["approval_for_non_email", "no_disputed_invoice_chasing"],
  });
  service.addStage({
    principal: defaultPrincipal,
    tenantId: "default",
    workflowId: paymentsWorkflow.id,
    outreachType: "call",
    triggerType: "payment_signal_state",
    triggerConfig: { comparator: "remittance_missing_after_payment", offsetDays: 1 },
    templateMode: "ai_generated",
    aiStrategyId: "strategy_voice_remittance",
    notes: "Voice follow-up if a payment signal exists but remittance is still missing.",
    enabled: true,
    requiresApproval: true,
    riskHints: ["payment_signal_requires_careful_language"],
  });
}

export function buildControlCenterConsoleData(principal: Principal = defaultPrincipal): ControlCenterConsoleData {
  const service = getControlCenterService();
  const workflows = service.listWorkflows();
  const firstWorkflow = workflows[0];
  const firstEmailStage = workflows.flatMap((workflow) => workflow.stages).find((stage) => stage.outreachType === "email");
  const firstSmsStage = workflows.flatMap((workflow) => workflow.stages).find((stage) => stage.outreachType === "sms");
  const firstVoiceStage = workflows.flatMap((workflow) => workflow.stages).find((stage) => stage.outreachType === "call");

  const email = firstEmailStage
    ? service.generateStageContent({
        principal,
        ...(firstWorkflow?.id ? { workflowId: firstWorkflow.id } : {}),
        stageId: firstEmailStage.id,
      }).generated
    : emptyGeneration("email");
  const sms = firstSmsStage
    ? service.generateStageContent({
        principal,
        ...(firstWorkflow?.id ? { workflowId: firstWorkflow.id } : {}),
        stageId: firstSmsStage.id,
      }).generated
    : emptyGeneration("sms");
  const voice = firstVoiceStage
    ? service.generateStageContent({
        principal,
        ...(firstWorkflow?.id ? { workflowId: firstWorkflow.id } : {}),
        stageId: firstVoiceStage.id,
      }).generated
    : emptyGeneration("voice_agent");

  return {
    workflows,
    templates: service.listTemplates(),
    folders: service.listFolders(),
    callAgentConfig: service.getCallAgentConfig(),
    config: service.getConfig(),
    generationPreview: { email, sms, voice },
    providerPreview: service.previewCallAgentPayload(),
  };
}

function emptyGeneration(
  channel: "email" | "sms" | "voice_agent",
): ControlCenterGeneratedStageContent {
  return {
    channel,
    retrievedContext: {
      sourcesUsed: [],
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
      reviewStatus: "blocked",
      disallowedStatements: [],
      prohibitedClaims: [],
      warnings: [],
      channelRestrictions: {
        email: [],
        voiceAgent: [],
        sms: [],
        autoSendAllowed: false,
        handoffAllowed: false,
      },
      rationale: ["No preview stage configured."],
    },
  };
}

export function resetControlCenterServiceForTests() {
  controlCenterService = undefined;
}
