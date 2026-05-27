import type { Principal } from "@o2c/auth";
import { loadEnv } from "@o2c/config";
import { getCallInboxService } from "./call-inbox-service.js";
import {
  RetellConfigurationError,
  RetellHttpClient,
  RetellProviderError,
  type RetellCallRecord,
} from "../modules/retell/client.js";
import { retellCallToCallInboxUpsert } from "../modules/retell/call-inbox-adapter.js";
import { scheduleRetellPostCallAutomation } from "../modules/retell/post-call-automation.js";

type RetellCallInboxSyncTrigger = "manual" | "manual_endpoint" | "scheduled";

export type RetellCallInboxSyncResult = {
  ok: true;
  status: "synced";
  triggerSource: RetellCallInboxSyncTrigger;
  count: number;
  postCallAutomations: Array<{
    providerCallId: string;
    queued: boolean;
    reason?: string;
  }>;
  records: Array<{
    id: string;
    providerCallId: string;
    customerName?: string;
    status: string;
    startedAt: string;
  }>;
};

type RetellCallInboxPollingStatus = {
  enabled: boolean;
  intervalSeconds: number;
  limit: number;
  running: boolean;
  nextRunAt?: string;
  lastAttemptedAt?: string;
  lastResult?: Pick<RetellCallInboxSyncResult, "status" | "count" | "triggerSource">;
  lastError?: string;
};

export async function runRetellCallInboxSync(input?: {
  tenantId?: string;
  limit?: number;
  paginationKey?: string;
  filterCriteria?: Record<string, unknown>;
  sortOrder?: string;
  triggerSource?: RetellCallInboxSyncTrigger;
}): Promise<RetellCallInboxSyncResult> {
  const env = loadEnv();
  const tenantId = input?.tenantId ?? env.DEFAULT_TENANT_SLUG;
  const client = new RetellHttpClient({
    ...(env.RETELL_API_KEY ? { apiKey: env.RETELL_API_KEY } : {}),
    ...(env.RETELL_BASE_URL ? { baseUrl: env.RETELL_BASE_URL } : {}),
  });

  const providerCalls = await client.listCalls({
    ...(input?.limit ? { limit: input.limit } : {}),
    ...(input?.paginationKey ? { pagination_key: input.paginationKey } : {}),
    ...(input?.filterCriteria ? { filter_criteria: input.filterCriteria } : {}),
    ...(input?.sortOrder ? { sort_order: input.sortOrder } : {}),
  });

  return upsertRetellCallInboxRecords({
    tenantId,
    providerCalls,
    event: input?.triggerSource === "scheduled" ? "scheduled_polling_sync" : "polling_sync",
    triggerSource: input?.triggerSource ?? "manual",
    receivedAt: new Date().toISOString(),
  });
}

class RetellCallInboxSyncService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private nextRunAt: string | undefined;
  private lastAttemptedAt: string | undefined;
  private lastResult: RetellCallInboxPollingStatus["lastResult"];
  private lastError: string | undefined;

  start() {
    const status = this.resolveConfiguredStatus();
    if (!status.enabled || this.timer) {
      return;
    }

    const intervalMs = status.intervalSeconds * 1_000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    this.timer = setInterval(() => {
      void this.runScheduledSync();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.nextRunAt = undefined;
    this.running = false;
  }

  getStatus(): RetellCallInboxPollingStatus {
    const configured = this.resolveConfiguredStatus();
    return {
      ...configured,
      running: this.running,
      ...(this.nextRunAt ? { nextRunAt: this.nextRunAt } : {}),
      ...(this.lastAttemptedAt ? { lastAttemptedAt: this.lastAttemptedAt } : {}),
      ...(this.lastResult ? { lastResult: this.lastResult } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  async runManualSync(input?: { tenantId?: string; limit?: number }) {
    return runRetellCallInboxSync({
      ...input,
      triggerSource: "manual",
    });
  }

  private async runScheduledSync() {
    if (this.running) {
      return;
    }

    const configured = this.resolveConfiguredStatus();
    if (!configured.enabled) {
      this.stop();
      return;
    }

    this.running = true;
    this.lastAttemptedAt = new Date().toISOString();
    try {
      const result = await runRetellCallInboxSync({
        limit: configured.limit,
        triggerSource: "scheduled",
      });
      this.lastResult = {
        status: result.status,
        count: result.count,
        triggerSource: result.triggerSource,
      };
      this.lastError = undefined;
    } catch (error) {
      this.lastError = readSyncError(error);
      console.error("Retell call inbox polling sync failed.", {
        error: this.lastError,
      });
    } finally {
      this.running = false;
      this.nextRunAt = new Date(Date.now() + configured.intervalSeconds * 1_000).toISOString();
    }
  }

  private resolveConfiguredStatus() {
    const env = loadEnv();
    const enabled =
      env.NODE_ENV !== "test" &&
      Boolean(env.RETELL_API_KEY) &&
      getBooleanWithDefault(env.RETELL_CALL_INBOX_POLLING_ENABLED, true);
    return {
      enabled,
      intervalSeconds: getPositiveIntegerWithDefault(
        env.RETELL_CALL_INBOX_POLLING_INTERVAL_SECONDS,
        60,
      ),
      limit: getPositiveIntegerWithDefault(env.RETELL_CALL_INBOX_POLLING_LIMIT, 20),
      running: this.running,
    };
  }
}

function upsertRetellCallInboxRecords(input: {
  tenantId: string;
  providerCalls: RetellCallRecord[];
  event: string;
  triggerSource: RetellCallInboxSyncTrigger;
  receivedAt: string;
}): Promise<RetellCallInboxSyncResult> {
  return (async () => {
    const service = getCallInboxService();
    const records = [];
    const postCallAutomations = [];
    for (const call of input.providerCalls) {
      const upsert = retellCallToCallInboxUpsert({
        tenantId: input.tenantId,
        call,
        event: input.event,
        receivedAt: input.receivedAt,
      });
      const result = await service.upsertCall(defaultRetellPollingPrincipal(), upsert);
      const postCallAutomation = scheduleRetellPostCallAutomation({
        tenantId: input.tenantId,
        event: input.event,
        call,
        callRecord: result.record,
      });
      postCallAutomations.push({
        providerCallId: result.record.providerCallId,
        ...postCallAutomation,
      });
      records.push(result.record);
    }

    return {
      ok: true,
      status: "synced",
      triggerSource: input.triggerSource,
      count: records.length,
      postCallAutomations,
      records: records.map((record) => ({
        id: record.id,
        providerCallId: record.providerCallId,
        customerName: record.customerName,
        status: record.status,
        startedAt: record.startedAt,
      })),
    };
  })();
}

function defaultRetellPollingPrincipal(): Principal {
  return {
    id: "retell_polling_sync",
    roles: ["ar_collector"],
  };
}

function readSyncError(error: unknown) {
  if (error instanceof RetellConfigurationError || error instanceof RetellProviderError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function getBooleanWithDefault(value: boolean | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function getPositiveIntegerWithDefault(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

let singleton: RetellCallInboxSyncService | undefined;

export function getRetellCallInboxSyncService() {
  singleton ??= new RetellCallInboxSyncService();
  return singleton;
}

export function resetRetellCallInboxSyncServiceForTests() {
  singleton?.stop();
  singleton = undefined;
}
