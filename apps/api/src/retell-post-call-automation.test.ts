import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { BillingAccount, Contact, CustomerInvoice, PromiseToPay } from "@o2c/domain";
import {
  CallInboxWorkflowService,
  InMemoryCallInboxRepository,
  InMemoryTaskRepository,
  TaskWorkflowService,
  type OutboundEmailSendResult
} from "@o2c/workflows";
import {
  RetellPostCallAutomationService,
  clearRetellPostCallAutomationQueueForTests,
  shouldQueueRetellPostCallAutomation,
  type RetellPostCallAutomationLoaders,
  type RetellPostCallPromiseStore
} from "./modules/retell/post-call-automation.js";
import { buildRetellStatementEmailBody } from "./modules/retell/email-copy.js";
import type { RetellCallRecord } from "./modules/retell/client.js";

vi.mock("./modules/retell/statement-of-account-pdf.js", () => ({
  createStatementOfAccountPdfAttachment: vi.fn(async () => ({
    fileName: "statement-of-account-test.pdf",
    mimeType: "application/pdf",
    contentBase64: "dGVzdA=="
  }))
}));

process.env.NODE_ENV = "test";
process.env.DEFAULT_TENANT_SLUG = "tenant_1";

const account: BillingAccount = {
  id: "billing_1",
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z",
  parentAccountId: "parent_1",
  branchId: "branch_1",
  accountNumber: "BA-1001",
  displayName: "Medical Clinic Corp",
  currency: "PHP",
  accountTier: "standard",
  status: "active",
  centrallyPaid: false,
  metadata: {}
};

const contact: Contact = {
  id: "contact_1",
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z",
  parentAccountId: "parent_1",
  billingAccountId: "billing_1",
  branchId: "branch_1",
  scope: "billing_account",
  scopeId: "billing_1",
  fullName: "Josh Lee",
  email: "joshua@paywithyield.com",
  phone: "+639778250898",
  role: "ap",
  isPrimary: true,
  isVerified: true,
  allowAutoSend: true,
  recentSuccessfulResponses: 1,
  metadata: {}
};

const invoices: CustomerInvoice[] = [
  {
    id: "invoice_1",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    state: "synced_open",
    parentAccountId: "parent_1",
    billingAccountId: "billing_1",
    branchId: "branch_1",
    invoiceDate: "2026-04-01",
    invoiceNumber: "MCC-OD-001",
    currency: "PHP",
    amountCents: 150_000,
    dueDate: "2026-04-30",
    metadata: {}
  }
];

let idSequence = 0;

beforeEach(() => {
  idSequence = 0;
  clearRetellPostCallAutomationQueueForTests();
  vi.clearAllMocks();
});

describe("Retell post-call automation", () => {
  it("writes a supplier-facing recap in invoice-group bullets without internal agent notes", () => {
    const body = buildRetellStatementEmailBody({
      account,
      contact,
      callSummary:
        "Agent verified they were speaking with Josh Lee of Medical Clinic Corp. Agent explained there are three overdue invoices totaling PHP 397,600; customer committed to pay all three next week Tuesday (2026-05-26), and a promise to pay was created. Agent then discussed two invoices due today totaling PHP 180,450. Customer stated one invoice (MCC-DT-002 for PHP 112,200) has already been paid, leaving MCC-DT-001 for PHP 68,250 due today; customer committed to pay it today and agreed to a collector visiting the office at 3 PM. Customer also confirmed they are on track to pay four upcoming invoices on or before their due dates. No disputes, hardship, or request to stop calls; no transfer to human."
    });

    expect(body).toContain("Thank you for taking our call earlier.");
    expect(body).toContain("Here is the recap from our conversation:");
    expect(body).toContain("- Overdue invoices:");
    expect(body).toContain("- Invoices due today:");
    expect(body).toContain("- Upcoming invoices:");
    expect(body).toContain("You committed");
    expect(body).not.toContain("Agent");
    expect(body).not.toContain("No disputes");
    expect(body).not.toContain("transfer to human");
    expect(body).not.toContain("As requested");
  });

  it("rewrites Retell call-summary phrasing into direct customer-facing follow-up", () => {
    const body = buildRetellStatementEmailBody({
      account,
      contact,
      callSummary:
        "Called the user to discuss overdue invoices and confirmed the user's identity; The user stated that the overdue invoices have already been paid, and the agent acknowledged this and said they would verify the payment with their team. The call ended after discussing additional invoices due today."
    });

    expect(body).toContain(
      "- Overdue invoices: You confirmed that the overdue invoices have already been paid. We will verify this with the team and get back to you"
    );
    expect(body).toContain("- Invoices due today: We also reviewed additional invoices due today");
    expect(body).not.toContain("the user");
    expect(body).not.toContain("user's identity");
    expect(body).not.toContain("agent");
    expect(body).not.toContain("called");
  });

  it("queues only completed Yield-originated calls marked for post-call recap and SOA", () => {
    const started = baseRetellCall({ call_status: "ongoing" });
    const completed = baseRetellCall({ call_status: "ended", end_timestamp: 1777875656000 });
    const unflagged = {
      ...completed,
      metadata: {
        tenant_id: "tenant_1",
        billing_account_id: "billing_1"
      },
      retell_llm_dynamic_variables: {}
    };

    expect(
      shouldQueueRetellPostCallAutomation({
        tenantId: "tenant_1",
        event: "call_started",
        call: started
      })
    ).toMatchObject({
      queued: false,
      reason: "call_not_terminal"
    });
    expect(
      shouldQueueRetellPostCallAutomation({
        tenantId: "tenant_1",
        event: "polling_sync",
        call: completed
      })
    ).toMatchObject({
      queued: true,
      providerCallId: "retell_post_call_1"
    });
    expect(
      shouldQueueRetellPostCallAutomation({
        tenantId: "tenant_1",
        event: "call_analyzed",
        call: unflagged
      })
    ).toMatchObject({
      queued: false,
      reason: "post_call_automation_not_requested"
    });
  });

  it("records post-call outcome tasks, links the call inbox count, and sends the recap SOA email", async () => {
    const fixture = createAutomationFixture();
    const result = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        call_status: "ended",
        end_timestamp: 1777875656000,
        call_analysis: {
          call_summary: "Customer asked for a callback tomorrow and requested the SOA by email.",
          user_sentiment: "neutral",
          custom_analysis_data: {
            post_call_outcome: {
              disposition: "callback_requested",
              callback: {
                dueAt: "2026-05-09T02:00:00.000Z",
                timezone: "Asia/Manila",
                notes: "Call Josh back tomorrow morning."
              }
            }
          }
        }
      })
    });

    expect(result).toMatchObject({
      status: "completed",
      providerCallId: "retell_post_call_1",
      outcomeRecorded: true,
      taskCount: 1,
      emailDeliveryState: "sent"
    });
    expect(fixture.emailSends).toHaveLength(1);
    expect(fixture.emailSends[0]?.subjectLine).toBe(
      "Call recap and Statement of Account - Medical Clinic Corp"
    );
    expect(fixture.emailSends[0]?.bodyPreview).toContain(
      "Here is the recap from our conversation:"
    );
    expect(fixture.emailSends[0]?.attachments?.[0]?.fileName).toBe(
      "statement-of-account-test.pdf"
    );

    const tasks = await fixture.taskService.list({ billingAccountId: "billing_1" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      kind: "account_manager_callback",
      callId: "retell_post_call_1",
      billingAccountId: "billing_1",
      contactId: "contact_1"
    });

    const calls = await fixture.callInboxService.listCalls();
    expect(calls.items).toHaveLength(1);
    expect(calls.items[0]).toMatchObject({
      providerCallId: "retell_post_call_1",
      status: "completed",
      openTasksCount: 1
    });
    expect(fixture.activityStore.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.post_call_automation.outcome_recorded",
        "retell.post_call_automation.soa_email_sent",
        "retell.post_call_automation.completed"
      ])
    );
  });

  it("creates a promise-to-pay from terminal Retell analysis without live finalization", async () => {
    const fixture = createAutomationFixture();
    const result = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        call_status: "ended",
        end_timestamp: 1777875656000,
        call_analysis: {
          call_summary: "Customer committed to pay invoice MCC-OD-001 on 2026-05-26.",
          custom_analysis_data: {
            post_call_outcome: {
              disposition: "good_to_pay",
              promiseUpdate: {
                invoiceIds: ["invoice_1"],
                status: "new",
                promisedDate: "2026-05-26",
                promisedAmountCents: 150_000,
                currency: "PHP"
              }
            }
          }
        }
      })
    });

    expect(result).toMatchObject({
      status: "completed",
      outcomeRecorded: true,
      taskCount: 1
    });
    expect(fixture.promiseStore.promises).toHaveLength(1);
    expect(fixture.promiseStore.promises[0]).toMatchObject({
      billingAccountId: "billing_1",
      contactId: "contact_1",
      promiseDate: "2026-05-26",
      promisedAmountCents: 150_000,
      state: "accepted"
    });
    expect(fixture.promiseStore.promises[0]?.metadata).toMatchObject({
      source: "retell_post_call_automation",
      providerCallId: "retell_post_call_1"
    });
    expect((await fixture.taskService.list({ billingAccountId: "billing_1" }))[0]).toMatchObject({
      kind: "follow_up_promise_to_pay",
      linkedInvoiceIds: ["invoice_1"]
    });
    expect(fixture.activityStore.entries.map((entry) => entry.action)).toContain(
      "retell.post_call_automation.promise_created"
    );
  });

  it("uses Retell final extracted variables for invoice-scoped promises and paid-already tasks", async () => {
    const scopedInvoices: CustomerInvoice[] = [
      invoices[0]!,
      {
        ...invoices[0]!,
        id: "invoice_2",
        invoiceNumber: "MCC-OD-002",
        amountCents: 200_000
      },
      {
        ...invoices[0]!,
        id: "invoice_3",
        invoiceNumber: "MCC-OD-003",
        amountCents: 100_000
      }
    ];
    const fixture = createAutomationFixture({
      loadInvoices: () => scopedInvoices
    });

    const result = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        call_id: "retell_collected_vars",
        call_status: "ended",
        end_timestamp: 1777875656000,
        metadata: {
          ...baseRetellCall().metadata,
          communication_attempt_id: "attempt_collected_vars",
          invoice_ids: "invoice_1,invoice_2,invoice_3"
        },
        retell_llm_dynamic_variables: {
          ...baseRetellCall().retell_llm_dynamic_variables,
          invoice_numbers: "MCC-OD-001,MCC-OD-002,MCC-OD-003"
        },
        collected_dynamic_variables: {
          outcome_type: "mixed",
          paid_already: "true",
          paid_invoice_ids: "MCC-OD-001",
          paid_at: "2026-05-21",
          paid_amount_cents: "150000",
          paid_currency: "php",
          promise_invoice_ids: "MCC-OD-002,MCC-OD-003",
          promised_date: "2026-05-22",
          promise_amount_cents: "300000",
          promise_currency: "php",
          promise_notes: "Customer committed to pay the remaining overdue invoices tomorrow."
        },
        call_analysis: {
          call_summary:
            "Customer said MCC-OD-001 was already paid and committed to pay MCC-OD-002 and MCC-OD-003 tomorrow.",
          custom_analysis_data: {
            call_outcome: "committed_future_date"
          }
        }
      })
    });

    expect(result).toMatchObject({
      status: "completed",
      outcomeRecorded: true,
      taskCount: 2
    });
    expect(fixture.promiseStore.promises).toHaveLength(1);
    expect(fixture.promiseStore.promises[0]).toMatchObject({
      billingAccountId: "billing_1",
      contactId: "contact_1",
      promiseDate: "2026-05-22",
      promisedAmountCents: 300_000,
      state: "accepted"
    });
    expect(fixture.promiseStore.promises[0]?.metadata.invoiceIds).toEqual([
      "invoice_2",
      "invoice_3"
    ]);

    const tasks = await fixture.taskService.list({ billingAccountId: "billing_1" });
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "payment_collection_follow_up",
          linkedInvoiceIds: ["invoice_1"]
        }),
        expect.objectContaining({
          kind: "follow_up_promise_to_pay",
          linkedInvoiceIds: ["invoice_2", "invoice_3"]
        })
      ])
    );
    const calls = await fixture.callInboxService.listCalls();
    expect(calls.items[0]?.openTasksCount).toBe(2);
    expect(fixture.activityStore.entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "retell.post_call_automation.promise_created",
        "retell.post_call_automation.outcome_recorded"
      ])
    );
  });

  it("updates an existing promise-to-pay from post-call analysis", async () => {
    const fixture = createAutomationFixture();
    fixture.promiseStore.promises.push({
      id: "ptp_existing",
      tenantId: "tenant_1",
      version: 1,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      parentAccountId: "parent_1",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      promisedAmountCents: 100_000,
      currency: "PHP",
      promiseDate: "2026-05-20",
      state: "accepted",
      metadata: {
        invoiceIds: ["invoice_1"]
      }
    });

    await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        call_status: "ended",
        end_timestamp: 1777875656000,
        call_analysis: {
          call_summary: "Customer revised the promise and will pay on 2026-05-27.",
          custom_analysis_data: {
            post_call_outcome: {
              disposition: "good_to_pay",
              promiseUpdate: {
                promiseToPayId: "ptp_existing",
                invoiceIds: ["invoice_1"],
                status: "updated",
                promisedDate: "2026-05-27",
                promisedAmountCents: 150_000,
                currency: "PHP"
              }
            }
          }
        }
      })
    });

    expect(fixture.promiseStore.promises).toHaveLength(1);
    expect(fixture.promiseStore.promises[0]).toMatchObject({
      id: "ptp_existing",
      promiseDate: "2026-05-27",
      promisedAmountCents: 150_000,
      state: "accepted"
    });
    expect(fixture.activityStore.entries.map((entry) => entry.action)).toContain(
      "retell.post_call_automation.promise_updated"
    );
  });

  it("blocks promise persistence on disputed scope and creates a dispute review task", async () => {
    const fixture = createAutomationFixture();
    await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        call_status: "ended",
        end_timestamp: 1777875656000,
        call_analysis: {
          call_summary: "Customer disputed invoice MCC-OD-001 and mentioned payment timing.",
          custom_analysis_data: {
            post_call_outcome: {
              disposition: "connected",
              dispute: {
                invoiceIds: ["invoice_1"],
                disputeType: "billing",
                disputeScope: "invoice_subset",
                summary: "Customer says the billed amount is incorrect."
              },
              promiseUpdate: {
                invoiceIds: ["invoice_1"],
                status: "new",
                promisedDate: "2026-05-26",
                promisedAmountCents: 150_000
              }
            }
          }
        }
      })
    });

    expect(fixture.promiseStore.promises).toHaveLength(0);
    const tasks = await fixture.taskService.list({ billingAccountId: "billing_1" });
    expect(tasks.map((task) => task.kind)).toEqual(["invoice_dispute_review"]);
    expect(fixture.activityStore.entries.map((entry) => entry.action)).not.toContain(
      "retell.post_call_automation.promise_created"
    );
  });

  it("creates post-call tasks for paid-already, payment-plan, non-commitment, and wrong-contact outcomes", async () => {
    const cases = [
      {
        providerCallId: "retell_paid_already",
        outcome: {
          disposition: "connected",
          paidAlreadyClaim: {
            invoiceIds: ["invoice_1"],
            amountCents: 150_000,
            currency: "PHP",
            reference: "DEP-123"
          }
        },
        expectedTask: "payment_collection_follow_up"
      },
      {
        providerCallId: "retell_payment_plan",
        outcome: {
          disposition: "connected",
          paymentPlanRequest: {
            invoiceIds: ["invoice_1"],
            summary: "Customer asked for a two-month payment plan.",
            requestedInstallmentCount: 2
          }
        },
        expectedTask: "payment_plan_review"
      },
      {
        providerCallId: "retell_non_commitment",
        outcome: {
          disposition: "connected",
          nonCommitment: {
            invoiceIds: ["invoice_1"],
            reason: "Customer cannot commit until internal approval is complete."
          }
        },
        expectedTask: "non_commitment_follow_up"
      },
      {
        providerCallId: "retell_wrong_contact",
        outcome: {
          disposition: "wrong_contact",
          contactHandoff: {
            newHandlerName: "Finance Desk",
            newHandlerEmail: "finance@example.test",
            newHandlerReachable: false
          }
        },
        expectedTask: "contact_verification_review"
      }
    ] as const;

    for (const testCase of cases) {
      const fixture = createAutomationFixture();
      await fixture.service.run({
        tenantId: "tenant_1",
        event: "call_analyzed",
        call: baseRetellCall({
          call_id: testCase.providerCallId,
          call_status: "ended",
          end_timestamp: 1777875656000,
          metadata: {
            ...baseRetellCall().metadata,
            communication_attempt_id: `attempt_${testCase.providerCallId}`
          },
          call_analysis: {
            call_summary: `Terminal analysis for ${testCase.expectedTask}.`,
            custom_analysis_data: {
              post_call_outcome: testCase.outcome
            }
          }
        })
      });

      const tasks = await fixture.taskService.list({ billingAccountId: "billing_1" });
      expect(tasks.map((task) => task.kind)).toContain(testCase.expectedTask);
      const calls = await fixture.callInboxService.listCalls();
      expect(calls.items[0]?.openTasksCount).toBeGreaterThan(0);
    }
  });

  it("skips safely when terminal automation lacks billing-account context", async () => {
    const fixture = createAutomationFixture({
      loadBillingAccount: () => undefined
    });
    const result = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call: baseRetellCall({
        metadata: {
          post_call_automation: "email_recap_and_soa",
          post_call_email_recap: true
        },
        retell_llm_dynamic_variables: {
          post_call_automation: "email_recap_and_soa"
        }
      })
    });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "missing_billing_account_context"
    });
    expect(fixture.emailSends).toHaveLength(0);
  });

  it("does not duplicate outcome tasking or email send on duplicate Retell updates", async () => {
    const fixture = createAutomationFixture();
    const call = baseRetellCall({
      call_status: "ended",
      end_timestamp: 1777875656000,
      call_analysis: {
        call_summary: "Customer requested a callback.",
        custom_analysis_data: {
          post_call_outcome: {
            disposition: "callback_requested",
            callback: {
              dueAt: "2026-05-09T02:00:00.000Z"
            }
          }
        }
      }
    });

    const first = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call
    });
    const second = await fixture.service.run({
      tenantId: "tenant_1",
      event: "call_analyzed",
      call
    });

    expect(first.status).toBe("completed");
    expect(second).toMatchObject({
      status: "skipped",
      reason: "already_completed"
    });
    expect(fixture.emailSends).toHaveLength(1);
    expect(await fixture.taskService.list({ billingAccountId: "billing_1" })).toHaveLength(1);
  });
});

function createAutomationFixture(
  loaderOverrides: Partial<RetellPostCallAutomationLoaders> = {}
) {
  const activityStore = new InMemoryImmutableActivityLogStore();
  const callInboxService = new CallInboxWorkflowService({
    repository: new InMemoryCallInboxRepository(),
    activityStore,
    now: () => "2026-05-08T05:30:00.000Z",
    idGenerator: nextId
  });
  const taskService = new TaskWorkflowService({
    repository: new InMemoryTaskRepository(),
    now: () => "2026-05-08T05:30:00.000Z",
    idGenerator: (prefix) => `${prefix}_${++idSequence}`
  });
  const emailSends: Array<Parameters<FakeEmailService["sendResendDocuments"]>[0]> = [];
  const emailService: FakeEmailService = {
    async sendResendDocuments(input) {
      emailSends.push(input);
      return {
        workflowKind: "resend_documents",
        senderIdentity: {
          id: "identity_1",
          provider: "internal"
        },
        communicationAttempt: {
          id: `email_attempt_${emailSends.length}`,
          provider: "internal"
        },
        deliveryState: "sent",
        activityEntries: []
      } as OutboundEmailSendResult;
    }
  };
  const promiseStore = new InMemoryRetellPostCallPromiseStore();
  const service = new RetellPostCallAutomationService({
    activityStore,
    callInboxService,
    emailService,
    taskService,
    promiseStore,
    now: () => "2026-05-08T05:30:00.000Z",
    idGenerator: nextId,
    loaders: {
      loadBillingAccount: () => account,
      loadContact: () => contact,
      loadSafeBillingAccountContact: () => contact,
      loadInvoices: () => invoices,
      ...loaderOverrides
    }
  });

  return {
    activityStore,
    callInboxService,
    taskService,
    promiseStore,
    emailSends,
    service
  };
}

type FakeEmailService = {
  sendResendDocuments(input: {
    principal: { id: string; roles: string[] };
    account: BillingAccount;
    invoices: CustomerInvoice[];
    contact: Contact;
    subjectLine: string;
    bodyPreview: string;
    documentIds?: string[];
    attachments?: Array<{
      fileName: string;
      mimeType?: string;
      contentBase64: string;
    }>;
  }): Promise<OutboundEmailSendResult>;
};

class InMemoryRetellPostCallPromiseStore implements RetellPostCallPromiseStore {
  readonly promises: PromiseToPay[] = [];

  findByIdempotencyKey(input: {
    tenantId: string;
    billingAccountId: string;
    idempotencyKey: string;
  }) {
    return this.promises.find(
      (promise) =>
        promise.tenantId === input.tenantId &&
        promise.billingAccountId === input.billingAccountId &&
        (promise.metadata.postCallAutomationIdempotencyKey === input.idempotencyKey ||
          promise.metadata.idempotencyKey === input.idempotencyKey)
    );
  }

  listActivePromises(input: {
    tenantId: string;
    billingAccountId: string;
    invoiceIds: string[];
  }) {
    const invoiceIds = new Set(input.invoiceIds);
    return this.promises.filter((promise) => {
      if (promise.tenantId !== input.tenantId || promise.billingAccountId !== input.billingAccountId) {
        return false;
      }
      if (!["detected_unconfirmed", "accepted", "due_today"].includes(promise.state)) {
        return false;
      }
      const promiseInvoiceIds = Array.isArray(promise.metadata.invoiceIds)
        ? promise.metadata.invoiceIds.filter((value): value is string => typeof value === "string")
        : [];
      return invoiceIds.size === 0 || promiseInvoiceIds.some((invoiceId) => invoiceIds.has(invoiceId));
    });
  }

  async createPromise(input: {
    tenantId: string;
    promise: PromiseToPay;
    idempotencyKey: string;
  }) {
    const existing = this.findByIdempotencyKey({
      tenantId: input.tenantId,
      billingAccountId: input.promise.billingAccountId,
      idempotencyKey: input.idempotencyKey
    });
    if (existing) {
      return { status: "existing" as const, promise: existing };
    }
    this.promises.push(structuredClone(input.promise));
    return { status: "created" as const, promise: input.promise };
  }

  async updatePromise(input: {
    tenantId: string;
    promiseToPayId: string;
    patch: {
      promiseDate?: string;
      promisedAmountCents?: number;
      currency?: string;
      state?: PromiseToPay["state"];
      metadata: Record<string, unknown>;
      updatedAt: string;
      actorId: string;
      actorRole: string;
    };
  }) {
    const index = this.promises.findIndex(
      (promise) => promise.tenantId === input.tenantId && promise.id === input.promiseToPayId
    );
    if (index === -1) {
      return { status: "missing" as const };
    }
    const current = this.promises[index]!;
    const updated: PromiseToPay = {
      ...current,
      updatedAt: input.patch.updatedAt,
      updatedByActorId: input.patch.actorId,
      updatedByActorRole: input.patch.actorRole as PromiseToPay["updatedByActorRole"],
      ...(input.patch.promiseDate ? { promiseDate: input.patch.promiseDate } : {}),
      ...(input.patch.promisedAmountCents !== undefined
        ? { promisedAmountCents: input.patch.promisedAmountCents }
        : {}),
      ...(input.patch.currency ? { currency: input.patch.currency } : {}),
      ...(input.patch.state ? { state: input.patch.state } : {}),
      metadata: {
        ...current.metadata,
        ...input.patch.metadata
      }
    };
    this.promises[index] = updated;
    return { status: "updated" as const, promise: updated };
  }
}

function baseRetellCall(overrides: Partial<RetellCallRecord> = {}): RetellCallRecord {
  return {
    call_id: "retell_post_call_1",
    call_status: "ended",
    direction: "outbound",
    from_number: "+12135616499",
    to_number: "+639778250898",
    start_timestamp: 1777875600000,
    end_timestamp: 1777875656000,
    metadata: {
      tenant_id: "tenant_1",
      parent_account_id: "parent_1",
      billing_account_id: "billing_1",
      branch_id: "branch_1",
      contact_id: "contact_1",
      communication_attempt_id: "attempt_1",
      pre_call_plan_id: "plan_1",
      statement_snapshot_id: "soa_1",
      invoice_ids: "invoice_1",
      post_call_automation: "email_recap_and_soa",
      post_call_email_recap: true,
      post_call_send_soa: true
    },
    retell_llm_dynamic_variables: {
      customer_name: "Medical Clinic Corp",
      invoice_numbers: "MCC-OD-001",
      post_call_automation: "email_recap_and_soa",
      post_call_email_recap: "true",
      post_call_send_soa: "true"
    },
    transcript_object: [
      { role: "agent", content: "Can we send the SOA after this call?", start_ms: 0 },
      { role: "user", content: "Yes, please email it after the call.", start_ms: 4000 }
    ],
    ...overrides
  };
}

function nextId() {
  return `test_id_${++idSequence}`;
}
