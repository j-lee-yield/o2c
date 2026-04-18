import { randomUUID } from "node:crypto";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresApprovalRequestRepository,
  PostgresImmutableActivityLogStore,
  PostgresLearningLayerRuntimeStore,
} from "@o2c/database";
import {
  ApprovalQueueWorkflowService,
  InMemoryApprovalRequestRepository,
} from "@o2c/workflows";

let seeded = false;

const databaseUrl = createDatabaseClientConfig().connectionString;
const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
let approvalQueueService: ApprovalQueueWorkflowService | undefined;
let runtimeMode: "database" | "memory" | undefined;

export async function getApprovalQueueService() {
  if (!approvalQueueService) {
    if (databaseBacked) {
      const databaseService = buildDatabaseBackedApprovalQueueService();
      const schemaReady = await probeApprovalSchema(databaseService);
      if (schemaReady) {
        approvalQueueService = databaseService;
        runtimeMode = "database";
      } else {
        approvalQueueService = buildInMemoryApprovalQueueService();
        runtimeMode = "memory";
      }
    } else {
      approvalQueueService = buildInMemoryApprovalQueueService();
      runtimeMode = "memory";
    }
  }

  if (!seeded && runtimeMode === "memory" && approvalQueueService) {
    seeded = true;
    await seedApprovalQueue(approvalQueueService);
  }

  return approvalQueueService;
}

function buildDatabaseBackedApprovalQueueService() {
  const repository = new PostgresApprovalRequestRepository(databaseUrl);
  const activityStore = new PostgresImmutableActivityLogStore(databaseUrl);
  const learningRuntimeStore = new PostgresLearningLayerRuntimeStore(databaseUrl);

  return new ApprovalQueueWorkflowService({
    repository,
    activityStore,
    learningEventSink: (event) => learningRuntimeStore.persistLearningEvents([event]),
    now: () => new Date().toISOString(),
    idGenerator: () => randomUUID(),
  });
}

function buildInMemoryApprovalQueueService() {
  return new ApprovalQueueWorkflowService({
    repository: new InMemoryApprovalRequestRepository(),
    activityStore: new InMemoryImmutableActivityLogStore(),
    now: () => new Date().toISOString(),
    idGenerator: () => randomUUID(),
  });
}

async function probeApprovalSchema(service: ApprovalQueueWorkflowService) {
  try {
    await service.listQueue({ id: "bootstrap_probe", roles: ["controller"] });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('relation "approval_requests" does not exist') ||
        error.message.includes('relation "approval_request" does not exist') ||
        error.message.includes("column \"assignee_role\" does not exist") ||
        error.message.includes("column \"status\" does not exist"))
    ) {
      console.warn("Approvals schema is unavailable; falling back to in-memory approval queue.");
      return false;
    }
    throw error;
  }
}

async function seedApprovalQueue(service: ApprovalQueueWorkflowService) {
  const operator: Principal = { id: "juan_cruz", roles: ["ar_collector"] };

  await service.createAndSubmit(operator, {
    requestType: "strategic_outreach",
    assigneeRole: "controller",
    payload: {
      summary: "Send escalation email to CFO for 5 overdue invoices (₱3.2M total)",
    },
    policyContext: {
      reasonCodes: ["strategic_account", "high_exposure"],
    },
  });

  await service.createAndSubmit(operator, {
    requestType: "disputed_invoice_outreach",
    assigneeRole: "controller",
    payload: {
      summary: "Chase undisputed portion (₱189,000) while dispute under review",
    },
    policyContext: {
      reasonCodes: ["partial_dispute", "manual_release_required"],
    },
  });

  await service.createAndSubmit(operator, {
    requestType: "low_confidence_cash_application",
    assigneeRole: "controller",
    payload: {
      summary: "Apply ₱320,000 payment to INV-2024-0945",
    },
    policyContext: {
      reasonCodes: ["medium_confidence_match", "missing_remittance"],
    },
  });

  await service.createAndSubmit(operator, {
    requestType: "unverified_contact_outreach",
    assigneeRole: "ar_manager",
    payload: {
      summary: "Send reminder to unverified contact c.tan@robinsons.com.ph",
    },
    policyContext: {
      reasonCodes: ["contact_unverified"],
    },
  });
}
