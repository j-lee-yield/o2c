import { loadEnv } from "@o2c/config";
import { buildApiApp } from "./app.js";
import { getRetellCallInboxSyncService } from "./bootstrap/retell-call-inbox-sync-service.js";
import { getSapBusinessOneSyncService } from "./bootstrap/sap-business-one-sync-service.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApiApp();
  const retellCallInboxSyncService = getRetellCallInboxSyncService();
  const sapBusinessOneSyncService = getSapBusinessOneSyncService();

  try {
    app.addHook("onClose", async () => {
      retellCallInboxSyncService.stop();
      sapBusinessOneSyncService.stop();
    });

    const address = await app.listen({
      host: env.API_HOST,
      port: env.API_PORT,
    });
    retellCallInboxSyncService.start();
    sapBusinessOneSyncService.start();
    app.log.info({ address }, "API server started");
  } catch (error) {
    app.log.error(error, "Failed to start API server");
    process.exitCode = 1;
  }
}

void main();
