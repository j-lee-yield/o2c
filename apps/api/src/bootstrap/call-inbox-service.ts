import { randomUUID } from "node:crypto";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresCallInboxRepository,
  PostgresImmutableActivityLogStore,
  queryJsonRows,
} from "@o2c/database";
import {
  CallInboxWorkflowService,
  InMemoryCallInboxRepository,
} from "@o2c/workflows";
import { loadEnv } from "@o2c/config";

let callInboxService: CallInboxWorkflowService | undefined;

export function getCallInboxService(): CallInboxWorkflowService {
  if (!callInboxService) {
    const env = loadEnv();
    const databaseUrl = createDatabaseClientConfig().connectionString;
    const canUseDatabase = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
    const canUsePostgresCallInbox = canUseDatabase && hasCallInboxTable(databaseUrl);
    callInboxService = new CallInboxWorkflowService({
      repository: canUsePostgresCallInbox
        ? new PostgresCallInboxRepository(databaseUrl, env.DEFAULT_TENANT_SLUG)
        : new InMemoryCallInboxRepository(),
      activityStore: canUseDatabase
        ? new PostgresImmutableActivityLogStore(databaseUrl, env.DEFAULT_TENANT_SLUG)
        : new InMemoryImmutableActivityLogStore(),
      now: () => new Date().toISOString(),
      idGenerator: () => randomUUID(),
    });
  }

  return callInboxService;
}

export function setCallInboxServiceForTests(service?: CallInboxWorkflowService): void {
  callInboxService = service;
}

function hasCallInboxTable(databaseUrl: string): boolean {
  try {
    const [row] = queryJsonRows<{ exists: boolean }>(
      databaseUrl,
      "SELECT json_build_object('exists', to_regclass('public.call_inbox_record') IS NOT NULL);"
    );

    return row?.exists === true;
  } catch {
    return false;
  }
}
