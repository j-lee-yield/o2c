import type { DomainEntity } from "../../shared/types.js";
import type { Role } from "@o2c/auth";

export interface ActivityLog extends DomainEntity {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorRole: Role | "system";
  occurredAt: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  immutable: true;
}
