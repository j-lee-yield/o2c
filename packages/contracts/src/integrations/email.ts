import type { CommunicationProvider } from "../communications.js";

export type EmailAuthMode =
  | "oauth2"
  | "service_account"
  | "smtp_password"
  | "api_key"
  | "delegated_token"
  | "other";

export type SendingIdentityConnectionStatus =
  | "connected"
  | "disconnected"
  | "degraded"
  | "error"
  | "pending";

export type SendingIdentityPermissionStatus =
  | "granted"
  | "partial"
  | "missing"
  | "unknown";

export interface SendingIdentityPayload {
  id: string;
  provider: Extract<
    CommunicationProvider,
    "internal" | "gmail" | "microsoft_graph" | "smtp" | "transactional" | "other"
  >;
  authMode: EmailAuthMode;
  senderEmail: string;
  displayName?: string;
  ownerPrincipalId?: string;
  ownerPrincipalRoles: string[];
  connectionStatus: SendingIdentityConnectionStatus;
  permissionStatus: SendingIdentityPermissionStatus;
  scopes: string[];
  allowedTenantId?: string;
  allowedSupplierScope: string[];
  isDefault: boolean;
  sendAsEmail?: string;
  sendOnBehalfOfEmail?: string;
  healthState: "healthy" | "degraded" | "unhealthy" | "unknown";
  lastSyncAt?: string;
  lastSendCheckAt?: string;
  metadata: Record<string, unknown>;
}

export interface EmailConversationMetadataPayload {
  communicationAttemptId: string;
  provider: CommunicationProvider;
  senderIdentityId?: string;
  billingAccountId?: string;
  contactId?: string;
  invoiceIds: string[];
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  replyToProviderMessageId?: string;
  workflowIntent: string;
  metadata: Record<string, unknown>;
}
