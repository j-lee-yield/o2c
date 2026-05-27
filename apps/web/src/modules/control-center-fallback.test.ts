import { beforeEach, describe, expect, it } from "vitest";
import { buildSeedControlCenter } from "../app/data.js";
import {
  addFallbackWorkflowStage,
  assignFallbackWorkflowCustomer,
  createFallbackTemplate,
  getFallbackControlCenter,
  pauseFallbackWorkflowCustomer,
  removeFallbackWorkflowStage,
  resetFallbackControlCenter,
  resumeFallbackWorkflowCustomer,
  toggleFallbackWorkflow,
  unenrollFallbackWorkflowCustomer,
  updateFallbackTemplate,
} from "./control-center-fallback.js";

describe("control-center fallback workflow customers", () => {
  beforeEach(() => {
    resetFallbackControlCenter();
  });

  it("pauses and resumes an enrolled customer", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0];
    expect(workflow).toBeDefined();
    const originalStatus = workflow.executions[0]?.status;
    expect(originalStatus).toBe("active");

    const paused = pauseFallbackWorkflowCustomer(buildSeedControlCenter, {
      workflowId: workflow.id,
      executionId: workflow.executions[0]!.id,
    });
    expect(paused?.status).toBe("paused");
    expect(paused?.lastDecisionAction).toBe("pause");

    const resumed = resumeFallbackWorkflowCustomer(buildSeedControlCenter, {
      workflowId: workflow.id,
      executionId: workflow.executions[0]!.id,
    });
    expect(resumed?.status).toBe("active");
    expect(resumed?.lastDecisionAction).toBe("continue");
  });

  it("unenrolls a customer from the fallback workflow", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0]!;
    const initialCount = workflow.executions.length;

    const unenrolled = unenrollFallbackWorkflowCustomer(buildSeedControlCenter, {
      workflowId: workflow.id,
      executionId: workflow.executions[0]!.id,
    });

    expect(unenrolled).toBe(true);
    expect(workflow.executions.length).toBe(initialCount - 1);
    expect(workflow.approxTargetCount).toBe(workflow.executions.length);
  });

  it("assigns an already unenrolled customer again as active", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0]!;
    const billingAccountId = "ACC001";
    unenrollFallbackWorkflowCustomer(buildSeedControlCenter, {
      workflowId: workflow.id,
      executionId: workflow.executions.find((item) => item.billingAccountId === billingAccountId)!.id,
    });

    const execution = assignFallbackWorkflowCustomer(buildSeedControlCenter, {
      workflowId: workflow.id,
      billingAccountId,
      parentAccountId: billingAccountId,
    });

    expect(execution?.status).toBe("active");
    expect(execution?.lastDecisionAction).toBe("continue");
  });

  it("adds a stage to the fallback workflow", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0]!;
    const initialCount = workflow.stages.length;

    const stage = addFallbackWorkflowStage(buildSeedControlCenter, {
      workflowId: workflow.id,
      outreachType: "email",
      triggerType: "relative_due_date",
      triggerConfig: { comparator: "due_in_days", offsetDays: 5 },
      templateMode: "pre_saved_template",
      templateId: "cc_template_seed_1",
      notes: "Email reminder stage",
    });

    expect(stage?.workflowId).toBe(workflow.id);
    expect(stage?.order).toBe(initialCount + 1);
    expect(workflow.stages.length).toBe(initialCount + 1);
    expect(workflow.stageCount).toBe(workflow.stages.length);
  });

  it("toggles a fallback workflow enabled state", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0]!;

    const disabled = toggleFallbackWorkflow(buildSeedControlCenter, {
      workflowId: workflow.id,
      enabled: false,
    });
    expect(disabled?.enabled).toBe(false);

    const enabled = toggleFallbackWorkflow(buildSeedControlCenter, {
      workflowId: workflow.id,
      enabled: true,
    });
    expect(enabled?.enabled).toBe(true);
  });

  it("removes a stage from the fallback workflow", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const workflow = state.workflows[0]!;
    const stageId = workflow.stages[0]!.id;
    const initialCount = workflow.stages.length;

    const removed = removeFallbackWorkflowStage(buildSeedControlCenter, {
      workflowId: workflow.id,
      stageId,
    });

    expect(removed).toBe(true);
    expect(workflow.stages.length).toBe(initialCount - 1);
    expect(workflow.stageCount).toBe(workflow.stages.length);
  });

  it("creates and updates a fallback template", () => {
    const state = getFallbackControlCenter(buildSeedControlCenter);
    const initialCount = state.templates.length;

    const template = createFallbackTemplate(buildSeedControlCenter, {
      tenantId: "default",
      name: "Local Template",
      subject: "Hello {{customer_name}}",
      body: "Hi {{customer_name}}",
      channelCompatibility: ["email"],
      autoCorrectEnabled: true,
      isDefault: false,
      previewSeedKey: "bill-default",
    });

    expect(state.templates.length).toBe(initialCount + 1);
    expect(state.templates[0]?.id).toBe(template.id);
    expect(template.previewSeedKey).toBe("bill-default");

    const updated = updateFallbackTemplate(buildSeedControlCenter, template.id, {
      name: "Updated Local Template",
      subject: "Updated subject",
      body: "Updated body",
      ccEmails: ["collections@example.com"],
      autoCorrectEnabled: false,
      isDefault: true,
    });

    expect(updated?.name).toBe("Updated Local Template");
    expect(updated?.subject).toBe("Updated subject");
    expect(updated?.ccEmails).toEqual(["collections@example.com"]);
    expect(updated?.isDefault).toBe(true);
  });
});
