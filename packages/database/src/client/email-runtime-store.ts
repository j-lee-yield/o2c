import type { EmailThreadReference, SendingIdentity } from "@o2c/domain";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

type SendingIdentityRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  provider: SendingIdentity["provider"];
  authMode: SendingIdentity["authMode"];
  senderEmail: string;
  displayName?: string;
  ownerPrincipalId?: string;
  ownerPrincipalRoles?: string[];
  connectionStatus: SendingIdentity["connectionStatus"];
  permissionStatus: SendingIdentity["permissionStatus"];
  scopes?: string[];
  sendAsEmail?: string;
  sendOnBehalfOfEmail?: string;
  isDefault: boolean;
  allowedTenantId?: string;
  allowedSupplierScope?: string[];
  healthState: SendingIdentity["healthState"];
  lastSyncAt?: string;
  lastSendCheckAt?: string;
  metadata?: Record<string, unknown>;
};

type EmailThreadReferenceRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  communicationAttemptId: string;
  provider: EmailThreadReference["provider"];
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
};

type GmailOauthConnectionRecord = {
  senderIdentityId: string;
  senderEmail: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  scopes: string[];
  displayName?: string;
  connectedAt: string;
  updatedAt: string;
};

type GmailOauthConnectionRow = GmailOauthConnectionRecord & {
  tenantId?: string;
  requestedByPrincipalId?: string;
  requestedByPrincipalRoles?: string[];
  metadata?: Record<string, unknown>;
};

export class PostgresSendingIdentityStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  save(identity: SendingIdentity): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO sending_identity (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          deleted_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          provider,
          auth_mode,
          sender_email,
          display_name,
          owner_principal_id,
          owner_principal_roles,
          connection_status,
          permission_status,
          scopes,
          send_as_email,
          send_on_behalf_of_email,
          is_default,
          allowed_tenant_id,
          allowed_supplier_scope,
          health_state,
          last_sync_at,
          last_send_check_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(identity.id)}'::uuid,
          '${quoteLiteral(identity.tenantId ?? this.tenantId)}',
          ${identity.version},
          '${quoteLiteral(identity.createdAt)}'::timestamptz,
          '${quoteLiteral(identity.updatedAt)}'::timestamptz,
          ${identity.deletedAt ? `'${quoteLiteral(identity.deletedAt)}'::timestamptz` : "NULL"},
          ${identity.createdByActorId ? `'${quoteLiteral(identity.createdByActorId)}'` : "NULL"},
          ${identity.createdByActorRole ? `'${quoteLiteral(identity.createdByActorRole)}'` : "NULL"},
          ${identity.updatedByActorId ? `'${quoteLiteral(identity.updatedByActorId)}'` : "NULL"},
          ${identity.updatedByActorRole ? `'${quoteLiteral(identity.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(identity.provider)}',
          '${quoteLiteral(identity.authMode)}',
          '${quoteLiteral(identity.senderEmail)}',
          ${identity.displayName ? `'${quoteLiteral(identity.displayName)}'` : "NULL"},
          ${identity.ownerPrincipalId ? `'${quoteLiteral(identity.ownerPrincipalId)}'` : "NULL"},
          '${jsonLiteral(identity.ownerPrincipalRoles)}'::jsonb,
          '${quoteLiteral(identity.connectionStatus)}',
          '${quoteLiteral(identity.permissionStatus)}',
          '${jsonLiteral(identity.scopes)}'::jsonb,
          ${identity.sendAsEmail ? `'${quoteLiteral(identity.sendAsEmail)}'` : "NULL"},
          ${identity.sendOnBehalfOfEmail ? `'${quoteLiteral(identity.sendOnBehalfOfEmail)}'` : "NULL"},
          ${identity.isDefault ? "TRUE" : "FALSE"},
          ${identity.allowedTenantId ? `'${quoteLiteral(identity.allowedTenantId)}'` : "NULL"},
          '${jsonLiteral(identity.allowedSupplierScope)}'::jsonb,
          '${quoteLiteral(identity.healthState)}',
          ${identity.lastSyncAt ? `'${quoteLiteral(identity.lastSyncAt)}'::timestamptz` : "NULL"},
          ${identity.lastSendCheckAt ? `'${quoteLiteral(identity.lastSendCheckAt)}'::timestamptz` : "NULL"},
          '${jsonLiteral(identity.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          provider = EXCLUDED.provider,
          auth_mode = EXCLUDED.auth_mode,
          sender_email = EXCLUDED.sender_email,
          display_name = EXCLUDED.display_name,
          owner_principal_id = EXCLUDED.owner_principal_id,
          owner_principal_roles = EXCLUDED.owner_principal_roles,
          connection_status = EXCLUDED.connection_status,
          permission_status = EXCLUDED.permission_status,
          scopes = EXCLUDED.scopes,
          send_as_email = EXCLUDED.send_as_email,
          send_on_behalf_of_email = EXCLUDED.send_on_behalf_of_email,
          is_default = EXCLUDED.is_default,
          allowed_tenant_id = EXCLUDED.allowed_tenant_id,
          allowed_supplier_scope = EXCLUDED.allowed_supplier_scope,
          health_state = EXCLUDED.health_state,
          last_sync_at = EXCLUDED.last_sync_at,
          last_send_check_at = EXCLUDED.last_send_check_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  list(): SendingIdentity[] {
    const rows = queryJsonRows<SendingIdentityRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS "id",
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            provider,
            auth_mode AS "authMode",
            sender_email AS "senderEmail",
            display_name AS "displayName",
            owner_principal_id AS "ownerPrincipalId",
            owner_principal_roles AS "ownerPrincipalRoles",
            connection_status AS "connectionStatus",
            permission_status AS "permissionStatus",
            scopes,
            send_as_email AS "sendAsEmail",
            send_on_behalf_of_email AS "sendOnBehalfOfEmail",
            is_default AS "isDefault",
            allowed_tenant_id AS "allowedTenantId",
            allowed_supplier_scope AS "allowedSupplierScope",
            health_state AS "healthState",
            last_sync_at AS "lastSyncAt",
            last_send_check_at AS "lastSendCheckAt",
            metadata
          FROM sending_identity
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deleted_at IS NULL
          ORDER BY updated_at DESC
        ) q
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      ...(row.tenantId ? { tenantId: row.tenantId } : {}),
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
      ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
      ...(row.createdByActorRole
        ? {
            createdByActorRole:
              row.createdByActorRole as NonNullable<SendingIdentity["createdByActorRole"]>,
          }
        : {}),
      ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
      ...(row.updatedByActorRole
        ? {
            updatedByActorRole:
              row.updatedByActorRole as NonNullable<SendingIdentity["updatedByActorRole"]>,
          }
        : {}),
      provider: row.provider,
      authMode: row.authMode,
      senderEmail: row.senderEmail,
      ...(row.displayName ? { displayName: row.displayName } : {}),
      ...(row.ownerPrincipalId ? { ownerPrincipalId: row.ownerPrincipalId } : {}),
      ownerPrincipalRoles: row.ownerPrincipalRoles ?? [],
      connectionStatus: row.connectionStatus,
      permissionStatus: row.permissionStatus,
      scopes: row.scopes ?? [],
      ...(row.sendAsEmail ? { sendAsEmail: row.sendAsEmail } : {}),
      ...(row.sendOnBehalfOfEmail ? { sendOnBehalfOfEmail: row.sendOnBehalfOfEmail } : {}),
      isDefault: row.isDefault,
      ...(row.allowedTenantId ? { allowedTenantId: row.allowedTenantId } : {}),
      allowedSupplierScope: row.allowedSupplierScope ?? [],
      healthState: row.healthState,
      ...(row.lastSyncAt ? { lastSyncAt: row.lastSyncAt } : {}),
      ...(row.lastSendCheckAt ? { lastSendCheckAt: row.lastSendCheckAt } : {}),
      metadata: row.metadata ?? {},
    }));
  }

  get(id: string): SendingIdentity | undefined {
    return this.list().find((identity) => identity.id === id);
  }

  replaceAll(identities: SendingIdentity[]): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM sending_identity
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
      `,
    );

    for (const identity of identities) {
      this.save(identity);
    }
  }
}

export class PostgresEmailThreadReferenceStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  save(reference: EmailThreadReference): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO email_thread_reference (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          deleted_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          communication_attempt_id,
          provider,
          sender_identity_id,
          billing_account_id,
          contact_id,
          invoice_ids,
          workflow_intent,
          provider_message_id,
          provider_thread_id,
          provider_conversation_id,
          reply_to_provider_message_id,
          metadata
        )
        VALUES (
          '${quoteLiteral(reference.id)}'::uuid,
          '${quoteLiteral(reference.tenantId ?? this.tenantId)}',
          ${reference.version},
          '${quoteLiteral(reference.createdAt)}'::timestamptz,
          '${quoteLiteral(reference.updatedAt)}'::timestamptz,
          ${reference.deletedAt ? `'${quoteLiteral(reference.deletedAt)}'::timestamptz` : "NULL"},
          ${reference.createdByActorId ? `'${quoteLiteral(reference.createdByActorId)}'` : "NULL"},
          ${reference.createdByActorRole ? `'${quoteLiteral(reference.createdByActorRole)}'` : "NULL"},
          ${reference.updatedByActorId ? `'${quoteLiteral(reference.updatedByActorId)}'` : "NULL"},
          ${reference.updatedByActorRole ? `'${quoteLiteral(reference.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(reference.communicationAttemptId)}'::uuid,
          '${quoteLiteral(reference.provider)}',
          ${reference.senderIdentityId ? `'${quoteLiteral(reference.senderIdentityId)}'::uuid` : "NULL"},
          ${reference.billingAccountId ? `'${quoteLiteral(reference.billingAccountId)}'::uuid` : "NULL"},
          ${reference.contactId ? `'${quoteLiteral(reference.contactId)}'::uuid` : "NULL"},
          '${jsonLiteral(reference.invoiceIds)}'::jsonb,
          '${quoteLiteral(reference.workflowIntent)}',
          ${reference.providerMessageId ? `'${quoteLiteral(reference.providerMessageId)}'` : "NULL"},
          ${reference.providerThreadId ? `'${quoteLiteral(reference.providerThreadId)}'` : "NULL"},
          ${reference.providerConversationId ? `'${quoteLiteral(reference.providerConversationId)}'` : "NULL"},
          ${reference.replyToProviderMessageId ? `'${quoteLiteral(reference.replyToProviderMessageId)}'` : "NULL"},
          '${jsonLiteral(reference.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          communication_attempt_id = EXCLUDED.communication_attempt_id,
          provider = EXCLUDED.provider,
          sender_identity_id = EXCLUDED.sender_identity_id,
          billing_account_id = EXCLUDED.billing_account_id,
          contact_id = EXCLUDED.contact_id,
          invoice_ids = EXCLUDED.invoice_ids,
          workflow_intent = EXCLUDED.workflow_intent,
          provider_message_id = EXCLUDED.provider_message_id,
          provider_thread_id = EXCLUDED.provider_thread_id,
          provider_conversation_id = EXCLUDED.provider_conversation_id,
          reply_to_provider_message_id = EXCLUDED.reply_to_provider_message_id,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  getByAttemptId(communicationAttemptId: string): EmailThreadReference | undefined {
    return this.list().find((reference) => reference.communicationAttemptId === communicationAttemptId);
  }

  findLatest(input: {
    provider: EmailThreadReference["provider"];
    senderIdentityId: string;
    billingAccountId?: string;
    contactId?: string;
  }): EmailThreadReference | undefined {
    const rows = queryJsonRows<EmailThreadReferenceRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS "id",
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            communication_attempt_id::text AS "communicationAttemptId",
            provider,
            sender_identity_id::text AS "senderIdentityId",
            billing_account_id::text AS "billingAccountId",
            contact_id::text AS "contactId",
            invoice_ids AS "invoiceIds",
            workflow_intent AS "workflowIntent",
            provider_message_id AS "providerMessageId",
            provider_thread_id AS "providerThreadId",
            provider_conversation_id AS "providerConversationId",
            reply_to_provider_message_id AS "replyToProviderMessageId",
            metadata
          FROM email_thread_reference
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deleted_at IS NULL
            AND provider = '${quoteLiteral(input.provider)}'
            AND sender_identity_id = '${quoteLiteral(input.senderIdentityId)}'::uuid
            ${input.billingAccountId ? `AND billing_account_id = '${quoteLiteral(input.billingAccountId)}'::uuid` : ""}
            ${input.contactId ? `AND contact_id = '${quoteLiteral(input.contactId)}'::uuid` : ""}
          ORDER BY created_at DESC
          LIMIT 1
        ) q
      `,
    );

    return rows[0] ? toEmailThreadReference(rows[0]) : undefined;
  }

  private list(): EmailThreadReference[] {
    const rows = queryJsonRows<EmailThreadReferenceRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id::text AS "id",
            tenant_id AS "tenantId",
            version,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            deleted_at AS "deletedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            communication_attempt_id::text AS "communicationAttemptId",
            provider,
            sender_identity_id::text AS "senderIdentityId",
            billing_account_id::text AS "billingAccountId",
            contact_id::text AS "contactId",
            invoice_ids AS "invoiceIds",
            workflow_intent AS "workflowIntent",
            provider_message_id AS "providerMessageId",
            provider_thread_id AS "providerThreadId",
            provider_conversation_id AS "providerConversationId",
            reply_to_provider_message_id AS "replyToProviderMessageId",
            metadata
          FROM email_thread_reference
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deleted_at IS NULL
          ORDER BY created_at DESC
        ) q
      `,
    );

    return rows.map(toEmailThreadReference);
  }
}

export class PostgresGmailOauthConnectionStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  save(input: GmailOauthConnectionRecord & {
    requestedByPrincipalId?: string;
    requestedByPrincipalRoles?: string[];
    metadata?: Record<string, unknown>;
  }): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO gmail_oauth_connection (
          sender_identity_id,
          tenant_id,
          sender_email,
          access_token,
          refresh_token,
          access_token_expires_at,
          scopes,
          display_name,
          connected_at,
          updated_at,
          requested_by_principal_id,
          requested_by_principal_roles,
          metadata
        )
        VALUES (
          '${quoteLiteral(input.senderIdentityId)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(input.senderEmail)}',
          '${quoteLiteral(input.accessToken)}',
          ${input.refreshToken ? `'${quoteLiteral(input.refreshToken)}'` : "NULL"},
          '${quoteLiteral(input.accessTokenExpiresAt)}'::timestamptz,
          '${jsonLiteral(input.scopes)}'::jsonb,
          ${input.displayName ? `'${quoteLiteral(input.displayName)}'` : "NULL"},
          '${quoteLiteral(input.connectedAt)}'::timestamptz,
          '${quoteLiteral(input.updatedAt)}'::timestamptz,
          ${input.requestedByPrincipalId ? `'${quoteLiteral(input.requestedByPrincipalId)}'` : "NULL"},
          '${jsonLiteral(input.requestedByPrincipalRoles ?? [])}'::jsonb,
          '${jsonLiteral(input.metadata ?? {})}'::jsonb
        )
        ON CONFLICT (sender_identity_id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          sender_email = EXCLUDED.sender_email,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          access_token_expires_at = EXCLUDED.access_token_expires_at,
          scopes = EXCLUDED.scopes,
          display_name = EXCLUDED.display_name,
          connected_at = EXCLUDED.connected_at,
          updated_at = EXCLUDED.updated_at,
          requested_by_principal_id = EXCLUDED.requested_by_principal_id,
          requested_by_principal_roles = EXCLUDED.requested_by_principal_roles,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  get(senderIdentityId: string): GmailOauthConnectionRecord | undefined {
    const rows = queryJsonRows<GmailOauthConnectionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            sender_identity_id::text AS "senderIdentityId",
            tenant_id AS "tenantId",
            sender_email AS "senderEmail",
            access_token AS "accessToken",
            refresh_token AS "refreshToken",
            access_token_expires_at AS "accessTokenExpiresAt",
            scopes,
            display_name AS "displayName",
            connected_at AS "connectedAt",
            updated_at AS "updatedAt",
            requested_by_principal_id AS "requestedByPrincipalId",
            requested_by_principal_roles AS "requestedByPrincipalRoles",
            metadata
          FROM gmail_oauth_connection
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND sender_identity_id = '${quoteLiteral(senderIdentityId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      senderIdentityId: row.senderIdentityId,
      senderEmail: row.senderEmail,
      accessToken: row.accessToken,
      ...(row.refreshToken ? { refreshToken: row.refreshToken } : {}),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      scopes: row.scopes ?? [],
      ...(row.displayName ? { displayName: row.displayName } : {}),
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
    };
  }
}

function toEmailThreadReference(row: EmailThreadReferenceRow): EmailThreadReference {
  return {
    id: row.id,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole
      ? {
          createdByActorRole:
            row.createdByActorRole as NonNullable<EmailThreadReference["createdByActorRole"]>,
        }
      : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole
      ? {
          updatedByActorRole:
            row.updatedByActorRole as NonNullable<EmailThreadReference["updatedByActorRole"]>,
        }
      : {}),
    communicationAttemptId: row.communicationAttemptId,
    provider: row.provider,
    ...(row.senderIdentityId ? { senderIdentityId: row.senderIdentityId } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.contactId ? { contactId: row.contactId } : {}),
    invoiceIds: row.invoiceIds ?? [],
    workflowIntent: row.workflowIntent,
    ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}),
    ...(row.providerThreadId ? { providerThreadId: row.providerThreadId } : {}),
    ...(row.providerConversationId
      ? { providerConversationId: row.providerConversationId }
      : {}),
    ...(row.replyToProviderMessageId
      ? { replyToProviderMessageId: row.replyToProviderMessageId }
      : {}),
    metadata: row.metadata ?? {},
  };
}
