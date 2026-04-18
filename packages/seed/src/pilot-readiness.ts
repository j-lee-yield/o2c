import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  buildPilotReadinessMetrics,
  CashApplicationWorkflowEngine,
  pilotMetricDefinitions,
  type CashApplicationEvaluationResult,
  type PilotMetricDefinition,
  type PilotReadinessMetrics,
} from "@o2c/workflows";

import {
  buildPilotDemoCatalog,
  type PilotDemoScenario,
  type PilotIndustry,
  type PilotSamplePayload,
  type PilotSeedScript,
  type PilotWalkthroughStep,
} from "./pilot-demo.js";

export interface PilotReadinessScenarioView {
  id: string;
  title: string;
  operatorLane: PilotDemoScenario["operatorLane"];
  industry: PilotIndustry;
  focus: string;
  tags: PilotDemoScenario["tags"];
  route: CashApplicationEvaluationResult["route"];
  summary: string;
  paymentId: string;
  paymentAmountCents: number;
  appliedAmountCents: number;
  unappliedAmountCents: number;
  allocationCount: number;
  invoiceNumbers: string[];
  promiseOutcome?: "kept" | "broken";
  proofDocumentIds: string[];
  approvalStatus?: string;
  exceptionKind?: string;
  activityCount: number;
}

export interface PilotQueueSummary {
  approvals: number;
  exceptions: number;
  autoApplied: number;
}

export interface PilotInstrumentationSummary {
  scenarioIds: string[];
  computedMetricKeys: PilotMetricDefinition["key"][];
}

export interface PilotReadinessSnapshot {
  generatedAt: string;
  metrics: PilotReadinessMetrics;
  metricDefinitions: PilotMetricDefinition[];
  scenarios: PilotReadinessScenarioView[];
  queueSummary: PilotQueueSummary;
  samplePayloads: PilotSamplePayload[];
  seedScripts: PilotSeedScript[];
  walkthrough: PilotWalkthroughStep[];
  instrumentation: PilotInstrumentationSummary;
  remainingGaps: string[];
}

const evaluationPrincipal: Principal = {
  id: "pilot_bot",
  roles: ["ar_manager"],
};

const now = "2026-03-26T00:00:00.000Z";

export function buildPilotReadinessSnapshot(): PilotReadinessSnapshot {
  const catalog = buildPilotDemoCatalog();
  const instrumentedScenarioIds: string[] = [];
  const evaluations = catalog.scenarios.map((scenario) => {
    const activityStore = new InMemoryImmutableActivityLogStore();
    const engine = new CashApplicationWorkflowEngine({
      activityStore,
      now: () => now,
      idGenerator: createScenarioIdGenerator(scenario.id),
    });

    const result = engine.evaluate({
      principal: evaluationPrincipal,
      auditContext: {
        actorId: "pilot-automation",
        actorType: "automation",
        correlationId: `pilot-${scenario.id}`,
        occurredAt: now,
      },
      account: scenario.evaluation.account,
      payment: scenario.evaluation.payment,
      allocations: scenario.evaluation.allocations,
      payerIdentified: scenario.evaluation.payerIdentified,
      matchConfidence: scenario.evaluation.matchConfidence,
      noRegretAutoApply: scenario.evaluation.noRegretAutoApply,
      manualOverrideErpWritebackConflict: scenario.evaluation.manualOverrideErpWritebackConflict,
    });

    instrumentedScenarioIds.push(scenario.id);
    return { scenario, result };
  });

  const metrics = buildPilotReadinessMetrics({
    asOf: now,
    scenarios: evaluations.map(({ scenario, result }) => ({
      scenarioId: scenario.id,
      route: result.route,
      account: scenario.evaluation.account,
      payment: scenario.evaluation.payment,
      invoices: scenario.evaluation.allocations.map((allocation) => allocation.invoice),
      allocations: result.allocations,
      appliedAmountCents: result.appliedAmountCents,
      unappliedAmountCents: result.unappliedAmountCents,
      ...scenario.metricAssumptions,
    })),
  });

  return {
    generatedAt: now,
    metrics,
    metricDefinitions: pilotMetricDefinitions,
    scenarios: evaluations.map(({ scenario, result }) =>
      buildScenarioView({
        scenario,
        result,
      })
    ),
    queueSummary: {
      approvals: evaluations.filter(({ result }) => result.route === "approval_required").length,
      exceptions: evaluations.filter(({ result }) => result.route === "review_required").length,
      autoApplied: evaluations.filter(({ result }) => result.route === "auto_apply").length,
    },
    samplePayloads: catalog.samplePayloads,
    seedScripts: catalog.seedScripts,
    walkthrough: catalog.walkthrough,
    instrumentation: {
      scenarioIds: instrumentedScenarioIds,
      computedMetricKeys: pilotMetricDefinitions.map(
        (definition: PilotMetricDefinition) => definition.key
      ),
    },
    remainingGaps: [
      "The fallback snapshot is still static when the live pilot runtime API is unavailable.",
      "Pilot runtime persistence remains process-local until a shared database-backed adapter is added.",
    ],
  };
}

function buildScenarioView(params: {
  scenario: PilotDemoScenario;
  result: CashApplicationEvaluationResult;
}): PilotReadinessScenarioView {
  const { scenario, result } = params;

  return {
    id: scenario.id,
    title: scenario.title,
    operatorLane: scenario.operatorLane,
    industry: scenario.industry,
    focus: scenario.focus,
    tags: scenario.tags,
    route: result.route,
    summary: result.summary,
    paymentId: scenario.evaluation.payment.id,
    paymentAmountCents: scenario.evaluation.payment.amountCents,
    appliedAmountCents: result.appliedAmountCents,
    unappliedAmountCents: result.unappliedAmountCents,
    allocationCount: result.allocations.length,
    invoiceNumbers: scenario.evaluation.allocations.map((allocation) => allocation.invoice.invoiceNumber),
    ...(scenario.promiseStory ? { promiseOutcome: scenario.promiseStory.outcome } : {}),
    proofDocumentIds: scenario.uploadedDocuments.map((document) => document.id),
    ...(result.approvalRequest ? { approvalStatus: result.approvalRequest.status } : {}),
    ...(result.exception ? { exceptionKind: result.exception.kind } : {}),
    activityCount: result.activityEntries.length,
  };
}

function createScenarioIdGenerator(scenarioId: string) {
  let count = 0;
  return (prefix: string) => {
    count += 1;
    return `${prefix}_${scenarioId}_${count}`;
  };
}
