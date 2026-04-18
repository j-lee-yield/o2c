import { createEntityMetadata, evolveEntityMetadata, type DomainEntity } from "../../shared/types.js";
import type { LearningProvider } from "../learning-layer/schema.js";

export const sendingIdentityProviders = [
  "internal",
  "gmail",
  "microsoft_graph",
  "smtp",
  "transactional",
  "other",
] as const;
export type SendingIdentityProvider = (typeof sendingIdentityProviders)[number];

export const sendingIdentityAuthModes = [
  "oauth2",
  "service_account",
  "smtp_password",
  "api_key",
  "delegated_token",
  "other",
] as const;
export type SendingIdentityAuthMode = (typeof sendingIdentityAuthModes)[number];

export const sendingIdentityConnectionStatuses = [
  "connected",
  "disconnected",
  "degraded",
  "error",
  "pending",
] as const;
export type SendingIdentityConnectionStatus =
  (typeof sendingIdentityConnectionStatuses)[number];

export const sendingIdentityPermissionStatuses = [
  "granted",
  "partial",
  "missing",
  "unknown",
] as const;
export type SendingIdentityPermissionStatus =
  (typeof sendingIdentityPermissionStatuses)[number];

export const sendingIdentityHealthStates = [
  "healthy",
  "degraded",
  "unhealthy",
  "unknown",
] as const;
export type SendingIdentityHealthState = (typeof sendingIdentityHealthStates)[number];

export interface SendingIdentity extends DomainEntity {
  provider: SendingIdentityProvider;
  authMode: SendingIdentityAuthMode;
  senderEmail: string;
  displayName?: string;
  ownerPrincipalId?: string;
  ownerPrincipalRoles: string[];
  connectionStatus: SendingIdentityConnectionStatus;
  permissionStatus: SendingIdentityPermissionStatus;
  scopes: string[];
  sendAsEmail?: string;
  sendOnBehalfOfEmail?: string;
  isDefault: boolean;
  allowedTenantId?: string;
  allowedSupplierScope: string[];
  healthState: SendingIdentityHealthState;
  lastSyncAt?: string;
  lastSendCheckAt?: string;
  metadata: Record<string, unknown>;
}

export interface EmailThreadReference extends DomainEntity {
  communicationAttemptId: string;
  provider: LearningProvider;
  senderIdentityId?: string;
  billingAccountId?: string;
  contactId?: string;
  invoiceIds: string[];
  workflowIntent: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  replyToProviderMessageId?: string;
  metadata: Record<string, unknown>;
}

export interface SendingIdentityHealthCheck {
  status: "healthy" | "degraded" | "failed";
  checkedAt: string;
  reasonCodes: string[];
}

export function createSendingIdentity(input: {
  id: string;
  provider: SendingIdentityProvider;
  authMode: SendingIdentityAuthMode;
  senderEmail: string;
  displayName?: string;
  ownerPrincipalId?: string;
  ownerPrincipalRoles?: string[];
  connectionStatus?: SendingIdentityConnectionStatus;
  permissionStatus?: SendingIdentityPermissionStatus;
  scopes?: string[];
  sendAsEmail?: string;
  sendOnBehalfOfEmail?: string;
  isDefault?: boolean;
  allowedTenantId?: string;
  allowedSupplierScope?: string[];
  healthState?: SendingIdentityHealthState;
  lastSyncAt?: string;
  lastSendCheckAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): SendingIdentity {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    }),
    provider: input.provider,
    authMode: input.authMode,
    senderEmail: input.senderEmail.trim().toLowerCase(),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.ownerPrincipalId ? { ownerPrincipalId: input.ownerPrincipalId } : {}),
    ownerPrincipalRoles: [...(input.ownerPrincipalRoles ?? [])],
    connectionStatus: input.connectionStatus ?? "pending",
    permissionStatus: input.permissionStatus ?? "unknown",
    scopes: [...(input.scopes ?? [])],
    ...(input.sendAsEmail ? { sendAsEmail: input.sendAsEmail.trim().toLowerCase() } : {}),
    ...(input.sendOnBehalfOfEmail
      ? { sendOnBehalfOfEmail: input.sendOnBehalfOfEmail.trim().toLowerCase() }
      : {}),
    isDefault: input.isDefault ?? false,
    ...(input.allowedTenantId ? { allowedTenantId: input.allowedTenantId } : {}),
    allowedSupplierScope: [...(input.allowedSupplierScope ?? [])],
    healthState: input.healthState ?? "unknown",
    ...(input.lastSyncAt ? { lastSyncAt: input.lastSyncAt } : {}),
    ...(input.lastSendCheckAt ? { lastSendCheckAt: input.lastSendCheckAt } : {}),
    metadata: input.metadata ?? {},
  };
}

export function updateSendingIdentityHealth(
  identity: SendingIdentity,
  input: {
    checkedAt: string;
    status: SendingIdentityHealthCheck["status"];
    reasonCodes: string[];
    actorId?: string;
    actorRole?: "system" | "user";
  },
): SendingIdentity {
  return {
    ...identity,
    ...evolveEntityMetadata(identity, {
      at: input.checkedAt,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    }),
    connectionStatus:
      input.status === "failed"
        ? "disconnected"
        : input.status === "degraded"
          ? "degraded"
          : "connected",
    healthState:
      input.status === "failed"
        ? "unhealthy"
        : input.status === "degraded"
          ? "degraded"
          : "healthy",
    lastSendCheckAt: input.checkedAt,
    metadata: {
      ...identity.metadata,
      lastHealthReasonCodes: [...input.reasonCodes],
    },
  };
}

export function setSendingIdentityDefault(
  identities: SendingIdentity[],
  defaultIdentityId: string,
  updatedAt: string,
): SendingIdentity[] {
  return identities.map((identity) => ({
    ...identity,
    ...evolveEntityMetadata(identity, {
      at: updatedAt,
      actorId: "system_email",
      actorRole: "system",
    }),
    isDefault: identity.id === defaultIdentityId,
  }));
}

export function canUseSendingIdentityForOutbound(identity: SendingIdentity): boolean {
  return (
    identity.connectionStatus === "connected" &&
    identity.permissionStatus !== "missing" &&
    identity.healthState !== "unhealthy"
  );
}

export function createEmailThreadReference(input: {
  id: string;
  communicationAttemptId: string;
  provider: LearningProvider;
  senderIdentityId?: string;
  billingAccountId?: string;
  contactId?: string;
  invoiceIds?: string[];
  workflowIntent: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  replyToProviderMessageId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actorId?: string;
  actorRole?: "system" | "user";
  tenantId?: string;
}): EmailThreadReference {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.createdAt,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    }),
    communicationAttemptId: input.communicationAttemptId,
    provider: input.provider,
    ...(input.senderIdentityId ? { senderIdentityId: input.senderIdentityId } : {}),
    ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    invoiceIds: [...(input.invoiceIds ?? [])],
    workflowIntent: input.workflowIntent,
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
    ...(input.providerConversationId
      ? { providerConversationId: input.providerConversationId }
      : {}),
    ...(input.replyToProviderMessageId
      ? { replyToProviderMessageId: input.replyToProviderMessageId }
      : {}),
    metadata: input.metadata ?? {},
  };
}
