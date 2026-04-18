export type IntegrationProvider =
  | "netsuite"
  | "sap_business_one"
  | "quickbooks_online"
  | "xero"
  | "zoho_books"
  | "odoo"
  | "dear_erp"
  | "google_sheets"
  | "email_inbox"
  | "yield"
  | "perfios";

export type ConnectorKind =
  | "erp"
  | "accounting"
  | "spreadsheet"
  | "email"
  | "document_ai"
  | "bank_parser";

export type ConnectorAuthStrategy =
  | "oauth2"
  | "api_key"
  | "service_account"
  | "basic_auth"
  | "none";

export type IntegrationSyncObject =
  | "customers"
  | "contacts"
  | "invoices"
  | "invoice_lines"
  | "payments"
  | "unapplied_cash"
  | "currency"
  | "payment_terms"
  | "dispute_flags";

export type IntegrationWritebackTarget =
  | "collection_statuses"
  | "notes"
  | "promise_to_pay"
  | "applied_cash"
  | "dispute_status";

export type IntegrationCapability =
  | `pull_${IntegrationSyncObject}`
  | `push_${IntegrationWritebackTarget}`
  | "extract_bir_invoice"
  | "parse_bank_statement"
  | "ingest_remittance";

export interface ConnectorDescriptor {
  provider: IntegrationProvider;
  kind: ConnectorKind;
  displayName: string;
  authStrategy: ConnectorAuthStrategy;
  capabilities: readonly IntegrationCapability[];
  notes?: string;
}

export interface ConnectorConnectionReference {
  connectionId: string;
  tenantId: string;
  provider: IntegrationProvider;
  credentialReference: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderEndpointConfig {
  baseUrl?: string;
  sandboxBaseUrl?: string;
  timeoutMs: number;
}

export interface ProviderCredentialEnvConfig {
  requiredKeys: readonly string[];
  optionalKeys?: readonly string[];
}

export interface ProviderEnvironmentConfig {
  provider: IntegrationProvider;
  authStrategy: ConnectorAuthStrategy;
  endpoints: ProviderEndpointConfig;
  credentials: ProviderCredentialEnvConfig;
  defaults?: Record<string, string | number | boolean>;
  notes?: string;
}

export interface FieldMappingRule {
  sourceField: string;
  targetField: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  transform?:
    | "identity"
    | "string"
    | "number"
    | "boolean"
    | "trim"
    | "uppercase"
    | "lowercase"
    | "iso_date";
}

export interface FieldMappingSet {
  mappingId: string;
  provider: IntegrationProvider;
  object: IntegrationSyncObject | IntegrationWritebackTarget;
  rules: readonly FieldMappingRule[];
}

export type IntegrationSyncDirection = "pull" | "push";

export type IntegrationSyncMode = "incremental" | "full" | "replay";

export type IntegrationSyncJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "retry_scheduled"
  | "failed";

export interface IntegrationRetryPolicy {
  maxAttempts: number;
  backoffSeconds: readonly number[];
}

export interface IntegrationSyncJob {
  jobId: string;
  tenantId: string;
  connectionId: string;
  provider: IntegrationProvider;
  direction: IntegrationSyncDirection;
  object: IntegrationSyncObject | IntegrationWritebackTarget;
  status: IntegrationSyncJobStatus;
  mode: IntegrationSyncMode;
  requestedAt: string;
  idempotencyKey?: string;
  cursor?: string;
  requestedBy: "system" | "user" | "automation";
  retryPolicy: IntegrationRetryPolicy;
  attemptCount: number;
  replayOfJobId?: string;
}

export interface IntegrationSyncLog {
  logId: string;
  jobId: string;
  provider: IntegrationProvider;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  status: "succeeded" | "retry_scheduled" | "failed";
  recordsRead: number;
  recordsWritten: number;
  duplicateCount: number;
  conflictCount: number;
  cursor?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface IntegrationRecord {
  object: IntegrationSyncObject;
  externalId: string;
  values: Record<string, unknown>;
  sourceFingerprint: string;
  updatedAt?: string;
  version?: string;
}

export interface WritebackRecord {
  target: IntegrationWritebackTarget;
  externalId: string;
  values: Record<string, unknown>;
  sourceFingerprint: string;
  expectedVersion?: string;
}

export interface ConflictDetectionResult {
  status: "none" | "conflict";
  reason?:
    | "remote_version_mismatch"
    | "duplicate_writeback"
    | "provider_rejected"
    | "stale_stage";
  fields?: string[];
  providerVersion?: string;
}

export interface ConnectorPullRequest {
  connection: ConnectorConnectionReference;
  job: IntegrationSyncJob;
  mapping?: FieldMappingSet;
}

export interface ConnectorPushRequest {
  connection: ConnectorConnectionReference;
  job: IntegrationSyncJob;
  stage: WritebackStage;
  mapping?: FieldMappingSet;
}

export interface ConnectorPullResult {
  records: IntegrationRecord[];
  nextCursor?: string;
  rawPayloadReference?: string;
}

export interface ConnectorPushResult {
  stageId: string;
  target: IntegrationWritebackTarget;
  externalId: string;
  status: "written" | "duplicate" | "conflict";
  providerVersion?: string;
  conflict?: ConflictDetectionResult;
}

export interface ConnectorError extends Error {
  code: "temporary_failure" | "rate_limited" | "conflict" | "fatal";
}

export interface IntegrationConnector {
  readonly descriptor: ConnectorDescriptor;
  pull(request: ConnectorPullRequest): Promise<ConnectorPullResult>;
  push(request: ConnectorPushRequest): Promise<ConnectorPushResult>;
}

export interface WritebackStage {
  stageId: string;
  tenantId: string;
  connectionId: string;
  provider: IntegrationProvider;
  target: IntegrationWritebackTarget;
  sourceEntityId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  expectedVersion?: string;
  status: "staged" | "pushed" | "conflict" | "failed";
  stagedAt: string;
  pushedAt?: string;
  conflict?: ConflictDetectionResult;
}

export interface IntegrationReplayRequest {
  sourceJobId: string;
  requestedAt: string;
  requestedBy: "system" | "user" | "automation";
  reason: string;
}

export const defaultIntegrationRetryPolicy: IntegrationRetryPolicy = {
  maxAttempts: 3,
  backoffSeconds: [30, 120, 600],
};

export const providerEnvironmentCatalog: Record<IntegrationProvider, ProviderEnvironmentConfig> = {
  netsuite: {
    provider: "netsuite",
    authStrategy: "oauth2",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: ["INTEGRATION_NETSUITE_CLIENT_ID", "INTEGRATION_NETSUITE_CLIENT_SECRET"],
      optionalKeys: ["INTEGRATION_NETSUITE_ACCOUNT_ID", "INTEGRATION_NETSUITE_BASE_URL"],
    },
  },
  sap_business_one: {
    provider: "sap_business_one",
    authStrategy: "basic_auth",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: [
        "INTEGRATION_SAP_B1_BASE_URL",
        "INTEGRATION_SAP_B1_COMPANY_DATABASE",
        "INTEGRATION_SAP_B1_USERNAME",
        "INTEGRATION_SAP_B1_PASSWORD",
      ],
      optionalKeys: ["INTEGRATION_SAP_B1_LANGUAGE"],
    },
    notes: "SAP Business One Service Layer connection for invoice, customer, and payment pulls.",
  },
  quickbooks_online: {
    provider: "quickbooks_online",
    authStrategy: "oauth2",
    endpoints: {
      timeoutMs: 30000,
      baseUrl: "https://quickbooks.api.intuit.com",
      sandboxBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
    },
    credentials: {
      requiredKeys: ["INTEGRATION_QUICKBOOKS_CLIENT_ID", "INTEGRATION_QUICKBOOKS_CLIENT_SECRET"],
      optionalKeys: [
        "INTEGRATION_QUICKBOOKS_REALM_ID",
        "INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI",
        "INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT",
      ],
    },
  },
  xero: {
    provider: "xero",
    authStrategy: "oauth2",
    endpoints: {
      timeoutMs: 30000,
      baseUrl: "https://api.xero.com",
    },
    credentials: {
      requiredKeys: ["INTEGRATION_XERO_CLIENT_ID", "INTEGRATION_XERO_CLIENT_SECRET"],
      optionalKeys: ["INTEGRATION_XERO_TENANT_ID"],
    },
  },
  zoho_books: {
    provider: "zoho_books",
    authStrategy: "oauth2",
    endpoints: {
      timeoutMs: 30000,
      baseUrl: "https://www.zohoapis.com/books/v3",
    },
    credentials: {
      requiredKeys: ["INTEGRATION_ZOHO_CLIENT_ID", "INTEGRATION_ZOHO_CLIENT_SECRET"],
      optionalKeys: ["INTEGRATION_ZOHO_ORGANIZATION_ID"],
    },
  },
  odoo: {
    provider: "odoo",
    authStrategy: "basic_auth",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: [
        "INTEGRATION_ODOO_BASE_URL",
        "INTEGRATION_ODOO_DATABASE",
        "INTEGRATION_ODOO_USERNAME",
        "INTEGRATION_ODOO_PASSWORD",
      ],
      optionalKeys: [
        "INTEGRATION_ODOO_COMPANY_ID",
        "INTEGRATION_ODOO_DEFAULT_JOURNAL_ID",
        "INTEGRATION_ODOO_DEFAULT_PRODUCT_ID",
      ],
    },
    notes: "Odoo JSON-RPC invoice CRUD and guarded import path.",
  },
  dear_erp: {
    provider: "dear_erp",
    authStrategy: "api_key",
    endpoints: {
      timeoutMs: 30000,
      baseUrl: "https://inventory.dearsystems.com/ExternalApi/v2",
    },
    credentials: {
      requiredKeys: ["INTEGRATION_DEAR_ACCOUNT_ID", "INTEGRATION_DEAR_API_KEY"],
    },
  },
  google_sheets: {
    provider: "google_sheets",
    authStrategy: "service_account",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: [
        "INTEGRATION_GOOGLE_SHEETS_CLIENT_EMAIL",
        "INTEGRATION_GOOGLE_SHEETS_PRIVATE_KEY",
      ],
      optionalKeys: ["INTEGRATION_GOOGLE_SHEETS_SPREADSHEET_ID"],
    },
    notes: "MVP path is import-only and typically full or cursor-based sheet reads.",
  },
  email_inbox: {
    provider: "email_inbox",
    authStrategy: "basic_auth",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: [
        "INTEGRATION_EMAIL_HOST",
        "INTEGRATION_EMAIL_USERNAME",
        "INTEGRATION_EMAIL_PASSWORD",
      ],
      optionalKeys: ["INTEGRATION_EMAIL_PORT", "INTEGRATION_EMAIL_MAILBOX"],
    },
    notes: "Inbox connector is scoped to import and monitoring workflows, not outbound email delivery.",
  },
  yield: {
    provider: "yield",
    authStrategy: "service_account",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: ["INTEGRATION_YIELD_PROJECT_ID"],
      optionalKeys: ["INTEGRATION_YIELD_REGION"],
    },
  },
  perfios: {
    provider: "perfios",
    authStrategy: "api_key",
    endpoints: {
      timeoutMs: 30000,
    },
    credentials: {
      requiredKeys: ["INTEGRATION_PERFIOS_API_KEY"],
      optionalKeys: ["INTEGRATION_PERFIOS_BASE_URL"],
    },
    notes: "Perfios remains an adapter contract until tenant credentials and payload guarantees are available.",
  },
};
