import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";
import { resetControlCenterServiceForTests } from "./bootstrap/control-center-service.js";
import { resetOutreachIntelligenceServiceForTests } from "./bootstrap/outreach-intelligence-service.js";

let app = buildApiApp();

beforeEach(async () => {
  await app.close();
  resetControlCenterServiceForTests();
  resetOutreachIntelligenceServiceForTests();
  app = buildApiApp();
});

afterAll(async () => {
  await app.close();
});

const principal = { id: "tester", roles: ["ar_manager"] };

describe("control center API", () => {
  it("lists seeded workflows and control-center console data", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/control-center" });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.workflows.length).toBeGreaterThan(0);
    expect(payload.generationPreview.email.emailDraft.subjectSuggestions.length).toBeGreaterThan(0);
  });

  it("supports workflow CRUD and stage preview", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/control-center/workflows",
      payload: {
        principal,
        tenantId: "default",
        category: "collections",
        name: "Escalations",
        timezone: "Asia/Manila",
        outreachWindowStart: "08:00",
        outreachWindowEnd: "17:00",
        outreachDays: ["monday", "tuesday"],
      },
    });
    expect(create.statusCode).toBe(200);
    const workflowId = create.json().workflow.id as string;

    const stage = await app.inject({
      method: "POST",
      url: "/v1/control-center/stages",
      payload: {
        principal,
        tenantId: "default",
        workflowId,
        outreachType: "email",
        triggerType: "relative_due_date",
        triggerConfig: { comparator: "days_past_due", offsetDays: 4 },
        templateMode: "ai_generated",
        aiStrategyId: "email_default",
      },
    });
    expect(stage.statusCode).toBe(200);
    const stageId = stage.json().stage.id as string;

    const preview = await app.inject({
      method: "GET",
      url: `/v1/control-center/stages/${stageId}/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().triggerSummary).toContain("after due date");

    const toggle = await app.inject({
      method: "POST",
      url: `/v1/control-center/workflows/${workflowId}/toggle`,
      payload: { principal, enabled: true },
    });
    expect(toggle.statusCode).toBe(200);
    expect(toggle.json().workflow.enabled).toBe(true);

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/control-center/workflows/${workflowId}`,
      payload: { principal },
    });
    expect(remove.statusCode).toBe(200);
  });

  it("supports templates, call-agent config, and AI generation endpoints", async () => {
    const templates = await app.inject({ method: "GET", url: "/v1/control-center/templates" });
    const templateId = templates.json().templates[0].id as string;
    const update = await app.inject({
      method: "PUT",
      url: `/v1/control-center/templates/${templateId}`,
      payload: {
        principal,
        subject: "Past due invoice with Customer Company Name",
        body:
          "Hello Customer Name,\nOverdue Invoices Summary\nBalance overdue: Overdue Balance\nTotal account balance: Total Account Balance",
        ccEmails: ["collector@example.com"],
        autoCorrectEnabled: false,
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().template.ccEmails).toEqual(["collector@example.com"]);
    expect(update.json().template.autoCorrectEnabled).toBe(false);

    const preview = await app.inject({
      method: "GET",
      url: `/v1/control-center/templates/${templateId}/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().preview.body).toContain("Maria Santos");
    expect(preview.json().preview.body).not.toContain("Customer Name");
    expect(preview.json().preview.body).not.toContain("Overdue Balance");

    const workflowResponse = await app.inject({ method: "GET", url: "/v1/control-center/workflows" });
    const stageId = workflowResponse.json().workflows
      .flatMap((workflow: { stages: Array<{ id: string; outreachType: string }> }) => workflow.stages)
      .find((stage: { outreachType: string }) => stage.outreachType === "sms").id as string;

    const generation = await app.inject({
      method: "POST",
      url: `/v1/control-center/ai-generate/stages/${stageId}`,
      payload: { principal },
    });
    expect(generation.statusCode).toBe(200);
    expect(generation.json().generated.policy.approvalRequired).toBe(true);

    const callAgent = await app.inject({
      method: "PUT",
      url: "/v1/control-center/call-agent",
      payload: { principal, phoneNumber: "+63 2 8777 0000" },
    });
    expect(callAgent.statusCode).toBe(200);
    expect(callAgent.json().config.phoneNumber).toBe("+63 2 8777 0000");
  });
});
