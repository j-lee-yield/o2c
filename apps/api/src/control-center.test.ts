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

    const assignment = await app.inject({
      method: "POST",
      url: `/v1/control-center/workflows/${workflowId}/customers`,
      payload: {
        principal,
        tenantId: "default",
        billingAccountId: "11111111-1111-4111-8111-111111111111",
        parentAccountId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(assignment.statusCode).toBe(200);
    expect(assignment.json().created).toBe(true);
    expect(assignment.json().execution.workflowId).toBe(workflowId);

    const customers = await app.inject({
      method: "GET",
      url: `/v1/control-center/workflows/${workflowId}/customers`,
    });
    expect(customers.statusCode).toBe(200);
    expect(customers.json().executions).toHaveLength(1);
    const executionId = customers.json().executions[0].id as string;

    const pause = await app.inject({
      method: "POST",
      url: `/v1/control-center/workflows/${workflowId}/customers/${executionId}/pause`,
      payload: { principal, reason: "Pause requested from the workflow detail view." },
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().execution.status).toBe("paused");

    const resume = await app.inject({
      method: "POST",
      url: `/v1/control-center/workflows/${workflowId}/customers/${executionId}/resume`,
      payload: { principal },
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().execution.status).toBe("active");

    const unenroll = await app.inject({
      method: "DELETE",
      url: `/v1/control-center/workflows/${workflowId}/customers/${executionId}`,
      payload: { principal },
    });
    expect(unenroll.statusCode).toBe(200);
    expect(unenroll.json().unenrolled).toBe(true);

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/control-center/workflows/${workflowId}`,
      payload: { principal },
    });
    expect(remove.statusCode).toBe(200);
  });

  it("sends Control Center test email with UUID-safe test context", async () => {
    const identityResponse = await app.inject({
      method: "POST",
      url: "/v1/email/sending-identities/connect",
      payload: {
        provider: "internal",
        authMode: "other",
        senderEmail: "collections@example.test",
        displayName: "Collections",
        scopes: ["internal.send"],
        isDefault: true,
      },
    });
    expect(identityResponse.statusCode, identityResponse.payload).toBe(200);
    const identityId = identityResponse.json().id as string;

    const response = await app.inject({
      method: "POST",
      url: "/v1/control-center/test-email",
      payload: {
        principal,
        senderIdentityId: identityId,
        recipientEmail: "ap@example.test",
        workflowId: "wf-test",
        workflowName: "Test Workflow",
      },
    });

    expect(response.statusCode, response.payload).toBe(200);
    expect(response.json().deliveryState).toBe("sent");
    expect(response.json().testContext.billingAccountId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.payload).not.toContain("control-center-test-account");
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
