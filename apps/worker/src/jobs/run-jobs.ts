import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresLearningLayerRecomputeService,
} from "@o2c/database";
import { getPilotReadinessRuntime } from "@o2c/seed";
import { jobRegistry } from "../bootstrap/job-registry.js";

export const runJobs = async (): Promise<void> => {
  const env = loadEnv();
  const db = createDatabaseClientConfig();
  const runtime = getPilotReadinessRuntime();
  const result = await runtime.processPendingWritebacks("worker");
  const recomputeResult =
    db.connectionString.length > 0 && isDatabaseAvailable(db.connectionString)
      ? new PostgresLearningLayerRecomputeService(db.connectionString).recompute({
          tenantId: env.DEFAULT_TENANT_SLUG,
          actorId: "worker_learning_profile_recompute",
        })
      : undefined;
  console.info(
    `Worker booted with concurrency ${env.WORKER_CONCURRENCY} for ${jobRegistry.length} job types. Processed ${result.pushedCount} staged pilot writebacks.${
      recomputeResult
        ? ` Recomputed ${recomputeResult.processedAccountProfiles} account profiles and ${recomputeResult.processedContactProfiles} contact profiles.`
        : " Learning-profile recompute skipped because the database is unavailable."
    }`
  );
};
