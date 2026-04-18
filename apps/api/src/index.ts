import { loadEnv } from "@o2c/config";
import { buildApiApp } from "./app.js";
import { getSapBusinessOneSyncService } from "./bootstrap/sap-business-one-sync-service.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApiApp();
  const sapBusinessOneSyncService = getSapBusinessOneSyncService();

  try {
    app.addHook("onClose", async () => {
      sapBusinessOneSyncService.stop();
    });

    const address = await app.listen({
      host: env.API_HOST,
      port: env.API_PORT,
    });
    sapBusinessOneSyncService.start();
    app.log.info({ address }, "API server started");
  } catch (error) {
    app.log.error(error, "Failed to start API server");
    process.exitCode = 1;
  }
}

void main();
