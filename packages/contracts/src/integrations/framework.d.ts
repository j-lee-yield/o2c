export type IntegrationProvider = "netsuite" | "sap_business_one" | "quickbooks_online" | "xero" | "zoho_books" | "odoo" | "dear_erp" | "google_sheets" | "email_inbox" | "yield" | "perfios";
export type ConnectorKind = "erp" | "accounting" | "spreadsheet" | "email" | "document_ai" | "bank_parser";
export type ConnectorAuthStrategy = "oauth2" | "api_key" | "service_account" | "basic_auth" | "none";
export type IntegrationSyncObject = "customers" | "contacts" | "invoices" | "invoice_lines" | "payments" | "unapplied_cash" | "currency" | "payment_terms" | "dispute_flags";
export type IntegrationWritebackTarget = "collection_statuses" | "notes" | "promise_to_pay" | "applied_cash" | "dispute_status";
export type IntegrationCapability = `pull_${IntegrationSyncObject}` | `push_${IntegrationWritebackTarget}` | "extract_bir_invoice" | "parse_bank_statement" | "ingest_remittance";
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
    transform?: "identity" | "string" | "number" | "boolean" | "trim" | "uppercase" | "lowercase" | "iso_date";
}
export interface FieldMappingSet {
    mappingId: string;
    provider: IntegrationProvider;
    object: IntegrationSyncObject | IntegrationWritebackTarget;
    rules: readonly FieldMappingRule[];
}
export type IntegrationSyncDirection = "pull" | "push";
export type IntegrationSyncMode = "incremental" | "full" | "replay";
export type IntegrationSyncJobStatus = "pending" | "running" | "succeeded" | "retry_scheduled" | "failed";
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
    reason?: "remote_version_mismatch" | "duplicate_writeback" | "provider_rejected" | "stale_stage";
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
export declare const defaultIntegrationRetryPolicy: IntegrationRetryPolicy;
export declare const providerEnvironmentCatalog: Record<IntegrationProvider, ProviderEnvironmentConfig>;
//# sourceMappingURL=framework.d.ts.map
