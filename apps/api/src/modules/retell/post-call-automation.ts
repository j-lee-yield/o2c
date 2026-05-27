import { randomUUID } from "node:crypto";
import {
  createActivityLogDomainHelpers,
  InMemoryImmutableActivityLogStore,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  executeSqlCommand,
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresImmutableActivityLogStore,
  queryJsonRows
} from "@o2c/database";
import {
  createPromiseToPayFromReply,
  decidePromiseToPayAcceptance,
  type BillingAccount,
  type CollectionReplyAnalysis,
  type Contact,
  type CustomerInvoice,
  type PromiseToPay,
  type PromiseToPayState
} from "@o2c/domain";
import type {
  CallInboxCallRecord,
  CallInboxInvoiceReference,
  CallInboxTranscriptSegment
} from "@o2c/contracts";
import type {
  EmailAttachmentInput,
  OutboundEmailSendResult,
  TaskWorkflowService
} from "@o2c/workflows";
import { normalizeVoicePostCallOutcome } from "@o2c/workflows";
import { getCallInboxService } from "../../bootstrap/call-inbox-service.js";
import { getEmailOutboundService } from "../../bootstrap/email-integration-service.js";
import { getTaskService } from "../../bootstrap/task-service.js";
import { buildRetellStatementEmailBody } from "./email-copy.js";
import {
  RetellConfigurationError,
  RetellHttpClient,
  RetellProviderError,
  type RetellCallHistoryClient,
  type RetellCallRecord
} from "./client.js";
import {
  postCallOutcomeToCallInboxUpsert,
  retellCallToCallInboxUpsert,
  toCallInboxTaskReferences
} from "./call-inbox-adapter.js";
import { createStatementOfAccountPdfAttachment } from "./statement-of-account-pdf.js";
import {
  RetellPreCallOrchestrationService,
  type RecordRetellPostCallOutcomeInput,
  type RetellPostCallOutcomeResult
} from "./service.js";

const databaseUrl = createDatabaseClientConfig().connectionString;
const postCallAutomationKind = "email_recap_and_soa";
const inFlightAutomationKeys = new Set<string>();

type RetellAutomationPrincipal = Principal & { roles: Array<Principal["roles"][number]> };

type RetellPostCallAutomationEmailService = {
  sendResendDocuments(input: {
    principal: Principal;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    contact: Contact;
    subjectLine: string;
    bodyPreview: string;
    documentIds?: string[];
    attachments?: EmailAttachmentInput[];
  }): Promise<OutboundEmailSendResult>;
};

type RetellPostCallAutomationCallInboxService = {
  upsertCall: ReturnType<typeof getCallInboxService>["upsertCall"];
};

export type RetellPostCallPromiseStore = {
  findByIdempotencyKey(input: {
    tenantId: string;
    billingAccountId: string;
    idempotencyKey: string;
  }): Promise<PromiseToPay | undefined> | PromiseToPay | undefined;
  listActivePromises(input: {
    tenantId: string;
    billingAccountId: string;
    invoiceIds: string[];
  }): Promise<PromiseToPay[]> | PromiseToPay[];
  createPromise(input: {
    tenantId: string;
    promise: PromiseToPay;
    idempotencyKey: string;
  }): Promise<{ status: "created" | "existing"; promise: PromiseToPay }>;
  updatePromise(input: {
    tenantId: string;
    promiseToPayId: string;
    patch: {
      promiseDate?: string;
      promisedAmountCents?: number;
      currency?: string;
      state?: PromiseToPayState;
      metadata: Record<string, unknown>;
      updatedAt: string;
      actorId: string;
      actorRole: string;
    };
  }): Promise<{ status: "updated" | "missing"; promise?: PromiseToPay }>;
};

export type RetellPostCallAutomationLoaders = {
  loadBillingAccount(accountId: string): Promise<BillingAccount | undefined> | BillingAccount | undefined;
  loadContact(contactId: string): Promise<Contact | undefined> | Contact | undefined;
  loadSafeBillingAccountContact(accountId: string): Promise<Contact | undefined> | Contact | undefined;
  loadInvoices(input: {
    billingAccountId: string;
    invoiceIds?: string[];
  }): Promise<CustomerInvoice[]> | CustomerInvoice[];
};

export type RetellPostCallAutomationDependencies = {
  activityStore: ImmutableActivityLogStore;
  callInboxService: RetellPostCallAutomationCallInboxService;
  emailService: RetellPostCallAutomationEmailService;
  taskService?: TaskWorkflowService;
  promiseStore?: RetellPostCallPromiseStore;
  retellClient?: RetellCallHistoryClient;
  loaders: RetellPostCallAutomationLoaders;
  now?: () => string;
  idGenerator?: () => string;
  repeatedBrokenPromiseThreshold?: number;
  repeatedBrokenPromiseWindowDays?: number;
};

export type RetellPostCallAutomationInput = {
  tenantId: string;
  event: string;
  call: RetellCallRecord;
  callRecord?: CallInboxCallRecord;
  principal?: Principal;
};

export type RetellPostCallAutomationScheduleResult = {
  queued: boolean;
  providerCallId?: string;
  reason?: string;
};

export type RetellPostCallAutomationRunResult =
  | {
      status: "skipped";
      providerCallId?: string;
      reason: string;
      activityEntries: ImmutableActivityLogEntry[];
    }
  | {
      status: "completed";
      providerCallId: string;
      billingAccountId: string;
      contactId?: string;
      outcomeRecorded: boolean;
      taskCount: number;
      emailDeliveryState?: OutboundEmailSendResult["deliveryState"];
      emailFailureReason?: string;
      activityEntries: ImmutableActivityLogEntry[];
    };

export function scheduleRetellPostCallAutomation(
  input: RetellPostCallAutomationInput
): RetellPostCallAutomationScheduleResult {
  const decision = shouldQueueRetellPostCallAutomation(input);
  if (!decision.queued) {
    return decision;
  }

  const providerCallId = decision.providerCallId;
  if (!providerCallId) {
    return {
      queued: false,
      reason: "missing_provider_call_id"
    };
  }

  const key = automationKey(input.tenantId, providerCallId);
  if (inFlightAutomationKeys.has(key)) {
    return {
      queued: false,
      providerCallId,
      reason: "already_queued"
    };
  }

  inFlightAutomationKeys.add(key);
  setImmediate(() => {
    runRetellPostCallAutomation(input)
      .catch((error) => {
        console.error("Retell post-call automation failed.", {
          providerCallId,
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        inFlightAutomationKeys.delete(key);
      });
  });

  return decision;
}

export async function runRetellPostCallAutomation(
  input: RetellPostCallAutomationInput
): Promise<RetellPostCallAutomationRunResult> {
  const service = await createDefaultRetellPostCallAutomationService(input.tenantId);
  return service.run(input);
}

export function shouldQueueRetellPostCallAutomation(
  input: RetellPostCallAutomationInput
): RetellPostCallAutomationScheduleResult {
  const providerCallId = readString(input.call.call_id);
  if (!providerCallId) {
    return { queued: false, reason: "missing_provider_call_id" };
  }

  if (!isPostCallAutomationFlagged(input.call)) {
    return {
      queued: false,
      providerCallId,
      reason: "post_call_automation_not_requested"
    };
  }

  if (!isRetellTerminalCallEvent(input.event, input.call)) {
    return {
      queued: false,
      providerCallId,
      reason: "call_not_terminal"
    };
  }

  return {
    queued: true,
    providerCallId
  };
}

export function clearRetellPostCallAutomationQueueForTests() {
  inFlightAutomationKeys.clear();
}

export class RetellPostCallAutomationService {
  private readonly now: () => string;
  private readonly idGenerator: () => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;

  constructor(private readonly deps: RetellPostCallAutomationDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? randomUUID;
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: this.idGenerator,
      now: this.now
    });
  }

  async run(input: RetellPostCallAutomationInput): Promise<RetellPostCallAutomationRunResult> {
    const decision = shouldQueueRetellPostCallAutomation(input);
    if (!decision.queued) {
      return {
        status: "skipped",
        ...(decision.providerCallId ? { providerCallId: decision.providerCallId } : {}),
        reason: decision.reason ?? "not_queued",
        activityEntries: []
      };
    }

    const principal = input.principal ?? defaultPostCallAutomationPrincipal();
    const providerCallId = decision.providerCallId;
    if (!providerCallId) {
      return {
        status: "skipped",
        reason: "missing_provider_call_id",
        activityEntries: []
      };
    }
    const receivedAt = this.now();
    const call = await this.resolveCompleteCall(input.call, providerCallId);
    const upsert = retellCallToCallInboxUpsert({
      tenantId: input.tenantId,
      call,
      event: input.event,
      receivedAt
    });
    const callInboxUpsertResult = await this.deps.callInboxService.upsertCall(principal, upsert);
    const callRecord = callInboxUpsertResult.record;
    const context = await this.resolveAutomationContext({
      tenantId: input.tenantId,
      call,
      callRecord,
      providerCallId,
      occurredAt: callRecord.endedAt ?? receivedAt
    });

    if (!context) {
      return {
        status: "skipped",
        providerCallId,
        reason: "missing_billing_account_context",
        activityEntries: []
      };
    }

    const priorCompletion = await this.findPriorAutomationAction(
      context.billingAccountId,
      ["retell.post_call_automation.completed"],
      context.providerCallId
    );
    if (priorCompletion) {
      const entry = this.appendAudit({
        principal,
        action: "retell.post_call_automation.skipped",
        entityId: context.billingAccountId,
        after: {
          providerCallId,
          reason: "already_completed"
        },
        metadata: {
          providerCallId,
          provider_call_id: providerCallId,
          billingAccountId: context.billingAccountId,
          billing_account_id: context.billingAccountId,
          priorActivityId: priorCompletion.id,
          prior_activity_id: priorCompletion.id
        }
      });
      return {
        status: "skipped",
        providerCallId,
        reason: "already_completed",
        activityEntries: [entry]
      };
    }

    const activityEntries: ImmutableActivityLogEntry[] = [];
    activityEntries.push(
      this.appendAudit({
        principal,
        action: "retell.post_call_automation.started",
        entityId: context.billingAccountId,
        after: {
          providerCallId,
          communicationAttemptId: context.communicationAttemptId,
          emailRequested: true
        },
        metadata: this.contextAuditMetadata(context)
      })
    );

    const outcome = await this.recordOutcomeIfNeeded({
      principal,
      context,
      input,
      call,
      callRecord
    });
    activityEntries.push(...outcome.activityEntries);

    const writebacks = await this.persistOutcomeArtifactsIfNeeded({
      principal,
      context
    });
    activityEntries.push(...writebacks.activityEntries);

    const email = await this.sendRecapAndStatementIfNeeded({
      principal,
      context,
      callRecord,
      outcomeRecorded: outcome.recorded
    });
    activityEntries.push(...email.activityEntries);

    activityEntries.push(
      this.appendAudit({
        principal,
        action: "retell.post_call_automation.completed",
        entityId: context.billingAccountId,
        after: {
          providerCallId,
          outcomeRecorded: outcome.recorded,
          taskCount: outcome.taskCount,
          promiseWritebackStatus: writebacks.promiseStatus,
          emailDeliveryState: email.deliveryState,
          emailFailureReason: email.failureReason
        },
        metadata: {
          ...this.contextAuditMetadata(context),
          outcomeRecorded: outcome.recorded,
          outcome_recorded: outcome.recorded,
          taskCount: outcome.taskCount,
          task_count: outcome.taskCount,
          promiseWritebackStatus: writebacks.promiseStatus ?? "",
          promise_writeback_status: writebacks.promiseStatus ?? "",
          emailDeliveryState: email.deliveryState ?? "",
          email_delivery_state: email.deliveryState ?? "",
          emailFailureReason: email.failureReason ?? "",
          email_failure_reason: email.failureReason ?? ""
        }
      })
    );

    return {
      status: "completed",
      providerCallId,
      billingAccountId: context.billingAccountId,
      ...(context.contactId ? { contactId: context.contactId } : {}),
      outcomeRecorded: outcome.recorded,
      taskCount: outcome.taskCount,
      ...(email.deliveryState ? { emailDeliveryState: email.deliveryState } : {}),
      ...(email.failureReason ? { emailFailureReason: email.failureReason } : {}),
      activityEntries
    };
  }

  private async resolveCompleteCall(
    call: RetellCallRecord,
    providerCallId: string
  ): Promise<RetellCallRecord> {
    if (hasUsefulCallAnalysis(call) || !this.deps.retellClient) {
      return call;
    }

    try {
      const retrieved = await this.deps.retellClient.retrieveCall(providerCallId);
      return {
        ...call,
        ...retrieved,
        metadata: {
          ...readRecord(call.metadata),
          ...readRecord(retrieved.metadata)
        },
        retell_llm_dynamic_variables: {
          ...readStringRecord(call.retell_llm_dynamic_variables),
          ...readStringRecord(retrieved.retell_llm_dynamic_variables)
        },
        collected_dynamic_variables: {
          ...readRecord(call.collected_dynamic_variables),
          ...readRecord(retrieved.collected_dynamic_variables)
        }
      };
    } catch (error) {
      if (error instanceof RetellConfigurationError || error instanceof RetellProviderError) {
        return call;
      }
      throw error;
    }
  }

  private async resolveAutomationContext(input: {
    tenantId: string;
    call: RetellCallRecord;
    callRecord: CallInboxCallRecord;
    providerCallId: string;
    occurredAt: string;
  }): Promise<RetellPostCallAutomationContext | undefined> {
    const metadata = readRecord(input.call.metadata);
    const customAnalysis = readRecord(readRecord(input.call.call_analysis).custom_analysis_data);
    const automationOutcome = readRecord(
      customAnalysis.post_call_outcome ?? customAnalysis.call_outcome ?? customAnalysis.outcome
    );
    const billingAccountId =
      input.callRecord.billingAccountId ??
      readFirstString(metadata, ["billing_account_id", "billingAccountId"]);
    if (!billingAccountId) {
      return undefined;
    }

    const account = await this.deps.loaders.loadBillingAccount(billingAccountId);
    if (!account) {
      return undefined;
    }

    const contactId =
      input.callRecord.contactId ??
      readFirstString(metadata, ["contact_id", "contactId"]) ??
      readString(automationOutcome.contactId) ??
      readString(automationOutcome.contact_id);
    const contact = contactId
      ? await this.deps.loaders.loadContact(contactId)
      : await this.deps.loaders.loadSafeBillingAccountContact(account.id);
    const safeFallbackContact = contact
      ? undefined
      : await this.deps.loaders.loadSafeBillingAccountContact(account.id);
    const resolvedContact = contact ?? safeFallbackContact;
    const invoiceIds = invoiceIdsFromReferences(input.callRecord.invoiceRefs);
    const invoices = await this.deps.loaders.loadInvoices({
      billingAccountId: account.id,
      ...(invoiceIds.length > 0 ? { invoiceIds } : {})
    });
    const transcriptSegments = input.callRecord.transcriptSegments.map((segment) => ({
      speaker: segment.speaker,
      ...(segment.startedAtSeconds !== undefined
        ? { startedAtSeconds: segment.startedAtSeconds }
        : {}),
      text: segment.text
    }));
    const summary =
      normalizeCustomerFacingCallSummary(input.callRecord.summary) ??
      buildTranscriptSummary(transcriptSegments) ??
      "Collections call completed. Statement of account is being sent for customer review.";
    const communicationAttemptId =
      input.callRecord.communicationAttemptId ??
      readFirstString(metadata, ["communication_attempt_id", "communicationAttemptId"]) ??
      `retell_${input.providerCallId}`;
    const statementSnapshotId =
      readFirstString(metadata, ["statement_snapshot_id", "statementSnapshotId", "soa_id", "soaId"]) ??
      readFirstString(readRecord(input.call.retell_llm_dynamic_variables), [
        "statement_snapshot_id",
        "statementSnapshotId",
        "soa_id",
        "soaId"
      ]);
    const disposition = resolvePostCallDisposition(input.call, input.callRecord, automationOutcome);
    const outcomeInput = buildOutcomeInputFromRetell({
      tenantId: input.tenantId,
      principal: defaultPostCallAutomationPrincipal(),
      call: input.call,
      callRecord: input.callRecord,
      account,
      ...(resolvedContact ? { contact: resolvedContact } : {}),
      invoices,
      communicationAttemptId,
      providerCallId: input.providerCallId,
      ...(input.callRecord.preCallPlanId ? { preCallPlanId: input.callRecord.preCallPlanId } : {}),
      occurredAt: input.callRecord.endedAt ?? input.occurredAt,
      disposition,
      transcriptSummary: summary,
      transcriptSegments
    });

    return {
      tenantId: input.tenantId,
      providerCallId: input.providerCallId,
      billingAccountId: account.id,
      parentAccountId: input.callRecord.parentAccountId ?? account.parentAccountId,
      ...(input.callRecord.branchId ?? account.branchId
        ? { branchId: input.callRecord.branchId ?? account.branchId }
        : {}),
      ...(resolvedContact ? { contact: resolvedContact, contactId: resolvedContact.id } : {}),
      account,
      invoices,
      invoiceIds,
      communicationAttemptId,
      ...(input.callRecord.preCallPlanId ? { preCallPlanId: input.callRecord.preCallPlanId } : {}),
      ...(statementSnapshotId ? { statementSnapshotId } : {}),
      occurredAt: input.callRecord.endedAt ?? input.occurredAt,
      disposition,
      transcriptSummary: summary,
      transcriptSegments,
      outcomeInput
    };
  }

  private async recordOutcomeIfNeeded(input: {
    principal: Principal;
    context: RetellPostCallAutomationContext;
    input: RetellPostCallAutomationInput;
    call: RetellCallRecord;
    callRecord: CallInboxCallRecord;
  }): Promise<{ recorded: boolean; taskCount: number; activityEntries: ImmutableActivityLogEntry[] }> {
    const priorOutcome = await this.findPriorAutomationAction(
      input.context.billingAccountId,
      ["retell.post_call_automation.outcome_recorded"],
      input.context.providerCallId
    );
    if (priorOutcome) {
      const entry = this.appendAudit({
        principal: input.principal,
        action: "retell.post_call_automation.outcome_skipped",
        entityId: input.context.billingAccountId,
        after: {
          providerCallId: input.context.providerCallId,
          reason: "already_recorded"
        },
        metadata: {
          ...this.contextAuditMetadata(input.context),
          priorActivityId: priorOutcome.id,
          prior_activity_id: priorOutcome.id
        }
      });
      return {
        recorded: false,
        taskCount: input.callRecord.openTasksCount,
        activityEntries: [entry]
      };
    }

    const service = new RetellPreCallOrchestrationService({
      activityStore: this.deps.activityStore,
      retellClient: {
        createOutboundPhoneCall: async () => {
          throw new RetellConfigurationError("Post-call automation does not create Retell calls.");
        }
      },
      ...(this.deps.taskService ? { taskService: this.deps.taskService } : {}),
      config: {
        tenantId: input.context.tenantId
      },
      ...(this.deps.repeatedBrokenPromiseThreshold !== undefined
        ? { repeatedBrokenPromiseThreshold: this.deps.repeatedBrokenPromiseThreshold }
        : {}),
      ...(this.deps.repeatedBrokenPromiseWindowDays !== undefined
        ? { repeatedBrokenPromiseWindowDays: this.deps.repeatedBrokenPromiseWindowDays }
        : {}),
      now: this.now,
      idGenerator: this.idGenerator
    });
    const result = await service.recordPostCallOutcome({
      ...input.context.outcomeInput,
      principal: input.principal
    });
    await this.upsertCallInboxOutcome(input.context, result);
    const entry = this.appendAudit({
      principal: input.principal,
      action: "retell.post_call_automation.outcome_recorded",
      entityId: input.context.billingAccountId,
      after: {
        providerCallId: input.context.providerCallId,
        persistencePlanId: result.persistencePlan.id,
        taskCount: result.tasks.length,
        taskTypes: result.tasks.map((task) => task.taskType)
      },
      metadata: {
        ...this.contextAuditMetadata(input.context),
        persistencePlanId: result.persistencePlan.id,
        persistence_plan_id: result.persistencePlan.id,
        taskCount: result.tasks.length,
        task_count: result.tasks.length,
        taskTypes: result.tasks.map((task) => task.taskType),
        task_types: result.tasks.map((task) => task.taskType)
      }
    });

    return {
      recorded: true,
      taskCount: result.tasks.length,
      activityEntries: [...result.activityEntries, entry]
    };
  }

  private async upsertCallInboxOutcome(
    context: RetellPostCallAutomationContext,
    result: RetellPostCallOutcomeResult
  ) {
    const upsert = postCallOutcomeToCallInboxUpsert({
      tenantId: context.tenantId,
      billingAccountId: context.billingAccountId,
      ...(context.parentAccountId ? { parentAccountId: context.parentAccountId } : {}),
      ...(context.branchId ? { branchId: context.branchId } : {}),
      ...(context.contactId ? { contactId: context.contactId } : {}),
      communicationAttemptId: context.communicationAttemptId,
      providerCallId: context.providerCallId,
      ...(context.preCallPlanId ? { preCallPlanId: context.preCallPlanId } : {}),
      occurredAt: context.occurredAt,
      disposition: context.disposition,
      transcriptSummary: context.transcriptSummary,
      transcriptSegments: context.transcriptSegments,
      taskRefs: toCallInboxTaskReferences(result.tasks),
      invoiceRefs: context.invoices.map((invoice) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        billingAccountId: invoice.billingAccountId,
        ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
        amountCents: invoice.amountCents,
        currency: invoice.currency
      })),
      metadata: {
        source: "retell_post_call_automation",
        customerName: context.account.displayName,
        direction: "outbound",
        persistencePlanId: result.persistencePlan.id,
        persistence_plan_id: result.persistencePlan.id
      }
    });

    if (upsert) {
      await this.deps.callInboxService.upsertCall(defaultPostCallAutomationPrincipal(), upsert);
    }
  }

  private async persistOutcomeArtifactsIfNeeded(input: {
    principal: Principal;
    context: RetellPostCallAutomationContext;
  }): Promise<{
    promiseStatus?: string;
    activityEntries: ImmutableActivityLogEntry[];
  }> {
    const promiseResult = await this.persistPromiseIfNeeded(input);
    return {
      ...(promiseResult.status ? { promiseStatus: promiseResult.status } : {}),
      activityEntries: promiseResult.activityEntries
    };
  }

  private async persistPromiseIfNeeded(input: {
    principal: Principal;
    context: RetellPostCallAutomationContext;
  }): Promise<{ status?: string; activityEntries: ImmutableActivityLogEntry[] }> {
    const promiseUpdate = input.context.outcomeInput.promiseUpdate;
    if (!promiseUpdate) {
      return { activityEntries: [] };
    }

    const prior = await this.findPriorAutomationAction(
      input.context.billingAccountId,
      [
        "retell.post_call_automation.promise_created",
        "retell.post_call_automation.promise_updated",
        "retell.post_call_automation.promise_skipped"
      ],
      input.context.providerCallId
    );
    if (prior) {
      return {
        status: "already_processed",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "already_processed",
            priorActivityId: prior.id,
            prior_activity_id: prior.id
          })
        ]
      };
    }

    if (!this.deps.promiseStore) {
      return {
        status: "no_promise_store",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "no_promise_store"
          })
        ]
      };
    }

    const invoiceIds = uniqueStrings(
      promiseUpdate.invoiceIds.length > 0 ? promiseUpdate.invoiceIds : input.context.invoiceIds
    );
    const disputedInvoiceIds = new Set(input.context.outcomeInput.dispute?.invoiceIds ?? []);
    const touchesDispute =
      input.context.outcomeInput.dispute &&
      (invoiceIds.length === 0 ||
        invoiceIds.some((invoiceId) => disputedInvoiceIds.has(invoiceId)) ||
        ["whole_account_or_balance", "unclear"].includes(
          input.context.outcomeInput.dispute.disputeScope ?? ""
        ));
    if (touchesDispute) {
      return {
        status: "blocked_disputed_scope",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "blocked_disputed_scope",
            invoiceIds,
            disputedInvoiceIds: [...disputedInvoiceIds]
          })
        ]
      };
    }

    const idempotencyKey = buildPromiseWritebackIdempotencyKey(input.context, invoiceIds);
    const existingByKey = await this.deps.promiseStore.findByIdempotencyKey({
      tenantId: input.context.tenantId,
      billingAccountId: input.context.billingAccountId,
      idempotencyKey
    });
    if (existingByKey) {
      return {
        status: "already_persisted",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "already_persisted",
            promiseToPayId: existingByKey.id,
            idempotencyKey
          })
        ]
      };
    }

    const selectedInvoices = selectInvoicesForPromise(input.context.invoices, invoiceIds);
    if (selectedInvoices.some(isDisputedInvoice)) {
      return {
        status: "blocked_disputed_invoice",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "blocked_disputed_invoice",
            invoiceIds
          })
        ]
      };
    }

    const targetPromise = await this.resolvePromiseUpdateTarget(input.context, promiseUpdate, invoiceIds);
    if (promiseUpdate.promiseToPayId || promiseUpdate.status !== "new") {
      if (targetPromise.status !== "found") {
        return {
          status: targetPromise.reason,
          activityEntries: [
            this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
              reason: targetPromise.reason,
              invoiceIds,
              requestedPromiseToPayId: promiseUpdate.promiseToPayId ?? ""
            })
          ]
        };
      }

      const updateResult = await this.deps.promiseStore.updatePromise({
        tenantId: input.context.tenantId,
        promiseToPayId: targetPromise.promise.id,
        patch: {
          ...(promiseUpdate.promisedDate ? { promiseDate: promiseUpdate.promisedDate } : {}),
          ...(promiseUpdate.promisedAmountCents !== undefined
            ? { promisedAmountCents: promiseUpdate.promisedAmountCents }
            : {}),
          ...(promiseUpdate.currency ? { currency: promiseUpdate.currency } : {}),
          state: promiseStateFromPostCallStatus(promiseUpdate.status),
          updatedAt: input.context.occurredAt,
          actorId: input.principal.id,
          actorRole: input.principal.roles[0] ?? "system",
          metadata: {
            source: "retell_post_call_automation",
            providerCallId: input.context.providerCallId,
            communicationAttemptId: input.context.communicationAttemptId,
            idempotencyKey,
            invoiceIds,
            status: promiseUpdate.status,
            notes: promiseUpdate.notes ?? ""
          }
        }
      });

      return {
        status: updateResult.status,
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_updated", {
            promiseToPayId: targetPromise.promise.id,
            status: updateResult.status,
            invoiceIds,
            promisedDate: promiseUpdate.promisedDate ?? "",
            promisedAmountCents: promiseUpdate.promisedAmountCents ?? null,
            idempotencyKey
          })
        ]
      };
    }

    if (!promiseUpdate.promisedDate && promiseUpdate.promisedAmountCents === undefined) {
      return {
        status: "ambiguous_promise",
        activityEntries: [
          this.appendPromiseAudit(input, "retell.post_call_automation.promise_skipped", {
            reason: "ambiguous_promise",
            invoiceIds
          })
        ]
      };
    }

    const promise = buildPostCallPromiseToPay({
      context: input.context,
      invoices: selectedInvoices,
      promiseUpdate,
      id: this.idGenerator(),
      idempotencyKey,
      principal: input.principal
    });
    const result = await this.deps.promiseStore.createPromise({
      tenantId: input.context.tenantId,
      promise,
      idempotencyKey
    });

    return {
      status: result.status,
      activityEntries: [
        this.appendPromiseAudit(input, "retell.post_call_automation.promise_created", {
          promiseToPayId: result.promise.id,
          status: result.status,
          invoiceIds,
          promisedDate: result.promise.promiseDate,
          promisedAmountCents: result.promise.promisedAmountCents,
          promiseState: result.promise.state,
          idempotencyKey
        })
      ]
    };
  }

  private async resolvePromiseUpdateTarget(
    context: RetellPostCallAutomationContext,
    promiseUpdate: NonNullable<RecordRetellPostCallOutcomeInput["promiseUpdate"]>,
    invoiceIds: string[]
  ): Promise<
    | { status: "found"; promise: PromiseToPay }
    | { status: "missing"; reason: string }
  > {
    if (!this.deps.promiseStore) {
      return { status: "missing", reason: "no_promise_store" };
    }
    if (promiseUpdate.promiseToPayId) {
      const matches = await this.deps.promiseStore.listActivePromises({
        tenantId: context.tenantId,
        billingAccountId: context.billingAccountId,
        invoiceIds
      });
      const byId = matches.find((promise) => promise.id === promiseUpdate.promiseToPayId);
      return byId
        ? { status: "found", promise: byId }
        : { status: "missing", reason: "missing_existing_promise" };
    }

    const activePromises = await this.deps.promiseStore.listActivePromises({
      tenantId: context.tenantId,
      billingAccountId: context.billingAccountId,
      invoiceIds
    });
    if (activePromises.length === 1 && activePromises[0]) {
      return { status: "found", promise: activePromises[0] };
    }
    return {
      status: "missing",
      reason: activePromises.length > 1 ? "ambiguous_existing_promise" : "missing_existing_promise"
    };
  }

  private appendPromiseAudit(
    input: {
      principal: Principal;
      context: RetellPostCallAutomationContext;
    },
    action: string,
    after: Record<string, unknown>
  ) {
    return this.appendAudit({
      principal: input.principal,
      action,
      entityId: input.context.billingAccountId,
      after: {
        providerCallId: input.context.providerCallId,
        ...after
      },
      metadata: {
        ...this.contextAuditMetadata(input.context),
        ...after
      }
    });
  }

  private async sendRecapAndStatementIfNeeded(input: {
    principal: Principal;
    context: RetellPostCallAutomationContext;
    callRecord: CallInboxCallRecord;
    outcomeRecorded: boolean;
  }): Promise<{
    deliveryState?: OutboundEmailSendResult["deliveryState"];
    failureReason?: string;
    activityEntries: ImmutableActivityLogEntry[];
  }> {
    if (!shouldSendStatementForDisposition(input.context.disposition)) {
      const entry = this.appendAudit({
        principal: input.principal,
        action: "retell.post_call_automation.soa_email_skipped",
        entityId: input.context.billingAccountId,
        after: {
          providerCallId: input.context.providerCallId,
          disposition: input.context.disposition
        },
        metadata: {
          ...this.contextAuditMetadata(input.context),
          reason: "non_sendable_disposition",
          disposition: input.context.disposition
        }
      });
      return {
        failureReason: "non_sendable_disposition",
        activityEntries: [entry]
      };
    }

    if (!input.context.contact) {
      const entry = this.appendAudit({
        principal: input.principal,
        action: "retell.post_call_automation.soa_email_blocked",
        entityId: input.context.billingAccountId,
        after: {
          providerCallId: input.context.providerCallId,
          reason: "missing_contact"
        },
        metadata: {
          ...this.contextAuditMetadata(input.context),
          deliveryState: "blocked",
          delivery_state: "blocked",
          failureReason: "missing_contact",
          failure_reason: "missing_contact"
        }
      });
      return {
        deliveryState: "blocked",
        failureReason: "missing_contact",
        activityEntries: [entry]
      };
    }

    if (input.context.invoices.length === 0) {
      const entry = this.appendAudit({
        principal: input.principal,
        action: "retell.post_call_automation.soa_email_blocked",
        entityId: input.context.billingAccountId,
        after: {
          providerCallId: input.context.providerCallId,
          reason: "no_open_invoices"
        },
        metadata: {
          ...this.contextAuditMetadata(input.context),
          deliveryState: "blocked",
          delivery_state: "blocked",
          failureReason: "no_open_invoices",
          failure_reason: "no_open_invoices"
        }
      });
      return {
        deliveryState: "blocked",
        failureReason: "no_open_invoices",
        activityEntries: [entry]
      };
    }

    const priorEmail = await this.findPriorAutomationAction(
      input.context.billingAccountId,
      [
        "retell.post_call_automation.soa_email_sent",
        "retell.post_call_automation.soa_email_approval_needed"
      ],
      input.context.providerCallId
    );
    if (priorEmail) {
      const entry = this.appendAudit({
        principal: input.principal,
        action: "retell.post_call_automation.soa_email_skipped",
        entityId: input.context.billingAccountId,
        after: {
          providerCallId: input.context.providerCallId,
          reason: "already_processed"
        },
        metadata: {
          ...this.contextAuditMetadata(input.context),
          priorActivityId: priorEmail.id,
          prior_activity_id: priorEmail.id
        }
      });
      return {
        failureReason: "already_processed",
        activityEntries: [entry]
      };
    }

    const attachment = await createStatementOfAccountPdfAttachment({
      account: input.context.account,
      contact: input.context.contact,
      invoices: input.context.invoices,
      asOf: input.context.occurredAt,
      ...(input.context.statementSnapshotId
        ? { statementSnapshotId: input.context.statementSnapshotId }
        : {})
    });
    const bodyPreview = buildRetellStatementEmailBody({
      account: input.context.account,
      contact: input.context.contact,
      callSummary: input.context.transcriptSummary
    });
    const sendResult = await this.deps.emailService.sendResendDocuments({
      principal: input.principal,
      account: input.context.account,
      invoices: input.context.invoices,
      contact: input.context.contact,
      subjectLine: `Call recap and Statement of Account - ${input.context.account.displayName}`,
      bodyPreview,
      ...(input.context.statementSnapshotId ? { documentIds: [input.context.statementSnapshotId] } : {}),
      attachments: [attachment]
    });
    const action = toSoaEmailAuditAction(sendResult.deliveryState);
    const entry = this.appendAudit({
      principal: input.principal,
      action,
      entityId: input.context.billingAccountId,
      after: {
        providerCallId: input.context.providerCallId,
        deliveryState: sendResult.deliveryState,
        failureReason: sendResult.failureReason,
        communicationAttemptId: sendResult.communicationAttempt?.id,
        approvalRequestId: sendResult.approvalRequest?.id,
        attachmentFileName: attachment.fileName,
        bodyPreview
      },
      metadata: {
        ...this.contextAuditMetadata(input.context),
        deliveryState: sendResult.deliveryState,
        delivery_state: sendResult.deliveryState,
        failureReason: sendResult.failureReason ?? "",
        failure_reason: sendResult.failureReason ?? "",
        emailCommunicationAttemptId: sendResult.communicationAttempt?.id ?? "",
        email_communication_attempt_id: sendResult.communicationAttempt?.id ?? "",
        approvalRequestId: sendResult.approvalRequest?.id ?? "",
        approval_request_id: sendResult.approvalRequest?.id ?? "",
        attachmentFileName: attachment.fileName,
        attachment_file_name: attachment.fileName,
        callSummaryIncluded: Boolean(input.context.transcriptSummary),
        call_summary_included: Boolean(input.context.transcriptSummary)
      }
    });

    return {
      deliveryState: sendResult.deliveryState,
      ...(sendResult.failureReason ? { failureReason: sendResult.failureReason } : {}),
      activityEntries: [...sendResult.activityEntries, entry]
    };
  }

  private async findPriorAutomationAction(
    billingAccountId: string,
    actions: string[],
    providerCallId: string
  ): Promise<ImmutableActivityLogEntry | undefined> {
    const entries = await listActivityEntries(this.deps.activityStore, {
      entityType: "billing_account",
      entityId: billingAccountId,
      actions
    });
    return entries.find((entry) => {
      const entryProviderCallId =
        readString(entry.metadata.providerCallId) ??
        readString(entry.metadata.provider_call_id) ??
        readString(entry.after?.providerCallId);
      return entryProviderCallId === providerCallId;
    });
  }

  private appendAudit(input: {
    principal: Principal;
    action: string;
    entityId: string;
    after: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }) {
    return this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "system",
      action: input.action,
      entityType: "billing_account",
      entityId: input.entityId,
      after: serializeJson(input.after),
      metadata: input.metadata
    });
  }

  private contextAuditMetadata(
    context: RetellPostCallAutomationContext
  ): Record<string, unknown> {
    return {
      tenantId: context.tenantId,
      tenant_id: context.tenantId,
      provider: "retell",
      providerCallId: context.providerCallId,
      provider_call_id: context.providerCallId,
      billingAccountId: context.billingAccountId,
      billing_account_id: context.billingAccountId,
      parentAccountId: context.parentAccountId,
      parent_account_id: context.parentAccountId,
      branchId: context.branchId,
      branch_id: context.branchId,
      contactId: context.contactId,
      contact_id: context.contactId,
      communicationAttemptId: context.communicationAttemptId,
      communication_attempt_id: context.communicationAttemptId,
      preCallPlanId: context.preCallPlanId,
      pre_call_plan_id: context.preCallPlanId,
      disposition: context.disposition
    };
  }
}

type RetellPostCallAutomationContext = {
  tenantId: string;
  providerCallId: string;
  billingAccountId: string;
  parentAccountId?: string;
  branchId?: string;
  contactId?: string;
  contact?: Contact;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  invoiceIds: string[];
  communicationAttemptId: string;
  preCallPlanId?: string;
  statementSnapshotId?: string;
  occurredAt: string;
  disposition: string;
  transcriptSummary: string;
  transcriptSegments: Array<{
    speaker: "agent" | "customer" | "unknown";
    startedAtSeconds?: number;
    text: string;
  }>;
  outcomeInput: RecordRetellPostCallOutcomeInput;
};

async function createDefaultRetellPostCallAutomationService(tenantId: string) {
  const canUseDatabase =
    databaseUrl.trim().length > 0 && isDatabaseAvailable(databaseUrl);
  const activityStore =
    canUseDatabase
      ? new PostgresImmutableActivityLogStore(databaseUrl, tenantId)
      : new InMemoryImmutableActivityLogStore();
  const envApiKey = process.env.RETELL_API_KEY?.trim();
  const envBaseUrl = process.env.RETELL_BASE_URL?.trim();

  return new RetellPostCallAutomationService({
    activityStore,
    callInboxService: getCallInboxService(),
    emailService: getEmailOutboundService(),
    taskService: await getTaskService(),
    ...(canUseDatabase ? { promiseStore: new PostgresRetellPostCallPromiseStore(databaseUrl) } : {}),
    ...(envApiKey
      ? {
          retellClient: new RetellHttpClient({
            apiKey: envApiKey,
            ...(envBaseUrl ? { baseUrl: envBaseUrl } : {})
          })
        }
      : {}),
    loaders: createDatabaseRetellPostCallAutomationLoaders(),
    idGenerator: randomUUID
  });
}

function defaultPostCallAutomationPrincipal(): RetellAutomationPrincipal {
  return {
    id: "retell_post_call_automation",
    roles: ["ar_collector"]
  };
}

class PostgresRetellPostCallPromiseStore implements RetellPostCallPromiseStore {
  constructor(private readonly databaseUrl: string) {}

  findByIdempotencyKey(input: {
    tenantId: string;
    billingAccountId: string;
    idempotencyKey: string;
  }): PromiseToPay | undefined {
    const [row] = queryJsonRows<PromiseToPayRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          ${promiseToPaySelectSql()}
          WHERE tenant_id = '${quoteSql(input.tenantId)}'
            AND deleted_at IS NULL
            AND billing_account_id = '${quoteSql(input.billingAccountId)}'::uuid
            AND (
              metadata->>'postCallAutomationIdempotencyKey' = '${quoteSql(input.idempotencyKey)}'
              OR metadata->>'idempotencyKey' = '${quoteSql(input.idempotencyKey)}'
            )
          LIMIT 1
        ) q
      `
    );
    return row ? toPromiseToPay(row) : undefined;
  }

  listActivePromises(input: {
    tenantId: string;
    billingAccountId: string;
    invoiceIds: string[];
  }): PromiseToPay[] {
    const invoiceFilter = input.invoiceIds.length
      ? `
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(metadata->'invoiceIds', '[]'::jsonb)) invoice_id
          WHERE invoice_id = ANY(${sqlTextArray(input.invoiceIds)})
        )
      `
      : "";
    const rows = queryJsonRows<PromiseToPayRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          ${promiseToPaySelectSql()}
          WHERE tenant_id = '${quoteSql(input.tenantId)}'
            AND deleted_at IS NULL
            AND billing_account_id = '${quoteSql(input.billingAccountId)}'::uuid
            AND state IN ('detected_unconfirmed', 'accepted', 'due_today')
            ${invoiceFilter}
          ORDER BY promise_date DESC, updated_at DESC
          LIMIT 20
        ) q
      `
    );
    return rows.map(toPromiseToPay);
  }

  async createPromise(input: {
    tenantId: string;
    promise: PromiseToPay;
    idempotencyKey: string;
  }): Promise<{ status: "created" | "existing"; promise: PromiseToPay }> {
    const existing = this.findByIdempotencyKey({
      tenantId: input.tenantId,
      billingAccountId: input.promise.billingAccountId,
      idempotencyKey: input.idempotencyKey
    });
    if (existing) {
      return { status: "existing", promise: existing };
    }

    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO promise_to_pay (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          parent_account_id,
          billing_account_id,
          contact_id,
          installment_line_ids,
          promised_amount_cents,
          currency,
          promise_date,
          state,
          metadata
        )
        VALUES (
          '${quoteSql(input.promise.id)}'::uuid,
          '${quoteSql(input.tenantId)}',
          1,
          '${quoteSql(input.promise.createdAt)}'::timestamptz,
          '${quoteSql(input.promise.updatedAt)}'::timestamptz,
          ${sqlNullableText(input.promise.createdByActorId)},
          ${sqlNullableText(input.promise.createdByActorRole)},
          ${sqlNullableText(input.promise.updatedByActorId)},
          ${sqlNullableText(input.promise.updatedByActorRole)},
          '${quoteSql(input.promise.parentAccountId)}'::uuid,
          '${quoteSql(input.promise.billingAccountId)}'::uuid,
          ${input.promise.contactId ? `'${quoteSql(input.promise.contactId)}'::uuid` : "NULL"},
          ${input.promise.installmentLineIds ? `'${jsonSql(input.promise.installmentLineIds)}'::jsonb` : "NULL"},
          ${input.promise.promisedAmountCents},
          '${quoteSql(input.promise.currency)}',
          '${quoteSql(input.promise.promiseDate)}'::date,
          '${quoteSql(input.promise.state)}',
          '${jsonSql(input.promise.metadata)}'::jsonb
        );
      `
    );

    return { status: "created", promise: input.promise };
  }

  async updatePromise(input: {
    tenantId: string;
    promiseToPayId: string;
    patch: {
      promiseDate?: string;
      promisedAmountCents?: number;
      currency?: string;
      state?: PromiseToPayState;
      metadata: Record<string, unknown>;
      updatedAt: string;
      actorId: string;
      actorRole: string;
    };
  }): Promise<{ status: "updated" | "missing"; promise?: PromiseToPay }> {
    executeSqlCommand(
      this.databaseUrl,
      `
        UPDATE promise_to_pay
        SET
          updated_at = '${quoteSql(input.patch.updatedAt)}'::timestamptz,
          updated_by_actor_id = '${quoteSql(input.patch.actorId)}',
          updated_by_actor_role = '${quoteSql(input.patch.actorRole)}',
          ${input.patch.promiseDate ? `promise_date = '${quoteSql(input.patch.promiseDate)}'::date,` : ""}
          ${input.patch.promisedAmountCents !== undefined ? `promised_amount_cents = ${input.patch.promisedAmountCents},` : ""}
          ${input.patch.currency ? `currency = '${quoteSql(input.patch.currency)}',` : ""}
          ${input.patch.state ? `state = '${quoteSql(input.patch.state)}',` : ""}
          metadata = metadata || '${jsonSql(input.patch.metadata)}'::jsonb
        WHERE tenant_id = '${quoteSql(input.tenantId)}'
          AND deleted_at IS NULL
          AND id = '${quoteSql(input.promiseToPayId)}'::uuid;
      `
    );
    const [row] = queryJsonRows<PromiseToPayRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          ${promiseToPaySelectSql()}
          WHERE tenant_id = '${quoteSql(input.tenantId)}'
            AND deleted_at IS NULL
            AND id = '${quoteSql(input.promiseToPayId)}'::uuid
          LIMIT 1
        ) q
      `
    );
    return row ? { status: "updated", promise: toPromiseToPay(row) } : { status: "missing" };
  }
}

function buildOutcomeInputFromRetell(input: {
  tenantId: string;
  principal: Principal;
  call: RetellCallRecord;
  callRecord: CallInboxCallRecord;
  account: BillingAccount;
  contact?: Contact;
  invoices: CustomerInvoice[];
  communicationAttemptId: string;
  providerCallId: string;
  preCallPlanId?: string;
  occurredAt: string;
  disposition: string;
  transcriptSummary: string;
  transcriptSegments: Array<{
    speaker: "agent" | "customer" | "unknown";
    startedAtSeconds?: number;
    text: string;
  }>;
}): RecordRetellPostCallOutcomeInput {
  const callAnalysis = readRecord(input.call.call_analysis);
  const customAnalysis = readRecord(callAnalysis.custom_analysis_data);
  const structuredOutcome = readRecord(
    customAnalysis.post_call_outcome ?? customAnalysis.call_outcome ?? customAnalysis.outcome
  );
  const dynamicVariables = readRecord(input.call.retell_llm_dynamic_variables);
  const collectedVariables = readRecord(input.call.collected_dynamic_variables);
  const metadata = readRecord(input.call.metadata);
  const invoiceIds =
    invoiceIdsFromReferences(input.callRecord.invoiceRefs).length > 0
      ? invoiceIdsFromReferences(input.callRecord.invoiceRefs)
      : input.invoices.map((invoice) => invoice.id);
  const extractedVariables = normalizeRetellPostCallExtractedVariables({
    variables: {
      ...metadata,
      ...dynamicVariables,
      ...customAnalysis,
      ...structuredOutcome,
      ...collectedVariables
    },
    invoices: input.invoices,
    invoiceRefs: input.callRecord.invoiceRefs
  });
  const normalizedOutcome = normalizeVoicePostCallOutcome({
    invoiceIds,
    defaultCurrency: input.account.currency,
    occurredAt: input.occurredAt,
    disposition: input.disposition,
    transcriptSummary: input.transcriptSummary,
    transcriptText: input.transcriptSegments.map((segment) => segment.text).join("\n"),
    analysis: {
      ...callAnalysis,
      ...customAnalysis,
      post_call_outcome: structuredOutcome
    },
    extractedVariables
  });
  const sentimentLabel = normalizeSentiment(
    readString(callAnalysis.user_sentiment) ?? readString(customAnalysis.sentiment)
  );
  const operatorReviewRequired = normalizedOutcome.operatorReviewRequired;

  return {
    principal: input.principal,
    billingAccountId: input.account.id,
    parentAccountId: input.account.parentAccountId,
    ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
    ...(input.contact ? { contactId: input.contact.id } : {}),
    communicationAttemptId: input.communicationAttemptId,
    providerCallId: input.providerCallId,
    ...(input.preCallPlanId ? { preCallPlanId: input.preCallPlanId } : {}),
    occurredAt: input.occurredAt,
    disposition: input.disposition,
    ...(normalizedOutcome.promisedAmountCents !== undefined
      ? { promisedAmountCents: normalizedOutcome.promisedAmountCents }
      : {}),
    ...(normalizedOutcome.promisedDate ? { promisedDate: normalizedOutcome.promisedDate } : {}),
    ...(input.callRecord.transcriptUri ? { transcriptUri: input.callRecord.transcriptUri } : {}),
    transcriptSummary: input.transcriptSummary,
    transcriptSegments: input.transcriptSegments,
    ...(sentimentLabel ? { sentimentLabel } : {}),
    ...(operatorReviewRequired !== undefined ? { operatorReviewRequired } : {}),
    ...(normalizedOutcome.promiseUpdate ? { promiseUpdate: normalizedOutcome.promiseUpdate } : {}),
    ...(normalizedOutcome.partialPaymentCommitment
      ? { partialPaymentCommitment: normalizedOutcome.partialPaymentCommitment }
      : {}),
    ...(normalizedOutcome.paymentPlanRequest
      ? { paymentPlanRequest: normalizedOutcome.paymentPlanRequest }
      : {}),
    ...(normalizedOutcome.nonCommitment ? { nonCommitment: normalizedOutcome.nonCommitment } : {}),
    ...(normalizedOutcome.paidAlreadyClaim
      ? { paidAlreadyClaim: normalizedOutcome.paidAlreadyClaim }
      : {}),
    ...(normalizedOutcome.dispute ? { dispute: normalizedOutcome.dispute } : {}),
    ...(normalizedOutcome.callback ? { callback: normalizedOutcome.callback } : {}),
    ...(normalizedOutcome.contactHandoff ? { contactHandoff: normalizedOutcome.contactHandoff } : {}),
    ...(normalizedOutcome.routingChangeRequest
      ? { routingChangeRequest: normalizedOutcome.routingChangeRequest }
      : {}),
    ...(normalizedOutcome.followUpActions.length > 0
      ? { followUpActions: normalizedOutcome.followUpActions }
      : {})
  };
}

function normalizeRetellPostCallExtractedVariables(input: {
  variables: Record<string, unknown>;
  invoices: CustomerInvoice[];
  invoiceRefs: CallInboxInvoiceReference[];
}): Record<string, unknown> {
  const invoiceAliases = buildInvoiceAliasMap(input.invoices, input.invoiceRefs);
  if (invoiceAliases.size === 0) {
    return input.variables;
  }

  const normalized: Record<string, unknown> = { ...input.variables };
  for (const key of Object.keys(normalized)) {
    if (!retellInvoiceScopeVariableKeys.has(key)) {
      continue;
    }
    const invoiceIds = resolveRetellInvoiceReferences(normalized[key], invoiceAliases);
    if (invoiceIds) {
      normalized[key] = invoiceIds;
      for (const alias of retellInvoiceScopeKeyAliases[key] ?? []) {
        normalized[alias] = invoiceIds;
      }
    }
  }

  for (const key of retellNestedOutcomeKeys) {
    const value = normalized[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const nested = { ...(value as Record<string, unknown>) };
    let changed = false;
    for (const nestedKey of Object.keys(nested)) {
      if (!retellInvoiceScopeVariableKeys.has(nestedKey)) {
        continue;
      }
      const invoiceIds = resolveRetellInvoiceReferences(nested[nestedKey], invoiceAliases);
      if (invoiceIds) {
        nested[nestedKey] = invoiceIds;
        changed = true;
      }
    }
    if (changed) {
      normalized[key] = nested;
    }
  }

  return normalized;
}

const retellNestedOutcomeKeys = [
  "promiseUpdate",
  "promise_update",
  "promise",
  "promise_to_pay",
  "paidAlreadyClaim",
  "paid_already_claim",
  "paidAlready",
  "paid_already",
  "dispute",
  "disputeCapture",
  "dispute_capture",
  "partialPaymentCommitment",
  "partial_payment_commitment",
  "paymentPlanRequest",
  "payment_plan_request",
  "nonCommitment",
  "non_commitment"
];

const retellInvoiceScopeKeyAliases: Record<string, string[]> = {
  invoiceIds: ["invoice_ids", "linkedInvoiceIds", "linked_invoice_ids"],
  invoice_ids: ["invoiceIds", "linkedInvoiceIds", "linked_invoice_ids"],
  linkedInvoiceIds: ["invoiceIds", "invoice_ids", "linked_invoice_ids"],
  linked_invoice_ids: ["invoiceIds", "invoice_ids", "linkedInvoiceIds"],
  promiseInvoiceIds: ["promise_invoice_ids"],
  promise_invoice_ids: ["promiseInvoiceIds"],
  paidInvoiceIds: ["paid_invoice_ids"],
  paid_invoice_ids: ["paidInvoiceIds"],
  disputeInvoiceIds: ["dispute_invoice_ids", "disputedInvoiceIds", "disputed_invoice_ids"],
  dispute_invoice_ids: ["disputeInvoiceIds", "disputedInvoiceIds", "disputed_invoice_ids"],
  disputedInvoiceIds: ["disputed_invoice_ids", "disputeInvoiceIds", "dispute_invoice_ids"],
  disputed_invoice_ids: ["disputedInvoiceIds", "disputeInvoiceIds", "dispute_invoice_ids"],
  partialPaymentInvoiceIds: ["partial_payment_invoice_ids"],
  partial_payment_invoice_ids: ["partialPaymentInvoiceIds"],
  paymentPlanInvoiceIds: ["payment_plan_invoice_ids"],
  payment_plan_invoice_ids: ["paymentPlanInvoiceIds"],
  nonCommitmentInvoiceIds: ["non_commitment_invoice_ids"],
  non_commitment_invoice_ids: ["nonCommitmentInvoiceIds"]
};

const retellInvoiceScopeVariableKeys = new Set([
  ...Object.keys(retellInvoiceScopeKeyAliases),
  ...Object.values(retellInvoiceScopeKeyAliases).flat()
]);

function buildInvoiceAliasMap(
  invoices: CustomerInvoice[],
  invoiceRefs: CallInboxInvoiceReference[]
): Map<string, string> {
  const aliases = new Map<string, string>();
  const addAlias = (alias: unknown, invoiceId: string | undefined) => {
    const normalizedAlias = typeof alias === "string" ? normalizeInvoiceReferenceAlias(alias) : undefined;
    if (normalizedAlias && invoiceId) {
      aliases.set(normalizedAlias, invoiceId);
    }
  };

  for (const invoice of invoices) {
    addAlias(invoice.id, invoice.id);
    addAlias(invoice.invoiceNumber, invoice.id);
    addAlias(invoice.metadata.invoiceNumber, invoice.id);
    addAlias(invoice.metadata.invoice_number, invoice.id);
    addAlias(invoice.metadata.externalId, invoice.id);
    addAlias(invoice.metadata.external_id, invoice.id);
    addAlias(invoice.metadata.erpInvoiceId, invoice.id);
    addAlias(invoice.metadata.erp_invoice_id, invoice.id);
  }

  for (const invoiceRef of invoiceRefs) {
    addAlias(invoiceRef.invoiceId, invoiceRef.invoiceId);
    addAlias(invoiceRef.invoiceNumber, invoiceRef.invoiceId);
  }

  return aliases;
}

function resolveRetellInvoiceReferences(
  value: unknown,
  invoiceAliases: Map<string, string>
): string[] | undefined {
  const tokens = parseRetellInvoiceReferenceTokens(value);
  if (tokens.length === 0) {
    return undefined;
  }

  const mapped = tokens
    .map((token) => invoiceAliases.get(normalizeInvoiceReferenceAlias(token)))
    .filter((invoiceId): invoiceId is string => typeof invoiceId === "string" && invoiceId.length > 0);

  return mapped.length > 0 ? uniqueStrings(mapped) : undefined;
}

function parseRetellInvoiceReferenceTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => parseRetellInvoiceReferenceTokens(entry)));
  }
  if (typeof value !== "string") {
    return [];
  }
  return uniqueStrings(value.split(/[,;\n|]+/));
}

function normalizeInvoiceReferenceAlias(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim()
    .toLowerCase();
}

function resolvePostCallDisposition(
  call: RetellCallRecord,
  callRecord: CallInboxCallRecord,
  structuredOutcome: Record<string, unknown>
) {
  const explicit =
    readString(structuredOutcome.disposition) ??
    readString(structuredOutcome.callDisposition) ??
    readString(structuredOutcome.call_disposition);
  if (explicit && allowedDispositionValues.has(explicit)) {
    return explicit;
  }

  const lowerSummary = (callRecord.summary ?? "").toLowerCase();
  const lowerDisposition = `${callRecord.disposition ?? ""} ${readString(call.disconnection_reason) ?? ""}`.toLowerCase();
  if (callRecord.voicemail || lowerDisposition.includes("voicemail")) {
    return "voicemail_left";
  }
  if (lowerDisposition.includes("wrong") && lowerDisposition.includes("contact")) {
    return "wrong_contact";
  }
  if (lowerSummary.includes("callback") || lowerDisposition.includes("callback")) {
    return "callback_requested";
  }
  if (lowerSummary.includes("promise") || lowerSummary.includes("will pay")) {
    return "good_to_pay";
  }
  if (callRecord.status === "failed" || readString(call.call_status) === "not_connected") {
    return "missed";
  }
  return "connected";
}

function buildPostCallPromiseToPay(input: {
  context: RetellPostCallAutomationContext;
  invoices: CustomerInvoice[];
  promiseUpdate: NonNullable<RecordRetellPostCallOutcomeInput["promiseUpdate"]>;
  id: string;
  idempotencyKey: string;
  principal: Principal;
}): PromiseToPay {
  const selectedInvoices = input.invoices.length > 0 ? input.invoices : input.context.invoices;
  const analysis = buildPostCallPromiseAnalysis({
    invoices: selectedInvoices,
    promiseUpdate: input.promiseUpdate,
    accountCurrency: input.context.account.currency
  });
  const promise = createPromiseToPayFromReply({
    id: input.id,
    now: input.context.occurredAt,
    account: input.context.account,
    invoices: selectedInvoices,
    analysis,
    ...(input.context.contact ? { contact: input.context.contact } : {})
  });
  const acceptance = decidePromiseToPayAcceptance({
    account: input.context.account,
    promiseToPay: promise,
    ...(input.context.contact ? { contact: input.context.contact } : {})
  });

  return {
    ...promise,
    state: acceptance.nextState,
    createdByActorId: input.principal.id,
    createdByActorRole: input.principal.roles[0] ?? "system",
    updatedByActorId: input.principal.id,
    updatedByActorRole: input.principal.roles[0] ?? "system",
    metadata: {
      ...promise.metadata,
      source: "retell_post_call_automation",
      providerCallId: input.context.providerCallId,
      communicationAttemptId: input.context.communicationAttemptId,
      preCallPlanId: input.context.preCallPlanId ?? "",
      branchId: input.context.branchId ?? "",
      invoiceIds: selectedInvoices.map((invoice) => invoice.id),
      postCallAutomationIdempotencyKey: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      autoAccepted: acceptance.autoAccepted,
      acceptanceReasons: acceptance.reasons,
      notes: input.promiseUpdate.notes ?? ""
    }
  };
}

function buildPostCallPromiseAnalysis(input: {
  invoices: CustomerInvoice[];
  promiseUpdate: NonNullable<RecordRetellPostCallOutcomeInput["promiseUpdate"]>;
  accountCurrency: string;
}): CollectionReplyAnalysis {
  const primaryInvoice = input.invoices[0];
  const promiseDate = input.promiseUpdate.promisedDate ?? new Date().toISOString().slice(0, 10);
  return {
    classification: "promise_to_pay",
    confidence: input.promiseUpdate.promisedDate ? 0.95 : 0.72,
    requiresHumanReview: !input.promiseUpdate.promisedDate,
    reasons: ["retell_post_call_outcome"],
    extractedPromiseDate: promiseDate,
    ...(input.promiseUpdate.promisedAmountCents !== undefined
      ? { extractedAmountCents: input.promiseUpdate.promisedAmountCents }
      : {}),
    invoices: input.invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      matchedBy: "provided_context"
    })),
    requestedDocumentTypes: [],
    ptp: {
      promiseDate,
      promisedAmountCents:
        input.promiseUpdate.promisedAmountCents ??
        primaryInvoice?.collectibleAmountCents ??
        primaryInvoice?.amountCents ??
        0,
      currency: input.promiseUpdate.currency ?? primaryInvoice?.currency ?? input.accountCurrency,
      confidence: input.promiseUpdate.promisedDate ? 0.95 : 0.72,
      riskFlags: input.promiseUpdate.promisedDate ? [] : ["ambiguous_promise_date"]
    }
  };
}

function selectInvoicesForPromise(
  invoices: CustomerInvoice[],
  invoiceIds: string[]
): CustomerInvoice[] {
  const selected = invoices.filter((invoice) => invoiceIds.includes(invoice.id));
  return selected.length > 0 ? selected : invoices;
}

function isDisputedInvoice(invoice: CustomerInvoice): boolean {
  return invoice.state === "disputed_full" || invoice.state === "disputed_partial";
}

function promiseStateFromPostCallStatus(
  status: NonNullable<RecordRetellPostCallOutcomeInput["promiseUpdate"]>["status"] | undefined
): PromiseToPayState {
  switch (status) {
    case "kept":
      return "kept";
    case "broken":
      return "broken";
    case "cancelled":
      return "cancelled";
    case "updated":
    case "new":
    default:
      return "accepted";
  }
}

function buildPromiseWritebackIdempotencyKey(
  context: RetellPostCallAutomationContext,
  invoiceIds: string[]
) {
  return [
    context.tenantId,
    "retell",
    context.providerCallId,
    "promise",
    uniqueStrings(invoiceIds).sort().join(",") || "account"
  ].join(":");
}

const allowedDispositionValues = new Set([
  "connected",
  "missed",
  "voicemail_left",
  "wrong_contact",
  "callback_requested",
  "good_to_pay",
  "operator_review_required"
]);

function resolvePromiseUpdate(input: {
  structuredOutcome: Record<string, unknown>;
  customAnalysis: Record<string, unknown>;
  invoiceIds: string[];
  promisedDate?: string;
  promisedAmountCents?: number;
  account: BillingAccount;
}) {
  const promise = readRecord(
    input.structuredOutcome.promiseUpdate ??
      input.structuredOutcome.promise_update ??
      input.customAnalysis.promise_update
  );
  const status = readString(promise.status) ?? readString(input.customAnalysis.promise_status);
  if (!input.promisedDate && input.promisedAmountCents === undefined && !status) {
    return undefined;
  }
  const promiseToPayId =
    readString(promise.promiseToPayId) ?? readString(promise.promise_to_pay_id);
  const notes = readString(promise.notes);

  return {
    invoiceIds: readStringArray(promise.invoiceIds ?? promise.invoice_ids, input.invoiceIds),
    ...(promiseToPayId ? { promiseToPayId } : {}),
    ...(input.promisedDate ? { promisedDate: input.promisedDate } : {}),
    ...(input.promisedAmountCents !== undefined
      ? { promisedAmountCents: input.promisedAmountCents }
      : {}),
    currency: readString(promise.currency) ?? input.account.currency,
    status: normalizePromiseStatus(status),
    ...(notes ? { notes } : {})
  };
}

function resolvePaymentPlanRequest(
  structuredOutcome: Record<string, unknown>,
  customAnalysis: Record<string, unknown>,
  invoiceIds: string[]
) {
  const source = readRecord(
    structuredOutcome.paymentPlanRequest ??
      structuredOutcome.payment_plan_request ??
      customAnalysis.payment_plan_request
  );
  const summary =
    readString(source.summary) ??
    readString(customAnalysis.payment_plan_summary);
  if (!summary) {
    return undefined;
  }
  const requestedInstallmentCount = readNumber(source.requestedInstallmentCount);
  const requestedAmountCents = readNumber(source.requestedAmountCents);
  const currency = readString(source.currency);
  const requestedCadence = normalizeCadence(
    readString(source.requestedCadence) ?? readString(source.requested_cadence)
  );
  const requestedFirstPaymentDate =
    readString(source.requestedFirstPaymentDate) ??
    readString(source.requested_first_payment_date);
  const notes = readString(source.notes);

  return {
    invoiceIds: readStringArray(source.invoiceIds ?? source.invoice_ids, invoiceIds),
    ...(requestedInstallmentCount !== undefined ? { requestedInstallmentCount } : {}),
    ...(requestedAmountCents !== undefined ? { requestedAmountCents } : {}),
    ...(currency ? { currency } : {}),
    ...(requestedCadence ? { requestedCadence } : {}),
    ...(requestedFirstPaymentDate ? { requestedFirstPaymentDate } : {}),
    summary,
    ...(notes ? { notes } : {})
  };
}

function resolveNonCommitment(
  structuredOutcome: Record<string, unknown>,
  customAnalysis: Record<string, unknown>,
  invoiceIds: string[]
) {
  const source = readRecord(
    structuredOutcome.nonCommitment ??
      structuredOutcome.non_commitment ??
      customAnalysis.non_commitment
  );
  const reason = readString(source.reason) ?? readString(customAnalysis.non_commitment_reason);
  const callbackRequested =
    readBoolean(source.callbackRequested) ?? readBoolean(source.callback_requested);
  if (!reason && callbackRequested === undefined) {
    return undefined;
  }
  const notes = readString(source.notes);

  return {
    invoiceIds: readStringArray(source.invoiceIds ?? source.invoice_ids, invoiceIds),
    ...(reason ? { reason } : {}),
    ...(callbackRequested !== undefined ? { callbackRequested } : {}),
    ...(notes ? { notes } : {})
  };
}

function resolveDisputeCapture(
  structuredOutcome: Record<string, unknown>,
  customAnalysis: Record<string, unknown>,
  invoiceIds: string[]
) {
  const source = readRecord(
    structuredOutcome.dispute ?? customAnalysis.dispute ?? customAnalysis.dispute_capture
  );
  const summary = readString(source.summary) ?? readString(customAnalysis.dispute_summary);
  if (!summary) {
    return undefined;
  }
  const amountCents = readNumber(source.amountCents) ?? readNumber(source.amount_cents);
  const currency = readString(source.currency);

  return {
    invoiceIds: readStringArray(source.invoiceIds ?? source.invoice_ids, invoiceIds),
    disputeType: normalizeDisputeType(
      readString(source.disputeType) ?? readString(source.dispute_type)
    ),
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(currency ? { currency } : {}),
    summary
  };
}

function resolveCallbackRequest(
  structuredOutcome: Record<string, unknown>,
  customAnalysis: Record<string, unknown>
) {
  const source = readRecord(
    structuredOutcome.callback ?? customAnalysis.callback ?? customAnalysis.callback_request
  );
  const dueAt =
    readString(source.dueAt) ??
    readString(source.due_at) ??
    readString(customAnalysis.callback_due_at);
  const requestedAt =
    readString(source.requestedAt) ??
    readString(source.requested_at);
  const notes = readString(source.notes) ?? readString(customAnalysis.callback_notes);
  const timezone = readString(source.timezone);
  if (!dueAt && !requestedAt && !notes) {
    return undefined;
  }

  return {
    ...(requestedAt ? { requestedAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(timezone ? { timezone } : {}),
    ...(notes ? { notes } : {})
  };
}

function resolveFollowUpActions(
  structuredOutcome: Record<string, unknown>,
  customAnalysis: Record<string, unknown>,
  occurredAt: string
) {
  const raw = structuredOutcome.followUpActions ?? structuredOutcome.follow_up_actions;
  if (Array.isArray(raw)) {
    return raw
      .map(readRecord)
      .map((entry) => {
        const title = readString(entry.title);
        if (!title) {
          return undefined;
        }
        const description = readString(entry.description);
        const dueAt = readString(entry.dueAt) ?? readString(entry.due_at);
        const requiresHumanReview =
          readBoolean(entry.requiresHumanReview) ?? readBoolean(entry.requires_human_review);
        return {
          title,
          ...(description ? { description } : {}),
          ...(dueAt ? { dueAt } : {}),
          ...(requiresHumanReview !== undefined ? { requiresHumanReview } : {}),
          metadata: readRecord(entry.metadata)
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  const supportRequest = readString(customAnalysis.support_request);
  if (supportRequest) {
    return [
      {
        title: "Complete customer support request",
        description: supportRequest,
        dueAt: shiftIso(occurredAt, 2),
        requiresHumanReview: true,
        metadata: {
          source: "retell_custom_analysis",
          supportRequest
        }
      }
    ];
  }

  return [];
}

function createDatabaseRetellPostCallAutomationLoaders(): RetellPostCallAutomationLoaders {
  return {
    loadBillingAccount(accountId) {
      if (!isDatabaseReady() || !isUuid(accountId)) {
        return undefined;
      }
      const [row] = queryJsonRows<BillingAccountRow>(
        databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              id::text AS "id",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              parent_account_id::text AS "parentAccountId",
              branch_id::text AS "branchId",
              account_number AS "accountNumber",
              display_name AS "displayName",
              currency,
              account_tier AS "accountTier",
              erp_customer_id AS "erpCustomerId",
              status,
              centrally_paid AS "centrallyPaid",
              metadata
            FROM billing_account
            WHERE deleted_at IS NULL
              AND id = '${quoteSql(accountId)}'::uuid
            LIMIT 1
          ) q
        `
      );
      return row ? toBillingAccount(row) : undefined;
    },
    loadContact(contactId) {
      if (!isDatabaseReady() || !isUuid(contactId)) {
        return undefined;
      }
      const [row] = queryJsonRows<ContactRow>(
        databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              id::text AS "id",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              parent_account_id::text AS "parentAccountId",
              billing_account_id::text AS "billingAccountId",
              branch_id::text AS "branchId",
              invoice_id::text AS "invoiceId",
              scope,
              scope_id AS "scopeId",
              full_name AS "fullName",
              email,
              phone,
              role,
              is_primary AS "isPrimary",
              is_verified AS "isVerified",
              allow_auto_send AS "allowAutoSend",
              recent_successful_responses::integer AS "recentSuccessfulResponses",
              metadata
            FROM contact
            WHERE deleted_at IS NULL
              AND id = '${quoteSql(contactId)}'::uuid
            LIMIT 1
          ) q
        `
      );
      return row ? toContact(row) : undefined;
    },
    loadSafeBillingAccountContact(accountId) {
      if (!isDatabaseReady() || !isUuid(accountId)) {
        return undefined;
      }
      const rows = queryJsonRows<ContactRow>(
        databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              id::text AS "id",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              parent_account_id::text AS "parentAccountId",
              billing_account_id::text AS "billingAccountId",
              branch_id::text AS "branchId",
              invoice_id::text AS "invoiceId",
              scope,
              scope_id AS "scopeId",
              full_name AS "fullName",
              email,
              phone,
              role,
              is_primary AS "isPrimary",
              is_verified AS "isVerified",
              allow_auto_send AS "allowAutoSend",
              recent_successful_responses::integer AS "recentSuccessfulResponses",
              metadata
            FROM contact
            WHERE deleted_at IS NULL
              AND billing_account_id = '${quoteSql(accountId)}'::uuid
              AND email IS NOT NULL
            ORDER BY is_primary DESC, is_verified DESC, allow_auto_send DESC, recent_successful_responses DESC
            LIMIT 10
          ) q
        `
      );
      return chooseSafeBillingAccountContact(rows.map(toContact));
    },
    loadInvoices(input) {
      if (!isDatabaseReady() || !isUuid(input.billingAccountId)) {
        return [];
      }
      const invoiceFilter = input.invoiceIds?.length
        ? `AND id IN (${input.invoiceIds
            .filter(isUuid)
            .map((invoiceId) => `'${quoteSql(invoiceId)}'::uuid`)
            .join(", ")})`
        : "";
      const rows = queryJsonRows<InvoiceRow>(
        databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              id::text AS "id",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              state,
              seller_entity_id AS "sellerEntityId",
              parent_account_id::text AS "parentAccountId",
              billing_account_id::text AS "billingAccountId",
              branch_id::text AS "branchId",
              invoice_contact_id::text AS "invoiceContactId",
              uploaded_document_id::text AS "uploadedDocumentId",
              invoice_date AS "invoiceDate",
              invoice_number AS "invoiceNumber",
              currency,
              amount_cents::integer AS "amountCents",
              collectible_amount_cents::integer AS "collectibleAmountCents",
              disputed_amount_cents::integer AS "disputedAmountCents",
              due_date AS "dueDate",
              metadata
            FROM invoice
            WHERE deleted_at IS NULL
              AND billing_account_id = '${quoteSql(input.billingAccountId)}'::uuid
              ${invoiceFilter}
              AND state NOT IN ('paid', 'voided')
            ORDER BY due_date NULLS LAST, invoice_number
          ) q
        `
      );
      return rows.map(toInvoice);
    }
  };
}

function isPostCallAutomationFlagged(call: RetellCallRecord): boolean {
  const metadata = readRecord(call.metadata);
  const dynamicVariables = readRecord(call.retell_llm_dynamic_variables);
  const automation =
    readString(metadata.post_call_automation) ??
    readString(metadata.postCallAutomation) ??
    readString(dynamicVariables.post_call_automation) ??
    readString(dynamicVariables.postCallAutomation);
  if (automation === postCallAutomationKind) {
    return true;
  }

  return (
    readBoolean(metadata.post_call_send_soa) === true ||
    readBoolean(metadata.postCallSendSoa) === true ||
    readBoolean(dynamicVariables.post_call_send_soa) === true ||
    readBoolean(dynamicVariables.postCallSendSoa) === true ||
    readBoolean(metadata.post_call_email_recap) === true ||
    readBoolean(metadata.postCallEmailRecap) === true ||
    readBoolean(dynamicVariables.post_call_email_recap) === true ||
    readBoolean(dynamicVariables.postCallEmailRecap) === true
  );
}

function isRetellTerminalCallEvent(event: string, call: RetellCallRecord): boolean {
  const normalizedEvent = event.toLowerCase();
  const status = readString(call.call_status)?.toLowerCase();
  if (normalizedEvent.includes("started") || status === "ongoing") {
    return false;
  }
  return (
    normalizedEvent.includes("analyzed") ||
    normalizedEvent.includes("ended") ||
    normalizedEvent.includes("completed") ||
    status === "ended" ||
    status === "completed" ||
    Boolean(call.end_timestamp || call.end_time)
  );
}

function hasUsefulCallAnalysis(call: RetellCallRecord): boolean {
  const callAnalysis = readRecord(call.call_analysis);
  return Boolean(readString(callAnalysis.call_summary) || readString(call.transcript_summary));
}

function shouldSendStatementForDisposition(disposition: string): boolean {
  return !["missed", "voicemail_left", "wrong_contact"].includes(disposition);
}

function toSoaEmailAuditAction(deliveryState: OutboundEmailSendResult["deliveryState"]) {
  if (deliveryState === "sent") {
    return "retell.post_call_automation.soa_email_sent";
  }
  if (deliveryState === "approval_needed") {
    return "retell.post_call_automation.soa_email_approval_needed";
  }
  return "retell.post_call_automation.soa_email_blocked";
}

function invoiceIdsFromReferences(invoiceRefs: CallInboxInvoiceReference[]): string[] {
  return uniqueStrings(invoiceRefs.map((invoiceRef) => invoiceRef.invoiceId ?? ""));
}

function buildTranscriptSummary(segments: CallInboxTranscriptSegment[]): string | undefined {
  const customerLines = segments
    .filter((segment) => segment.speaker === "customer")
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .slice(0, 3);
  const joined = customerLines.join(" ");
  return normalizeCustomerFacingCallSummary(joined);
}

function normalizeCustomerFacingCallSummary(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || /^\{\{.+\}\}$/.test(normalized)) {
    return undefined;
  }

  return normalized.length > 700 ? `${normalized.slice(0, 697).trimEnd()}...` : normalized;
}

function normalizeSentiment(value: string | undefined) {
  return value === "positive" || value === "neutral" || value === "negative"
    ? value
    : undefined;
}

function normalizePromiseStatus(
  value: string | undefined
): "new" | "updated" | "kept" | "broken" | "cancelled" {
  if (
    value === "new" ||
    value === "updated" ||
    value === "kept" ||
    value === "broken" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "new" as const;
}

function normalizeCadence(
  value: string | undefined
): "weekly" | "biweekly" | "monthly" | "custom" | undefined {
  if (value === "weekly" || value === "biweekly" || value === "monthly" || value === "custom") {
    return value;
  }
  return undefined;
}

function normalizeDisputeType(
  value: string | undefined
): "billing" | "service" | "delivery" | "unknown" {
  if (value === "billing" || value === "service" || value === "delivery" || value === "unknown") {
    return value;
  }
  return "unknown" as const;
}

function automationKey(tenantId: string, providerCallId: string | undefined) {
  return `${tenantId}:retell:${providerCallId ?? "unknown"}:post_call_automation`;
}

function shiftIso(iso: string, days: number) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function isDatabaseReady() {
  return databaseUrl.trim().length > 0 && isDatabaseAvailable(databaseUrl);
}

function chooseSafeBillingAccountContact(contacts: Contact[]): Contact | undefined {
  const eligibleContacts = contacts.filter(
    (contact) => Boolean(contact.email) && contact.isVerified && contact.allowAutoSend
  );
  const primaryContacts = eligibleContacts.filter((contact) => contact.isPrimary);
  if (primaryContacts.length === 1) {
    return primaryContacts[0];
  }
  if (eligibleContacts.length === 1) {
    return eligibleContacts[0];
  }
  return undefined;
}

async function listActivityEntries(
  store: ImmutableActivityLogStore,
  filter: {
    entityType: string;
    entityId: string;
    actions: string[];
  }
): Promise<ImmutableActivityLogEntry[]> {
  const listed = await store.list?.(filter);
  if (listed) {
    return listed;
  }

  const entries = (store as { entries?: ImmutableActivityLogEntry[] }).entries ?? [];
  return entries.filter((entry) => {
    if (entry.entityType !== filter.entityType) {
      return false;
    }
    if (entry.entityId !== filter.entityId) {
      return false;
    }
    return filter.actions.includes(entry.action);
  });
}

type BillingAccountRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  branchId?: string;
  accountNumber: string;
  displayName: string;
  currency: string;
  accountTier: "standard" | "strategic";
  erpCustomerId?: string;
  status: "active" | "inactive";
  centrallyPaid: boolean;
  metadata: Record<string, unknown>;
};

type ContactRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
  invoiceId?: string;
  scope: "parent_account" | "billing_account" | "branch" | "invoice";
  scopeId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role:
    | "customer"
    | "collector"
    | "approver"
    | "internal"
    | "ap"
    | "shared_finance"
    | "treasury"
    | "branch"
    | "invoice";
  isPrimary: boolean;
  isVerified: boolean;
  allowAutoSend: boolean;
  recentSuccessfulResponses: number;
  metadata: Record<string, unknown>;
};

type InvoiceRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state:
    | "uploaded_unmatched"
    | "synced_open"
    | "matched_to_erp"
    | "partially_paid"
    | "paid"
    | "disputed_partial"
    | "disputed_full"
    | "credit_pending"
    | "writeback_pending"
    | "writeback_failed"
    | "voided";
  sellerEntityId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceContactId?: string;
  uploadedDocumentId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  collectibleAmountCents?: number;
  disputedAmountCents?: number;
  provisionalSource?: "bir_upload";
  dueDate?: string;
  metadata: Record<string, unknown>;
};

type PromiseToPayRow = {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  installmentLineIds?: string[];
  promisedAmountCents: number;
  currency: string;
  promiseDate: string;
  state: PromiseToPayState;
  metadata: Record<string, unknown>;
};

function toBillingAccount(input: BillingAccountRow): BillingAccount {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    parentAccountId: input.parentAccountId,
    accountNumber: input.accountNumber,
    displayName: input.displayName,
    currency: input.currency,
    accountTier: input.accountTier,
    status: input.status,
    centrallyPaid: input.centrallyPaid,
    metadata: input.metadata,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.erpCustomerId ? { erpCustomerId: input.erpCustomerId } : {})
  };
}

function toContact(input: ContactRow): Contact {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    parentAccountId: input.parentAccountId,
    scope: input.scope,
    scopeId: input.scopeId,
    fullName: input.fullName,
    role: input.role,
    isPrimary: input.isPrimary,
    isVerified: input.isVerified,
    allowAutoSend: input.allowAutoSend,
    recentSuccessfulResponses: input.recentSuccessfulResponses,
    metadata: input.metadata,
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {})
  };
}

function toInvoice(input: InvoiceRow): CustomerInvoice {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    state: input.state,
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    invoiceNumber: input.invoiceNumber,
    currency: input.currency,
    amountCents: input.amountCents,
    metadata: input.metadata,
    ...(input.sellerEntityId ? { sellerEntityId: input.sellerEntityId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.invoiceContactId ? { invoiceContactId: input.invoiceContactId } : {}),
    ...(input.uploadedDocumentId ? { uploadedDocumentId: input.uploadedDocumentId } : {}),
    ...(input.invoiceDate ? { invoiceDate: input.invoiceDate } : {}),
    ...(input.collectibleAmountCents !== undefined
      ? { collectibleAmountCents: input.collectibleAmountCents }
      : {}),
    ...(input.disputedAmountCents !== undefined
      ? { disputedAmountCents: input.disputedAmountCents }
      : {}),
    ...(input.provisionalSource ? { provisionalSource: input.provisionalSource } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {})
  };
}

function toPromiseToPay(input: PromiseToPayRow): PromiseToPay {
  return {
    id: input.id,
    tenantId: input.tenantId,
    version: input.version,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    ...(input.createdByActorId ? { createdByActorId: input.createdByActorId } : {}),
    ...(input.createdByActorRole
      ? { createdByActorRole: input.createdByActorRole as NonNullable<PromiseToPay["createdByActorRole"]> }
      : {}),
    ...(input.updatedByActorId ? { updatedByActorId: input.updatedByActorId } : {}),
    ...(input.updatedByActorRole
      ? { updatedByActorRole: input.updatedByActorRole as NonNullable<PromiseToPay["updatedByActorRole"]> }
      : {}),
    parentAccountId: input.parentAccountId,
    billingAccountId: input.billingAccountId,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.installmentLineIds ? { installmentLineIds: input.installmentLineIds } : {}),
    promisedAmountCents: input.promisedAmountCents,
    currency: input.currency,
    promiseDate: input.promiseDate,
    state: input.state,
    metadata: input.metadata
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.filter((entry): entry is string => typeof entry === "string")
    );
  }
  if (typeof value === "string") {
    return uniqueStrings(value.split(","));
  }
  return fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function quoteSql(value: string): string {
  return value.replace(/'/g, "''");
}

function sqlNullableText(value: string | undefined): string {
  return value ? `'${quoteSql(value)}'` : "NULL";
}

function sqlTextArray(values: string[]): string {
  const quoted = values.map((value) => `'${quoteSql(value)}'`).join(", ");
  return `ARRAY[${quoted}]::text[]`;
}

function jsonSql(value: unknown): string {
  return quoteSql(JSON.stringify(value));
}

function promiseToPaySelectSql(): string {
  return `
    SELECT
      id::text AS "id",
      tenant_id AS "tenantId",
      version::integer AS "version",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      deleted_at AS "deletedAt",
      created_by_actor_id AS "createdByActorId",
      created_by_actor_role AS "createdByActorRole",
      updated_by_actor_id AS "updatedByActorId",
      updated_by_actor_role AS "updatedByActorRole",
      parent_account_id::text AS "parentAccountId",
      billing_account_id::text AS "billingAccountId",
      contact_id::text AS "contactId",
      installment_line_ids AS "installmentLineIds",
      promised_amount_cents::integer AS "promisedAmountCents",
      currency,
      promise_date AS "promiseDate",
      state,
      metadata
    FROM promise_to_pay
  `;
}

function serializeJson<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
