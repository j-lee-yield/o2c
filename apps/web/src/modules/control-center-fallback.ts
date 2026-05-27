import type {
  ControlCenterConsoleData,
  ControlCenterEmailTemplate,
  ControlCenterStage,
  ControlCenterWorkflow,
  ControlCenterWorkflowExecution,
} from "@o2c/contracts";

let fallbackControlCenter: ControlCenterConsoleData | undefined;
let fallbackWorkflowCounter = 1;

export function resetFallbackControlCenter() {
  fallbackControlCenter = undefined;
  fallbackWorkflowCounter = 1;
}

export function getFallbackControlCenter(seedFactory: () => ControlCenterConsoleData): ControlCenterConsoleData {
  if (!fallbackControlCenter) {
    fallbackControlCenter = seedFactory();
  }
  return fallbackControlCenter;
}

export function createFallbackWorkflow(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    tenantId: string;
    category: ControlCenterWorkflow["category"];
    name: string;
    senderEmail?: string;
    testEmailRecipient?: string;
    testCallRecipient?: string;
    timezone: string;
    outreachWindowStart: string;
    outreachWindowEnd: string;
    outreachDays: ControlCenterWorkflow["outreachDays"];
    weekendCallingEnabled: boolean;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const now = new Date().toISOString();
  const workflowId = `cc_workflow_local_${fallbackWorkflowCounter++}`;
  const workflow = {
    id: workflowId,
    tenantId: input.tenantId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    category: input.category,
    name: input.name,
    enabled: false,
    ...(input.senderEmail ? { senderEmail: input.senderEmail } : {}),
    ...(input.testEmailRecipient ? { testEmailRecipient: input.testEmailRecipient } : {}),
    ...(input.testCallRecipient ? { testCallRecipient: input.testCallRecipient } : {}),
    timezone: input.timezone,
    outreachWindowStart: input.outreachWindowStart,
    outreachWindowEnd: input.outreachWindowEnd,
    outreachDays: [...input.outreachDays],
    weekendCallingEnabled: input.weekendCallingEnabled,
    stageCount: 0,
    metadata: { seeded: false, createdLocally: true },
    approxTargetCount: 0,
    stages: [],
    executions: [],
  } satisfies ControlCenterConsoleData["workflows"][number];

  state.workflows = [workflow, ...state.workflows];
  return workflow;
}

export function replaceFallbackWorkflow(
  seedFactory: () => ControlCenterConsoleData,
  workflowId: string,
  updater: (workflow: ControlCenterConsoleData["workflows"][number]) => ControlCenterConsoleData["workflows"][number],
) {
  const state = getFallbackControlCenter(seedFactory);
  state.workflows = state.workflows.map((workflow) => (workflow.id === workflowId ? updater(workflow) : workflow));
}

export function deleteFallbackWorkflow(seedFactory: () => ControlCenterConsoleData, workflowId: string) {
  const state = getFallbackControlCenter(seedFactory);
  state.workflows = state.workflows.filter((workflow) => workflow.id !== workflowId);
}

export function toggleFallbackWorkflow(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    enabled: boolean;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return undefined;
  }
  const now = new Date().toISOString();
  workflow.enabled = input.enabled;
  workflow.updatedAt = now;
  workflow.metadata = {
    ...workflow.metadata,
    lastChangedBy: "human",
    controlCenterFallback: true,
  };
  return workflow;
}

export function listFallbackWorkflows(seedFactory: () => ControlCenterConsoleData) {
  return getFallbackControlCenter(seedFactory).workflows;
}

export function assignFallbackWorkflowCustomer(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    billingAccountId: string;
    parentAccountId: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return undefined;
  }
  if (workflow.executions.some((execution) => execution.billingAccountId === input.billingAccountId)) {
    return workflow.executions.find((execution) => execution.billingAccountId === input.billingAccountId);
  }
  const now = new Date().toISOString();
  const execution = {
    id: `cc_execution_local_${fallbackWorkflowCounter++}`,
    tenantId: workflow.tenantId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    workflowId: workflow.id,
    billingAccountId: input.billingAccountId,
    parentAccountId: input.parentAccountId,
    status: "active",
    currentTrack: "standard_reminders",
    lastDecisionAction: "continue",
    lastDecisionReason: "workflow_customer_enrolled",
    lastDecisionConfidence: 1,
    requiresHumanReview: false,
    rationaleSummary: "Customer enrolled from the local Control Center fallback.",
    reasoningMetadata: {},
    metadata: { lastChangedBy: "human" },
  } satisfies ControlCenterWorkflowExecution;
  workflow.executions = [execution, ...workflow.executions];
  workflow.approxTargetCount = workflow.executions.length;
  workflow.updatedAt = now;
  return execution;
}

export function pauseFallbackWorkflowCustomer(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    executionId: string;
    reason?: string;
    effectiveUntil?: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return undefined;
  }
  const execution = workflow.executions.find((item) => item.id === input.executionId);
  if (!execution) {
    return undefined;
  }
  const now = new Date().toISOString();
  execution.status = "paused";
  execution.lastDecisionAction = "pause";
  execution.lastDecisionReason = input.reason ?? "workflow_customer_paused";
  execution.lastDecisionConfidence = 1;
  execution.requiresHumanReview = false;
  execution.rationaleSummary = input.reason ?? "Workflow enrollment was paused by an authorized operator.";
  execution.reasoningMetadata = {
    ...execution.reasoningMetadata,
    source: "control_center_fallback",
    manualAction: "pause",
  };
  execution.metadata = {
    ...execution.metadata,
    lastChangedBy: "human",
    enrollmentState: "paused",
  };
  execution.updatedAt = now;
  if (input.effectiveUntil) {
    execution.effectiveUntil = input.effectiveUntil;
  } else {
    delete execution.effectiveUntil;
  }
  workflow.updatedAt = now;
  return execution;
}

export function resumeFallbackWorkflowCustomer(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    executionId: string;
    reason?: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return undefined;
  }
  const execution = workflow.executions.find((item) => item.id === input.executionId);
  if (!execution) {
    return undefined;
  }
  const now = new Date().toISOString();
  execution.status = "active";
  execution.lastDecisionAction = "continue";
  execution.lastDecisionReason = input.reason ?? "workflow_customer_resumed";
  execution.lastDecisionConfidence = 1;
  execution.requiresHumanReview = false;
  execution.rationaleSummary = input.reason ?? "Workflow enrollment was resumed by an authorized operator.";
  execution.reasoningMetadata = {
    ...execution.reasoningMetadata,
    source: "control_center_fallback",
    manualAction: "resume",
  };
  execution.metadata = {
    ...execution.metadata,
    lastChangedBy: "human",
    enrollmentState: "active",
  };
  execution.updatedAt = now;
  delete execution.effectiveUntil;
  workflow.updatedAt = now;
  return execution;
}

export function unenrollFallbackWorkflowCustomer(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    executionId: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return false;
  }
  const nextExecutions = workflow.executions.filter((item) => item.id !== input.executionId);
  if (nextExecutions.length === workflow.executions.length) {
    return false;
  }
  workflow.executions = nextExecutions;
  workflow.approxTargetCount = workflow.executions.length;
  workflow.updatedAt = new Date().toISOString();
  return true;
}

export function addFallbackWorkflowStage(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    outreachType: ControlCenterStage["outreachType"];
    triggerType: ControlCenterStage["triggerType"];
    triggerConfig: ControlCenterStage["triggerConfig"];
    templateMode: ControlCenterStage["templateMode"];
    templateId?: string;
    aiStrategyId?: string;
    notes: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return undefined;
  }
  const now = new Date().toISOString();
  const stage = {
    id: `cc_stage_local_${fallbackWorkflowCounter++}`,
    tenantId: workflow.tenantId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    workflowId: workflow.id,
    order: workflow.stages.length + 1,
    outreachType: input.outreachType,
    triggerType: input.triggerType,
    triggerConfig: input.triggerConfig,
    templateMode: input.templateMode,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.aiStrategyId ? { aiStrategyId: input.aiStrategyId } : {}),
    notes: input.notes,
    enabled: true,
    requiresApproval: false,
    riskHints: [],
  } satisfies ControlCenterStage;
  workflow.stages = [...workflow.stages, stage];
  workflow.stageCount = workflow.stages.length;
  workflow.updatedAt = now;
  return stage;
}

export function removeFallbackWorkflowStage(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    workflowId: string;
    stageId: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const workflow = state.workflows.find((item) => item.id === input.workflowId);
  if (!workflow) {
    return false;
  }
  const nextStages = workflow.stages
    .filter((stage) => stage.id !== input.stageId)
    .map((stage, index) => ({ ...stage, order: index + 1 }));
  if (nextStages.length === workflow.stages.length) {
    return false;
  }
  workflow.stages = nextStages;
  workflow.stageCount = workflow.stages.length;
  workflow.updatedAt = new Date().toISOString();
  return true;
}

export function createFallbackTemplate(
  seedFactory: () => ControlCenterConsoleData,
  input: {
    tenantId: string;
    name: string;
    subject: string;
    body: string;
    ccEmails?: string[];
    channelCompatibility: ControlCenterEmailTemplate["channelCompatibility"];
    autoCorrectEnabled?: boolean;
    isDefault?: boolean;
    previewSeedKey?: string;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const now = new Date().toISOString();
  const template = {
    id: `cc_template_local_${fallbackWorkflowCounter++}`,
    tenantId: input.tenantId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    name: input.name,
    subject: input.subject,
    body: input.body,
    ccEmails: [...(input.ccEmails ?? [])],
    channelCompatibility: [...input.channelCompatibility],
    autoCorrectEnabled: input.autoCorrectEnabled ?? false,
    isDefault: input.isDefault ?? false,
    isArchived: false,
    ...(input.previewSeedKey ? { previewSeedKey: input.previewSeedKey } : {}),
  } satisfies ControlCenterConsoleData["templates"][number];

  state.templates = [template, ...state.templates];
  return template;
}

export function updateFallbackTemplate(
  seedFactory: () => ControlCenterConsoleData,
  templateId: string,
  input: {
    name?: string;
    subject?: string;
    body?: string;
    ccEmails?: string[];
    channelCompatibility?: ControlCenterEmailTemplate["channelCompatibility"];
    autoCorrectEnabled?: boolean;
    isDefault?: boolean;
  },
) {
  const state = getFallbackControlCenter(seedFactory);
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) {
    return undefined;
  }
  template.updatedAt = new Date().toISOString();
  if (input.name !== undefined) {
    template.name = input.name;
  }
  if (input.subject !== undefined) {
    template.subject = input.subject;
  }
  if (input.body !== undefined) {
    template.body = input.body;
  }
  if (input.ccEmails !== undefined) {
    template.ccEmails = [...input.ccEmails];
  }
  if (input.channelCompatibility !== undefined) {
    template.channelCompatibility = [...input.channelCompatibility];
  }
  if (input.autoCorrectEnabled !== undefined) {
    template.autoCorrectEnabled = input.autoCorrectEnabled;
  }
  if (input.isDefault !== undefined) {
    template.isDefault = input.isDefault;
  }
  return template;
}
