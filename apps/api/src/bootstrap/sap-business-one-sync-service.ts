import { randomUUID } from "node:crypto";
import { loadEnv } from "@o2c/config";
import { createDatabaseClientConfig, isDatabaseAvailable } from "@o2c/database";
import {
  createImportedInvoiceSyncService,
  InMemoryCanonicalInvoicePersistenceStore,
} from "./imported-invoice-sync-service.js";
import {
  getSapBusinessOneConnectionService,
  type SapBusinessOneSyncRunRecord,
} from "./sap-business-one-connection-service.js";
import {
  loadSapBusinessOneCustomers,
  loadSapBusinessOneInvoices,
  loadSapBusinessOnePayments,
} from "../integrations/sap-business-one.js";

type SapBusinessOneSyncScope = Array<"invoices" | "customers" | "payments">;

type SapBusinessOneSchedulerStatus = {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  nextRunAt?: string;
  lastAttemptedAt?: string;
};

const inMemoryInvoiceStore = new InMemoryCanonicalInvoicePersistenceStore();

function createInvoiceSyncService() {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const store =
    databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)
      ? undefined
      : inMemoryInvoiceStore;

  return createImportedInvoiceSyncService(store ? { store } : undefined);
}

class SapBusinessOneSyncService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private nextRunAt: string | undefined;
  private lastAttemptedAt: string | undefined;

  start() {
    const env = loadEnv();
    const enabled =
      env.NODE_ENV !== "test" &&
      getBooleanWithDefault(env.INTEGRATION_SAP_BUSINESS_ONE_SYNC_ENABLED, true);
    const intervalMinutes = getPositiveIntegerWithDefault(
      env.INTEGRATION_SAP_BUSINESS_ONE_SYNC_INTERVAL_MINUTES,
      15,
    );

    if (!enabled || this.timer) {
      return;
    }

    const intervalMs = intervalMinutes * 60_000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    this.timer = setInterval(() => {
      void this.runScheduledSync();
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.nextRunAt = undefined;
    this.running = false;
  }

  getStatus(): SapBusinessOneSchedulerStatus {
    const env = loadEnv();
    return {
      enabled:
        env.NODE_ENV !== "test" &&
        getBooleanWithDefault(env.INTEGRATION_SAP_BUSINESS_ONE_SYNC_ENABLED, true),
      intervalMinutes: getPositiveIntegerWithDefault(
        env.INTEGRATION_SAP_BUSINESS_ONE_SYNC_INTERVAL_MINUTES,
        15,
      ),
      running: this.running,
      ...(this.nextRunAt ? { nextRunAt: this.nextRunAt } : {}),
      ...(this.lastAttemptedAt ? { lastAttemptedAt: this.lastAttemptedAt } : {}),
    };
  }

  async runManualSync(scope: SapBusinessOneSyncScope) {
    return runSapBusinessOneSync(scope, "manual");
  }

  private async runScheduledSync() {
    this.lastAttemptedAt = new Date().toISOString();
    const tenantSlug = loadEnv().DEFAULT_TENANT_SLUG;
    if (!getSapBusinessOneConnectionService().getConnectionSummary(tenantSlug)) {
      const intervalMinutes = getPositiveIntegerWithDefault(
        loadEnv().INTEGRATION_SAP_BUSINESS_ONE_SYNC_INTERVAL_MINUTES,
        15,
      );
      this.nextRunAt = new Date(Date.now() + intervalMinutes * 60_000).toISOString();
      return;
    }
    this.running = true;
    try {
      await runSapBusinessOneSync(["invoices", "customers", "payments"], "scheduled");
    } finally {
      this.running = false;
      const intervalMinutes = getPositiveIntegerWithDefault(
        loadEnv().INTEGRATION_SAP_BUSINESS_ONE_SYNC_INTERVAL_MINUTES,
        15,
      );
      this.nextRunAt = new Date(Date.now() + intervalMinutes * 60_000).toISOString();
    }
  }
}

export async function runSapBusinessOneSync(
  scope: SapBusinessOneSyncScope,
  triggerSource: SapBusinessOneSyncRunRecord["triggerSource"],
) {
  const env = loadEnv();
  const service = getSapBusinessOneConnectionService();
  const startedAt = new Date().toISOString();
  const runId = `sap_b1_sync_${triggerSource}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const running: SapBusinessOneSyncRunRecord = {
    runId,
    tenantSlug: env.DEFAULT_TENANT_SLUG,
    triggerSource,
    syncScope: scope,
    status: "running",
    invoicesSyncedCount: 0,
    customersSyncedCount: 0,
    paymentsSyncedCount: 0,
    startedAt,
    metadata: {},
  };
  service.recordSyncRun(running);

  try {
    let invoicesSyncedCount = 0;
    let customersSyncedCount = 0;
    let paymentsSyncedCount = 0;

    if (scope.includes("invoices")) {
      const invoices = await loadSapBusinessOneInvoices(env.DEFAULT_TENANT_SLUG);
      if (invoices) {
        const syncResult = await createInvoiceSyncService().syncSapBusinessOneInvoices({
          tenantId: env.DEFAULT_TENANT_SLUG,
          invoices: invoices.invoices,
          auditContext: {
            actorId: `sap_business_one_${triggerSource}_sync`,
            actorType: "automation",
            correlationId: runId,
            occurredAt: startedAt,
          },
        });
        invoicesSyncedCount = syncResult.importedCount;
      }
    }

    if (scope.includes("customers")) {
      const customers = await loadSapBusinessOneCustomers(env.DEFAULT_TENANT_SLUG);
      customersSyncedCount = customers?.customers.length ?? 0;
    }

    if (scope.includes("payments")) {
      const payments = await loadSapBusinessOnePayments(env.DEFAULT_TENANT_SLUG);
      paymentsSyncedCount = payments?.payments.length ?? 0;
    }

    const completed: SapBusinessOneSyncRunRecord = {
      ...running,
      status: "succeeded",
      invoicesSyncedCount,
      customersSyncedCount,
      paymentsSyncedCount,
      completedAt: new Date().toISOString(),
      metadata: {
        companyDatabase: service.getConnectionSummary(env.DEFAULT_TENANT_SLUG)?.companyDatabase ?? null,
      },
    };
    service.recordSyncRun(completed);
    return completed;
  } catch (error) {
    const failed: SapBusinessOneSyncRunRecord = {
      ...running,
      status: "failed",
      ...(error instanceof Error ? { errorMessage: error.message } : {}),
      completedAt: new Date().toISOString(),
      metadata: {},
    };
    service.recordSyncRun(failed);
    throw error;
  }
}

let singleton: SapBusinessOneSyncService | undefined;

export function getSapBusinessOneSyncService() {
  singleton ??= new SapBusinessOneSyncService();
  return singleton;
}

export function resetSapBusinessOneSyncServiceForTests() {
  singleton?.stop();
  singleton = undefined;
}

function getBooleanWithDefault(value: boolean | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function getPositiveIntegerWithDefault(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
