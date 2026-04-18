import { afterAll, describe, expect, it } from "vitest";

import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("pilot readiness API", () => {
  it("returns the pilot-readiness snapshot with demo fixtures and KPI metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/pilot-readiness",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.metrics.evaluatedPayments).toBeGreaterThan(0);
    expect(payload.metrics.dsoImprovementDays).not.toBeNaN();
    expect(payload.metricDefinitions[0]?.key).toBe("dso_improvement_days");
    expect(payload.scenarios).toHaveLength(6);
    expect(payload.queueSummary.approvals).toBeGreaterThanOrEqual(1);
    expect(payload.samplePayloads).toHaveLength(6);
    expect(payload.walkthrough).toHaveLength(6);
    expect(payload.seedScripts).toHaveLength(3);
    expect(payload.instrumentation.computedMetricKeys).toContain("auto_applied_cash_percent");
    expect(payload.runtimeEvents).toBeDefined();
    expect(payload.integration.stages).toBeDefined();
  });

  it("allows approving a seeded scenario and pushing its ERP writeback", async () => {
    const approve = await app.inject({
      method: "POST",
      url: "/v1/pilot-readiness/scenarios/manufacturer-centralized-payer-approval/approve",
    });

    expect(approve.statusCode).toBe(200);
    const approved = approve.json();
    const scenario = approved.scenarios.find(
      (item: { id: string }) => item.id === "manufacturer-centralized-payer-approval"
    );
    expect(scenario.route).toBe("auto_apply");
    expect(scenario.approvalStatus).toBe("approved");

    const push = await app.inject({
      method: "POST",
      url: "/v1/pilot-readiness/scenarios/manufacturer-centralized-payer-approval/push-writeback",
    });

    expect(push.statusCode).toBe(200);
    const pushed = push.json();
    const pushedScenario = pushed.scenarios.find(
      (item: { id: string }) => item.id === "manufacturer-centralized-payer-approval"
    );
    expect(pushedScenario.writebackStatus).toBe("pushed");
    expect(pushed.runtimeEvents.some((event: { action: string }) => event.action === "writeback_pushed")).toBe(true);
  });

  it("lets operators attach proof and mark promise outcomes for seeded exception journeys", async () => {
    const proof = await app.inject({
      method: "POST",
      url: "/v1/pilot-readiness/scenarios/importer-proof-upload-unmatched-cash/attach-proof",
    });

    expect(proof.statusCode).toBe(200);
    const proofPayload = proof.json();
    const proofScenario = proofPayload.scenarios.find(
      (item: { id: string }) => item.id === "importer-proof-upload-unmatched-cash"
    );
    expect(proofScenario.route).toBe("auto_apply");
    expect(proofScenario.exceptionKind).toBeUndefined();

    const promise = await app.inject({
      method: "POST",
      url: "/v1/pilot-readiness/scenarios/importer-proof-upload-unmatched-cash/promise/kept",
    });

    expect(promise.statusCode).toBe(200);
    const promisePayload = promise.json();
    const promiseScenario = promisePayload.scenarios.find(
      (item: { id: string }) => item.id === "importer-proof-upload-unmatched-cash"
    );
    expect(promiseScenario.promiseOutcome).toBe("kept");
  });
});
