import { InMemoryAuditLogger } from "@o2c/audit";
import { buildDemoSeedBundle } from "@o2c/seed";
import { requestCollectionSend } from "@o2c/workflows";
import { runJobs } from "./jobs/run-jobs.js";

async function main(): Promise<void> {
  const seed = buildDemoSeedBundle();
  const auditLogger = new InMemoryAuditLogger();

  const result = await requestCollectionSend({
    invoice: seed.invoices[0]!,
    account: seed.billingAccounts[0]!,
    auditContext: {
      actorId: "automation-sprint-1",
      actorType: "automation",
      correlationId: "demo-run-1",
      occurredAt: new Date().toISOString(),
    },
    deps: { auditLogger },
  });

  console.log(
    JSON.stringify(
      {
        app: "worker",
        nextState: result,
        auditEventCount: auditLogger.events.length,
        todo: "TODO(sprint-2): add queue consumers, retry policies, and typed exception queue adapters.",
      },
      null,
      2,
    ),
  );

  await runJobs();
}

void main();
