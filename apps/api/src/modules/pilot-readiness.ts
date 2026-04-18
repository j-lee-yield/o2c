import { getPilotReadinessRuntime } from "@o2c/seed";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const registerPilotReadinessRoutes = (app: FastifyInstance): void => {
  const runtime = getPilotReadinessRuntime();
  const scenarioParams = z.object({ scenarioId: z.string().min(1) });
  const promiseParams = z.object({
    scenarioId: z.string().min(1),
    outcome: z.enum(["kept", "broken"]),
  });

  app.get("/v1/pilot-readiness", async () => runtime.getSnapshot());

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/approve", async (request) =>
    runtime.approveScenario(scenarioParams.parse(request.params).scenarioId)
  );

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/reject", async (request) =>
    runtime.rejectScenario(scenarioParams.parse(request.params).scenarioId)
  );

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/attach-proof", async (request) =>
    runtime.attachProofAndApply(scenarioParams.parse(request.params).scenarioId)
  );

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/resolve", async (request) =>
    runtime.resolveException(scenarioParams.parse(request.params).scenarioId)
  );

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/promise/:outcome", async (request) => {
    const params = promiseParams.parse(request.params);
    return runtime.recordPromiseOutcome(params.scenarioId, params.outcome);
  });

  app.post("/v1/pilot-readiness/scenarios/:scenarioId/push-writeback", async (request) =>
    runtime.pushWriteback(scenarioParams.parse(request.params).scenarioId)
  );

  app.post("/v1/pilot-readiness/runtime/process-writebacks", async () =>
    runtime.processPendingWritebacks()
  );
};
