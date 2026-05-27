import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import {
  CallInboxWorkflowService,
  InMemoryCallInboxRepository,
} from "@o2c/workflows";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/o2c_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DEFAULT_TENANT_SLUG = "tenant_1";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_PUBLIC_KEY = "test-public-key";
process.env.JWT_PRIVATE_KEY = "test-private-key";
process.env.RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION = "true";

const { buildApiApp } = await import("./app.js");
const { setCallInboxServiceForTests } = await import("./bootstrap/call-inbox-service.js");
const { resetTaskServiceForTests } = await import("./bootstrap/task-service.js");

let app: ReturnType<typeof buildApiApp>;
let idSequence = 0;

beforeEach(() => {
  idSequence = 0;
  resetTaskServiceForTests();
  setCallInboxServiceForTests(
    new CallInboxWorkflowService({
      repository: new InMemoryCallInboxRepository(),
      activityStore: new InMemoryImmutableActivityLogStore(),
      now: () => "2026-05-08T05:30:00.000Z",
      idGenerator: () => `call_inbox_test_${++idSequence}`,
    }),
  );
  app = buildApiApp();
});

afterEach(async () => {
  setCallInboxServiceForTests(undefined);
  await app.close();
});

describe("Collections call inbox", () => {
  it("keeps Retell webhook handling idempotent by provider call id", async () => {
    const webhookPayload = {
      event: "call_started",
      call: {
        call_id: "retell_duplicate_1",
        call_status: "ongoing",
        direction: "outbound",
        from_number: "+12135616499",
        to_number: "+17168609532",
        metadata: {
          tenant_id: "tenant_1",
          billing_account_id: "billing_1",
          contact_id: "contact_1",
        },
        retell_llm_dynamic_variables: {
          customer_name: "Metro Retail Group",
        },
      },
    };

    const first = await app.inject({
      method: "POST",
      url: "/v1/retell/webhooks/calls",
      payload: webhookPayload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/retell/webhooks/calls",
      payload: {
        ...webhookPayload,
        event: "call_analyzed",
        call: {
          ...webhookPayload.call,
          call_status: "ended",
          end_timestamp: 1777875656000,
          call_analysis: {
            call_summary: "Customer promised to pay tomorrow.",
          },
        },
      },
    });

    expect(first.statusCode, first.payload).toBe(200);
    expect(second.statusCode, second.payload).toBe(200);
    expect(first.json().callRecordId).toBe(second.json().callRecordId);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collections/call-inbox",
    });
    expect(listResponse.statusCode, listResponse.payload).toBe(200);
    const list = listResponse.json();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      providerCallId: "retell_duplicate_1",
      status: "completed",
    });
  });

  it("ingests Retell call webhooks, exposes detail/transcript/export, and links post-call tasks", async () => {
    const webhookPayload = {
      event: "call_analyzed",
      call: {
        call_id: "retell_call_123",
        call_status: "ended",
        direction: "outbound",
        from_number: "+12135616499",
        to_number: "+17168609532",
        start_timestamp: 1777875600000,
        end_timestamp: 1777875656000,
        recording_url: "https://retell.example.test/recording.mp3",
        transcript_url: "https://retell.example.test/transcript.json",
        metadata: {
          tenant_id: "tenant_1",
          parent_account_id: "parent_1",
          billing_account_id: "billing_1",
          branch_id: "branch_1",
          contact_id: "contact_1",
          communication_attempt_id: "attempt_1",
          pre_call_plan_id: "plan_1",
          requested_by: "Matthew Breckon",
          approver_name: "Juan Cruz",
        },
        retell_llm_dynamic_variables: {
          customer_name: "Perkins, Wong and Evans",
          invoice_numbers: "PER-FS6667, PER-DFD11C",
          workflow_name: "Overdue collections",
        },
        call_analysis: {
          call_summary: "Customer requested invoice copies and promised to pay tomorrow.",
          user_sentiment: "positive",
          custom_analysis_data: {
            voicemail: false,
            classifications: ["Payment promise", "Support request"],
          },
        },
        transcript_object: [
          { role: "agent", content: "Do you have a moment to chat about your account?", start_ms: 0 },
          { role: "user", content: "Please send the invoices and payment link.", start_ms: 3200 },
        ],
      },
    };

    const webhookResponse = await app.inject({
      method: "POST",
      url: "/v1/retell/webhooks/calls",
      payload: webhookPayload,
    });

    expect(webhookResponse.statusCode, webhookResponse.payload).toBe(200);
    expect(webhookResponse.json()).toMatchObject({
      ok: true,
      status: "ingested",
      providerCallId: "retell_call_123",
      audit: { logged: true },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/collections/call-inbox?classification=promise",
    });
    expect(listResponse.statusCode, listResponse.payload).toBe(200);
    const list = listResponse.json();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      customerName: "Perkins, Wong and Evans",
      direction: "outbound",
      durationSeconds: 56,
      sentiment: "positive",
      openTasksCount: 0,
    });
    expect(list.items[0].classifications.map((classification: string) => classification.toLowerCase())).toEqual(
      expect.arrayContaining(["payment promise", "support request"]),
    );

    const statusFilterResponse = await app.inject({
      method: "GET",
      url: "/v1/collections/call-inbox?direction=outbound&status=completed&voicemail=false&workflow=Overdue",
    });
    expect(statusFilterResponse.statusCode, statusFilterResponse.payload).toBe(200);
    expect(statusFilterResponse.json().total).toBe(1);

    const voicemailFilterResponse = await app.inject({
      method: "GET",
      url: "/v1/collections/call-inbox?voicemail=true",
    });
    expect(voicemailFilterResponse.statusCode, voicemailFilterResponse.payload).toBe(200);
    expect(voicemailFilterResponse.json().total).toBe(0);

    const callRecordId = list.items[0].id;
    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/collections/call-inbox/${callRecordId}`,
    });
    expect(detailResponse.statusCode, detailResponse.payload).toBe(200);
    expect(detailResponse.json().call).toMatchObject({
      providerCallId: "retell_call_123",
      billingAccountId: "billing_1",
      branchId: "branch_1",
      recordingUrl: "https://retell.example.test/recording.mp3",
      transcriptSegments: [
        { speaker: "agent", text: "Do you have a moment to chat about your account?" },
        { speaker: "customer", text: "Please send the invoices and payment link." },
      ],
    });

    const exportResponse = await app.inject({
      method: "GET",
      url: "/v1/collections/call-inbox/export",
    });
    expect(exportResponse.statusCode, exportResponse.payload).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.payload).toContain("Perkins, Wong and Evans");
    expect(exportResponse.payload).toContain("retell_call_123");

    const outcomeResponse = await app.inject({
      method: "POST",
      url: "/v1/retell/collections/call-outcome",
      payload: {
        principal: { id: "api-test", roles: ["ar_collector"] },
        tenantId: "tenant_1",
        billingAccountId: "billing_1",
        parentAccountId: "parent_1",
        branchId: "branch_1",
        contactId: "contact_1",
        communicationAttemptId: "attempt_1",
        providerCallId: "retell_call_123",
        preCallPlanId: "plan_1",
        occurredAt: "2026-05-08T05:20:00.000Z",
        disposition: "connected",
        transcriptSummary: "Customer requested a callback.",
        callback: {
          dueAt: "2026-05-09T02:00:00.000Z",
          timezone: "Asia/Manila",
        },
      },
    });

    expect(outcomeResponse.statusCode, outcomeResponse.payload).toBe(200);
    expect(outcomeResponse.json().callInboxRecord).toMatchObject({
      providerCallId: "retell_call_123",
      openTasksCount: 1,
    });

    const linkedDetailResponse = await app.inject({
      method: "GET",
      url: `/v1/collections/call-inbox/${callRecordId}`,
    });
    expect(linkedDetailResponse.json().call.taskRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "open",
          taskType: "account_manager_callback",
        }),
      ]),
    );
  });
});
