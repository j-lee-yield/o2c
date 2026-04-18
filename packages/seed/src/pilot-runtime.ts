import { InMemoryAuditLogger, InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { IntegrationSyncJob, IntegrationSyncLog, WritebackStage } from "@o2c/contracts";
import {
  CashApplicationWorkflowEngine,
  type CashApplicationWritebackStage,
  InMemoryIdempotencyStore,
  InMemoryIntegrationJobStore,
  InMemoryIntegrationLogStore,
  InMemoryIntegrationWritebackStageStore,
  buildPilotReadinessMetrics,
  createIntegrationSyncOrchestrator,
  createMockIntegrationConnector,
  pilotMetricDefinitions,
} from "@o2c/workflows";
import { buildPilotDemoCatalog, type PilotDemoScenario } from "./pilot-demo.js";
import type {
  PilotInstrumentationSummary,
  PilotQueueSummary,
  PilotReadinessScenarioView,
  PilotReadinessSnapshot,
} from "./pilot-readiness.js";

export interface PilotRuntimeEvent {
  id: string;
  at: string;
  scenarioId: string;
  action:
    | "approval_approved"
    | "approval_rejected"
    | "proof_attached"
    | "exception_resolved"
    | "promise_marked_kept"
    | "promise_marked_broken"
    | "writeback_staged"
    | "writeback_pushed";
  actor: string;
  summary: string;
  outcome: string;
}

export interface PilotScenarioAction {
  key:
    | "approve"
    | "reject"
    | "attach_proof"
    | "resolve_exception"
    | "mark_promise_kept"
    | "mark_promise_broken"
    | "push_writeback";
  label: string;
  path: string;
}

export interface PilotRuntimeSnapshot extends PilotReadinessSnapshot {
  runtimeEvents: PilotRuntimeEvent[];
  integration: {
    jobs: IntegrationSyncJob[];
    logs: IntegrationSyncLog[];
    stages: WritebackStage[];
  };
  scenarios: Array<
    PilotReadinessScenarioView & {
      writebackStatus?: CashApplicationWritebackStage["status"] | WritebackStage["status"];
      availableActions: PilotScenarioAction[];
    }
  >;
}

interface RuntimeScenarioState {
  scenario: PilotDemoScenario;
  result: ReturnType<CashApplicationWorkflowEngine["evaluate"]>;
  approvalStatus?: "pending_approval" | "approved" | "rejected";
  exceptionResolved: boolean;
  promiseOutcome?: "kept" | "broken";
  writebackStage?: WritebackStage;
}

const now = "2026-03-26T00:00:00.000Z";

export class PilotReadinessRuntime {
  private readonly scenarioStates = new Map<string, RuntimeScenarioState>();
  private readonly catalog = buildPilotDemoCatalog();
  private readonly events: PilotRuntimeEvent[] = [];
  private readonly auditLogger = new InMemoryAuditLogger();
  private readonly integrationJobStore = new InMemoryIntegrationJobStore();
  private readonly integrationLogStore = new InMemoryIntegrationLogStore();
  private readonly integrationStageStore = new InMemoryIntegrationWritebackStageStore();
  private readonly integrationIdempotencyStore = new InMemoryIdempotencyStore();
  private readonly orchestrator = createIntegrationSyncOrchestrator(
    [createMockIntegrationConnector({ provider: "netsuite" })],
    {
      auditLogger: this.auditLogger,
      jobStore: this.integrationJobStore,
      logStore: this.integrationLogStore,
      stageStore: this.integrationStageStore,
      idempotencyStore: this.integrationIdempotencyStore,
      now: () => now,
      idGenerator: createCounterIdGenerator("pilot"),
    }
  );

  constructor() {
    for (const scenario of this.catalog.scenarios) {
      const engine = new CashApplicationWorkflowEngine({
        activityStore: new InMemoryImmutableActivityLogStore(),
        now: () => now,
        idGenerator: createCounterIdGenerator(scenario.id),
      });
      const result = engine.process({
        principal: { id: "pilot_bot", roles: ["ar_manager"] },
        auditContext: {
          actorId: "pilot-automation",
          actorType: "automation",
          correlationId: `pilot-${scenario.id}`,
          occurredAt: now,
        },
        account: scenario.evaluation.account,
        payment: scenario.evaluation.payment,
        invoices: scenario.evaluation.allocations.map((allocation) => allocation.invoice),
        paymentsLedger: [],
        bankTransactions: [],
        remittanceEmails: [],
        uploadedProofsOfPayment: [],
        erpPaymentRecords: [
          {
            id: `erp-${scenario.id}`,
            paymentReference: scenario.evaluation.payment.paymentReference,
            settled: true,
            confirmed: true,
            writebackPathAvailable: true,
            referencedInvoiceNumbers: scenario.evaluation.allocations.map(
              (allocation) => allocation.invoice.invoiceNumber
            ),
            metadata: {},
          },
        ],
        settlementWebhooks: [],
      });

      this.scenarioStates.set(scenario.id, {
        scenario,
        result,
        approvalStatus: result.approvalRequest?.status as RuntimeScenarioState["approvalStatus"],
        exceptionResolved: false,
        ...(scenario.promiseStory ? { promiseOutcome: scenario.promiseStory.outcome } : {}),
      });
    }
  }

  getSnapshot(): PilotRuntimeSnapshot {
    const states = [...this.scenarioStates.values()];
    return {
      generatedAt: now,
      metrics: buildPilotReadinessMetrics({
        asOf: now,
        scenarios: states.map((state) => this.toMetricScenario(state)),
      }),
      metricDefinitions: pilotMetricDefinitions,
      scenarios: states.map((state) => this.toScenarioView(state)),
      queueSummary: buildQueueSummary(states),
      samplePayloads: this.catalog.samplePayloads,
      seedScripts: this.catalog.seedScripts,
      walkthrough: this.catalog.walkthrough,
      instrumentation: buildInstrumentation(states),
      remainingGaps: [
        "Runtime state is process-local in memory; multi-process persistence and historical warehouse sync are still deferred.",
      ],
      runtimeEvents: [...this.events],
      integration: {
        jobs: [...this.integrationJobStore.jobs.values()],
        logs: [...this.integrationLogStore.logs],
        stages: [...this.integrationStageStore.stages.values()],
      },
    };
  }

  async approveScenario(scenarioId: string, actor = "controller_api") {
    const state = this.requireScenario(scenarioId);
    if (state.approvalStatus === "pending_approval") {
      state.approvalStatus = "approved";
      state.result = {
        ...state.result,
        route: "auto_apply",
        decision: "auto_apply",
        summary: "Controller approved the cash application and released ERP writeback staging.",
        ...(state.result.approvalRequest
          ? {
              approvalRequest: {
                ...state.result.approvalRequest,
                status: "approved",
              },
            }
          : {}),
      };
      await this.stageScenarioWriteback(scenarioId, actor);
      this.appendEvent({
        scenarioId,
        action: "approval_approved",
        actor,
        summary: `Approved ${state.scenario.title}.`,
        outcome: "Scenario moved from approval hold into staged writeback.",
      });
    }
    return this.getSnapshot();
  }

  rejectScenario(scenarioId: string, actor = "controller_api") {
    const state = this.requireScenario(scenarioId);
    if (state.approvalStatus === "pending_approval") {
      state.approvalStatus = "rejected";
      state.result = {
        ...state.result,
        route: "review_required",
        decision: "review_suggestion",
        summary: "Approval was rejected and the scenario remains in controlled review.",
        ...(state.result.approvalRequest
          ? {
              approvalRequest: {
                ...state.result.approvalRequest,
                status: "rejected",
              },
            }
          : {}),
      };
      this.appendEvent({
        scenarioId,
        action: "approval_rejected",
        actor,
        summary: `Rejected ${state.scenario.title}.`,
        outcome: "Scenario remains queued for manual review.",
      });
    }
    return this.getSnapshot();
  }

  async attachProofAndApply(scenarioId: string, actor = "ar_manager_api") {
    const state = this.requireScenario(scenarioId);
    state.exceptionResolved = true;
    const { exception: _exception, ...resultBase } = state.result;
    state.result = {
      ...resultBase,
      route: "auto_apply",
      decision: "auto_apply",
      summary: "Proof of payment was attached, the exception was resolved, and cash was applied conservatively.",
    };
    await this.stageScenarioWriteback(scenarioId, actor);
    this.appendEvent({
      scenarioId,
      action: "proof_attached",
      actor,
      summary: `Attached proof and applied ${state.scenario.title}.`,
      outcome: "Exception cleared and writeback staged.",
    });
    return this.getSnapshot();
  }

  resolveException(scenarioId: string, actor = "ar_manager_api") {
    const state = this.requireScenario(scenarioId);
    state.exceptionResolved = true;
    this.appendEvent({
      scenarioId,
      action: "exception_resolved",
      actor,
      summary: `Resolved exception on ${state.scenario.title}.`,
      outcome: "Scenario notes updated for operator follow-through.",
    });
    return this.getSnapshot();
  }

  recordPromiseOutcome(scenarioId: string, outcome: "kept" | "broken", actor = "collector_api") {
    const state = this.requireScenario(scenarioId);
    state.promiseOutcome = outcome;
    this.appendEvent({
      scenarioId,
      action: outcome === "kept" ? "promise_marked_kept" : "promise_marked_broken",
      actor,
      summary: `Marked promise as ${outcome} for ${state.scenario.title}.`,
      outcome:
        outcome === "kept"
          ? "Promise-to-pay KPI improved for the scenario."
          : "Scenario remains in manual follow-up and dispute-safe handling.",
    });
    return this.getSnapshot();
  }

  async pushWriteback(scenarioId: string, actor = "worker") {
    const state = this.requireScenario(scenarioId);
    const stage = state.writebackStage ?? (await this.stageScenarioWriteback(scenarioId, actor));
    if (stage.status === "pushed") {
      return this.getSnapshot();
    }

    const job = await this.orchestrator.createSyncJob({
      tenantId: "pilot-demo",
      connectionId: "netsuite-demo",
      provider: "netsuite",
      direction: "push",
      object: "applied_cash",
      requestedBy: "automation",
    });

    await this.orchestrator.executePushJob({
      job,
      connection: {
        connectionId: "netsuite-demo",
        tenantId: "pilot-demo",
        provider: "netsuite",
        credentialReference: "pilot/mock",
      },
      stage,
      auditContext: {
        actorId: actor,
        actorType: "automation",
        correlationId: `writeback-${scenarioId}`,
        occurredAt: now,
      },
    });

    state.writebackStage = [...this.integrationStageStore.stages.values()].find(
      (candidate) => candidate.stageId === stage.stageId
    );
    this.appendEvent({
      scenarioId,
      action: "writeback_pushed",
      actor,
      summary: `Pushed ERP writeback for ${state.scenario.title}.`,
      outcome: "Applied cash was pushed through the mock NetSuite connector.",
    });
    return this.getSnapshot();
  }

  async processPendingWritebacks(actor = "worker") {
    const pending = [...this.scenarioStates.values()]
      .filter((state) => state.writebackStage?.status === "staged")
      .map((state) => state.scenario.id);
    const lazilyStaged = [...this.scenarioStates.values()]
      .filter(
        (state) =>
          !state.writebackStage && state.result.writebackStage?.status === "staged"
      )
      .map((state) => state.scenario.id);

    const scenarioIds = [...new Set([...pending, ...lazilyStaged])];

    for (const scenarioId of scenarioIds) {
      await this.pushWriteback(scenarioId, actor);
    }

    return {
      pushedCount: scenarioIds.length,
      snapshot: this.getSnapshot(),
    };
  }

  private async stageScenarioWriteback(scenarioId: string, actor: string) {
    const state = this.requireScenario(scenarioId);
    if (state.writebackStage) {
      return state.writebackStage;
    }

    const stage = await this.orchestrator.stageWriteback({
      tenantId: "pilot-demo",
      connectionId: "netsuite-demo",
      provider: "netsuite",
      target: "applied_cash",
      sourceEntityId: state.scenario.evaluation.payment.id,
      payload: {
        billingAccountId: state.scenario.evaluation.account.id,
        paymentReference: state.scenario.evaluation.payment.paymentReference,
        totalAppliedAmountCents: allocationTotal(state.scenario),
        allocations: state.scenario.evaluation.allocations.map((allocation) => ({
          invoiceId: allocation.invoice.id,
          invoiceNumber: allocation.invoice.invoiceNumber,
          appliedAmountCents: allocation.amountCents,
          branchId: allocation.invoice.branchId,
        })),
      },
      auditContext: {
        actorId: actor,
        actorType: "automation",
        correlationId: `stage-${scenarioId}`,
        occurredAt: now,
      },
    });

    state.writebackStage = stage;
    this.appendEvent({
      scenarioId,
      action: "writeback_staged",
      actor,
      summary: `Staged ERP writeback for ${state.scenario.title}.`,
      outcome: "Writeback is ready for push execution.",
    });
    return stage;
  }

  private toScenarioView(
    state: RuntimeScenarioState
  ): PilotRuntimeSnapshot["scenarios"][number] {
    const base: PilotReadinessScenarioView = {
      id: state.scenario.id,
      title: state.scenario.title,
      operatorLane: state.scenario.operatorLane,
      industry: state.scenario.industry,
      focus: state.scenario.focus,
      tags: state.scenario.tags,
      route: state.result.route,
      summary: state.result.summary,
      paymentId: state.scenario.evaluation.payment.id,
      paymentAmountCents: state.scenario.evaluation.payment.amountCents,
      appliedAmountCents: state.result.route === "auto_apply" ? allocationTotal(state.scenario) : 0,
      unappliedAmountCents:
        state.result.route === "auto_apply"
          ? Math.max(0, state.scenario.evaluation.payment.amountCents - allocationTotal(state.scenario))
          : state.scenario.evaluation.payment.amountCents,
      allocationCount: state.scenario.evaluation.allocations.length,
      invoiceNumbers: state.scenario.evaluation.allocations.map((allocation) => allocation.invoice.invoiceNumber),
      ...(state.promiseOutcome ? { promiseOutcome: state.promiseOutcome } : {}),
      proofDocumentIds: state.scenario.uploadedDocuments.map((document) => document.id),
      ...(state.approvalStatus ? { approvalStatus: state.approvalStatus } : {}),
      ...(state.result.exception && !state.exceptionResolved
        ? { exceptionKind: state.result.exception.kind }
        : {}),
      activityCount:
        state.result.activityEntries.length +
        this.events.filter((event) => event.scenarioId === state.scenario.id).length,
    };

    return {
      ...base,
      ...(state.writebackStage
        ? { writebackStatus: state.writebackStage.status }
        : state.result.writebackStage
          ? { writebackStatus: state.result.writebackStage.status }
          : {}),
      availableActions: buildScenarioActions(state),
    };
  }

  private toMetricScenario(state: RuntimeScenarioState) {
    const assumptions = state.scenario.metricAssumptions;
    const autoApplied = state.result.route === "auto_apply";
    return {
      scenarioId: state.scenario.id,
      route: state.result.route,
      account: state.scenario.evaluation.account,
      payment: state.scenario.evaluation.payment,
      invoices: state.scenario.evaluation.allocations.map((allocation) => allocation.invoice),
      allocations: state.result.allocations,
      appliedAmountCents: autoApplied ? allocationTotal(state.scenario) : 0,
      unappliedAmountCents:
        autoApplied
          ? Math.max(0, state.scenario.evaluation.payment.amountCents - allocationTotal(state.scenario))
          : state.scenario.evaluation.payment.amountCents,
      overdueBalanceBeforeCents: assumptions.overdueBalanceBeforeCents,
      overdueBalanceAfterCents: autoApplied
        ? assumptions.overdueBalanceAfterCents
        : assumptions.overdueBalanceBeforeCents,
      inScopeCashCollectedCents: autoApplied ? allocationTotal(state.scenario) : 0,
      collectorMinutesBefore: assumptions.collectorMinutesBefore,
      collectorMinutesAfter: autoApplied
        ? assumptions.collectorMinutesAfter
        : assumptions.collectorMinutesBefore,
      touchCount: assumptions.touchCount,
      promiseCount: state.scenario.promiseStory ? 1 : 0,
      promisesKeptCount: state.promiseOutcome === "kept" ? 1 : 0,
      unmatchedCashAgingDaysBefore: assumptions.unmatchedCashAgingDaysBefore,
      unmatchedCashAgingDaysAfter: autoApplied
        ? assumptions.unmatchedCashAgingDaysAfter
        : assumptions.unmatchedCashAgingDaysBefore,
      disputeIdentificationHoursBefore: assumptions.disputeIdentificationHoursBefore,
      disputeIdentificationHoursAfter:
        autoApplied || state.exceptionResolved
          ? assumptions.disputeIdentificationHoursAfter
          : assumptions.disputeIdentificationHoursBefore,
    };
  }

  private appendEvent(input: Omit<PilotRuntimeEvent, "id" | "at">) {
    this.events.unshift({
      id: `event_${this.events.length + 1}`,
      at: now,
      ...input,
    });
  }

  private requireScenario(scenarioId: string) {
    const state = this.scenarioStates.get(scenarioId);
    if (!state) {
      throw new Error(`Pilot scenario "${scenarioId}" was not found.`);
    }
    return state;
  }
}

let sharedRuntime: PilotReadinessRuntime | undefined;

export function getPilotReadinessRuntime() {
  sharedRuntime ??= new PilotReadinessRuntime();
  return sharedRuntime;
}

function buildScenarioActions(state: RuntimeScenarioState): PilotScenarioAction[] {
  const actions: PilotScenarioAction[] = [];

  if (state.approvalStatus === "pending_approval") {
    actions.push({
      key: "approve",
      label: "Approve application",
      path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/approve`,
    });
    actions.push({
      key: "reject",
      label: "Reject application",
      path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/reject`,
    });
  }

  if (state.result.exception && !state.exceptionResolved) {
    if (state.scenario.tags.includes("proof_of_payment_upload")) {
      actions.push({
        key: "attach_proof",
        label: "Attach proof and apply",
        path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/attach-proof`,
      });
    } else {
      actions.push({
        key: "resolve_exception",
        label: "Resolve exception",
        path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/resolve`,
      });
    }
  }

  if (state.scenario.promiseStory) {
    actions.push({
      key: "mark_promise_kept",
      label: "Mark promise kept",
      path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/promise/kept`,
    });
    actions.push({
      key: "mark_promise_broken",
      label: "Mark promise broken",
      path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/promise/broken`,
    });
  }

  if (
    state.writebackStage?.status === "staged" ||
    (!state.writebackStage && state.result.writebackStage?.status === "staged")
  ) {
    actions.push({
      key: "push_writeback",
      label: "Push ERP writeback",
      path: `/v1/pilot-readiness/scenarios/${state.scenario.id}/push-writeback`,
    });
  }

  return actions;
}

function buildQueueSummary(states: RuntimeScenarioState[]): PilotQueueSummary {
  return {
    approvals: states.filter((state) => state.approvalStatus === "pending_approval").length,
    exceptions: states.filter((state) => state.result.exception && !state.exceptionResolved).length,
    autoApplied: states.filter((state) => state.result.route === "auto_apply").length,
  };
}

function buildInstrumentation(states: RuntimeScenarioState[]): PilotInstrumentationSummary {
  return {
    scenarioIds: states.map((state) => state.scenario.id),
    computedMetricKeys: pilotMetricDefinitions.map((definition) => definition.key),
  };
}

function allocationTotal(scenario: PilotDemoScenario) {
  return scenario.evaluation.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
}

function createCounterIdGenerator(prefix: string) {
  let count = 0;
  return (suffix: string) => {
    count += 1;
    return `${prefix}_${suffix}_${count}`;
  };
}
