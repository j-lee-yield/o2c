import { createEntityMetadata, type DomainEntity } from "../../shared/types.js";
import type { Role } from "@o2c/auth";

export const approvalRequestStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
  "reopened",
] as const;

export type ApprovalRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "reopened";

export type TerminalApprovalRequestStatus = "approved" | "rejected" | "cancelled";

export interface ApprovalRequest extends DomainEntity {
  requestType: string;
  status: ApprovalRequestStatus;
  requestedBy: string;
  assigneeRole?: Role;
  currentStep?: string;
  requestedAt: string;
  resolvedAt?: string;
  terminalAt?: string;
  reopenedFromStatus?: TerminalApprovalRequestStatus;
  payload: Record<string, unknown>;
  policyContext: Record<string, unknown>;
  version: number;
}

export const approvalRequestSchema = {
  tableName: "approval_requests",
  fields: {
    id: { type: "string", required: true },
    requestType: { type: "string", required: true },
    status: { type: "enum", values: approvalRequestStatuses, required: true },
    requestedBy: { type: "string", required: true },
    assigneeRole: { type: "string", required: false },
    currentStep: { type: "string", required: false },
    requestedAt: { type: "string", required: true },
    resolvedAt: { type: "string", required: false },
    terminalAt: { type: "string", required: false },
    reopenedFromStatus: { type: "string", required: false },
    payload: { type: "json", required: true },
    policyContext: { type: "json", required: true },
    version: { type: "number", required: true },
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
  },
} as const;

export function isTerminalApprovalStatus(
  status: ApprovalRequestStatus
): status is TerminalApprovalRequestStatus {
  return status === "approved" || status === "rejected" || status === "cancelled";
}

export function createApprovalRequest(params: {
  id: string;
  requestType: string;
  requestedBy: string;
  requestedAt: string;
  payload: Record<string, unknown>;
  assigneeRole?: Role;
  currentStep?: string;
  policyContext?: Record<string, unknown>;
}): ApprovalRequest {
  return {
    id: params.id,
    ...createEntityMetadata({
      at: params.requestedAt,
      actorId: params.requestedBy,
      actorRole: "user"
    }),
    requestType: params.requestType,
    status: "draft",
    requestedBy: params.requestedBy,
    requestedAt: params.requestedAt,
    payload: cloneJson(params.payload),
    policyContext: cloneJson(params.policyContext ?? {}),
    ...(params.assigneeRole ? { assigneeRole: params.assigneeRole } : {}),
    ...(params.currentStep ? { currentStep: params.currentStep } : {}),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
