import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresImmutableActivityLogStore,
  PostgresOutreachIntelligenceContextStore,
} from "@o2c/database";
import {
  CollectionsOutreachIntelligenceService,
  InMemoryOutreachContextStore,
} from "@o2c/workflows";

let outreachService: CollectionsOutreachIntelligenceService | undefined;

export function getOutreachIntelligenceService(): CollectionsOutreachIntelligenceService {
  if (outreachService) {
    return outreachService;
  }

  const db = createDatabaseClientConfig();
  const shouldUseDatabase =
    db.connectionString.trim().length > 0 && isDatabaseAvailable(db.connectionString);

  outreachService = new CollectionsOutreachIntelligenceService({
    activityStore: shouldUseDatabase
      ? new PostgresImmutableActivityLogStore(db.connectionString)
      : new InMemoryImmutableActivityLogStore(),
    contextStore: shouldUseDatabase
      ? new PostgresOutreachIntelligenceContextStore(db.connectionString)
      : new InMemoryOutreachContextStore(),
  });

  return outreachService;
}

export function resetOutreachIntelligenceServiceForTests(): void {
  outreachService = undefined;
}
