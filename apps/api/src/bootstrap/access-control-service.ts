import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { AccessControlService } from "@o2c/workflows";

let service: AccessControlService | undefined;

export async function getAccessControlService() {
  if (!service) {
    service = new AccessControlService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      tenantId: "default",
    });
  }

  return service;
}
