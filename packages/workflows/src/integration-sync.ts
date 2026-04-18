import type { AuditLogger } from "@o2c/audit";
import type {
  AuditContext,
  ConnectorConnectionReference,
  ConnectorDescriptor,
  ConnectorPullRequest,
  ConnectorPullResult,
  ConnectorPushRequest,
  ConnectorPushResult,
  FieldMappingSet,
  IntegrationConnector,
  IntegrationProvider,
  IntegrationRecord,
  IntegrationReplayRequest,
  IntegrationSyncJob,
  IntegrationSyncLog,
  IntegrationSyncObject,
  IntegrationWritebackTarget,
  WritebackStage,
} from "@o2c/contracts";
import {
  defaultConnectorCatalog,
  defaultIntegrationRetryPolicy,
} from "@o2c/contracts";

export class ConnectorNotRegisteredError extends Error {
  constructor(provider: IntegrationProvider) {
    super(`No integration connector is registered for provider ${provider}.`);
    this.name = "ConnectorNotRegisteredError";
  }
}

export class FieldMappingRequiredValueMissingError extends Error {
  constructor(mappingId: string, sourceField: string, targetField: string) {
    super(
      `Field mapping ${mappingId} requires source field ${sourceField} before writing ${targetField}.`,
    );
    this.name = "FieldMappingRequiredValueMissingError";
  }
}

export class WritebackConflictDetectedError extends Error {
  constructor(stageId: string, reason: string) {
    super(`Writeback stage ${stageId} could not be applied: ${reason}.`);
    this.name = "WritebackConflictDetectedError";
  }
}

export class UnsupportedSyncCapabilityError extends Error {
  constructor(provider: IntegrationProvider, capability: string) {
    super(`Provider ${provider} does not support integration capability ${capability}.`);
    this.name = "UnsupportedSyncCapabilityError";
  }
}

export interface IntegrationJobStore {
  save(job: IntegrationSyncJob): Promise<void> | void;
  findByIdempotencyKey?(key: string): Promise<IntegrationSyncJob | undefined> | IntegrationSyncJob | undefined;
}

export interface IntegrationLogStore {
  append(log: IntegrationSyncLog): Promise<void> | void;
}

export interface IntegrationWritebackStageStore {
  save(stage: WritebackStage): Promise<void> | void;
}

export interface IdempotencyStore {
  has(key: string): Promise<boolean> | boolean;
  remember(key: string): Promise<void> | void;
}

export interface IntegrationSyncDependencies {
  auditLogger: AuditLogger;
  jobStore: IntegrationJobStore;
  logStore: IntegrationLogStore;
  stageStore: IntegrationWritebackStageStore;
  idempotencyStore: IdempotencyStore;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export interface PullJobExecutionResult {
  job: IntegrationSyncJob;
  log: IntegrationSyncLog;
  mappedRecords: IntegrationRecord[];
  nextCursor?: string;
}

export interface PushJobExecutionResult {
  job: IntegrationSyncJob;
  log: IntegrationSyncLog;
  stage: WritebackStage;
  connectorResult?: ConnectorPushResult;
}

export interface CreateSyncJobInput {
  tenantId: string;
  connectionId: string;
  provider: IntegrationProvider;
  direction: "pull" | "push";
  object: IntegrationSyncObject | IntegrationWritebackTarget;
  idempotencyKey?: string;
  requestedAt?: string;
  requestedBy?: "system" | "user" | "automation";
  mode?: "incremental" | "full" | "replay";
  cursor?: string;
  retryPolicy?: IntegrationSyncJob["retryPolicy"];
  replayOfJobId?: string;
}

export interface StageWritebackInput {
  tenantId: string;
  connectionId: string;
  provider: IntegrationProvider;
  target: IntegrationWritebackTarget;
  sourceEntityId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  expectedVersion?: string;
  auditContext?: AuditContext;
}

export interface ProviderConnectorOverrides {
  pull?: (request: ConnectorPullRequest) => Promise<ConnectorPullResult>;
  push?: (request: ConnectorPushRequest) => Promise<ConnectorPushResult>;
}

export function applyFieldMappingSet(
  values: Record<string, unknown>,
  mapping: FieldMappingSet,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const rule of mapping.rules) {
    const sourceValue = readValue(values, rule.sourceField);
    const hasSourceValue = sourceValue !== undefined && sourceValue !== null && sourceValue !== "";
    const rawValue = hasSourceValue ? sourceValue : rule.defaultValue;

    if (
      rule.required &&
      (rawValue === undefined || rawValue === null || rawValue === "")
    ) {
      throw new FieldMappingRequiredValueMissingError(
        mapping.mappingId,
        rule.sourceField,
        rule.targetField,
      );
    }

    if (rawValue === undefined) {
      continue;
    }

    mapped[rule.targetField] = transformValue(rawValue, rule.transform ?? "identity");
  }

  return mapped;
}

export function createConnectorRegistry(connectors: readonly IntegrationConnector[]) {
  const registry = new Map(connectors.map((connector) => [connector.descriptor.provider, connector]));

  return Object.freeze({
    get(provider: IntegrationProvider) {
      const connector = registry.get(provider);

      if (!connector) {
        throw new ConnectorNotRegisteredError(provider);
      }

      return connector;
    },
    list() {
      return [...registry.values()];
    },
  });
}

export function createIntegrationSyncOrchestrator(
  connectors: readonly IntegrationConnector[],
  deps: IntegrationSyncDependencies,
) {
  const connectorRegistry = createConnectorRegistry(connectors);
  const now = deps.now ?? (() => new Date().toISOString());
  const idGenerator = deps.idGenerator ?? createCounterIdGenerator();

  const createSyncJob = async (input: CreateSyncJobInput): Promise<IntegrationSyncJob> => {
    assertProviderSupportsCapability(
      input.provider,
      input.direction === "pull" ? (`pull_${input.object}` as const) : (`push_${input.object}` as const),
    );
    const idempotencyKey = input.idempotencyKey ?? createSyncJobIdempotencyKey(input);
    const existingJob = await deps.jobStore.findByIdempotencyKey?.(idempotencyKey);
    if (existingJob) {
      return existingJob;
    }

    const job: IntegrationSyncJob = {
      jobId: idGenerator("sync_job"),
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      direction: input.direction,
      object: input.object,
      status: "pending",
      mode: input.mode ?? "incremental",
      requestedAt: input.requestedAt ?? now(),
      idempotencyKey,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      requestedBy: input.requestedBy ?? "automation",
      retryPolicy: input.retryPolicy ?? defaultIntegrationRetryPolicy,
      attemptCount: 0,
      ...(input.replayOfJobId ? { replayOfJobId: input.replayOfJobId } : {}),
    };

    await deps.jobStore.save(job);
    return job;
  };

  const stageWriteback = async (input: StageWritebackInput): Promise<WritebackStage> => {
    assertProviderSupportsCapability(input.provider, `push_${input.target}`);
    const payloadFingerprint = stableStringify(input.payload);
    const stage: WritebackStage = {
      stageId: idGenerator("writeback_stage"),
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      target: input.target,
      sourceEntityId: input.sourceEntityId,
      idempotencyKey:
        input.idempotencyKey ??
        `${input.provider}:${input.target}:${input.sourceEntityId}:${payloadFingerprint}`,
      payload: cloneRecord(input.payload),
      ...(input.expectedVersion ? { expectedVersion: input.expectedVersion } : {}),
      status: "staged",
      stagedAt: now(),
    };

    await deps.stageStore.save(stage);
    if (input.auditContext) {
      await deps.auditLogger.log(input.auditContext, {
        action: "integration.writeback_staged",
        entityId: stage.stageId,
        entityType: "writeback_stage",
        metadata: {
          provider: stage.provider,
          target: stage.target,
          sourceEntityId: stage.sourceEntityId,
        },
      });
    }
    return stage;
  };

  const replayJob = async (
    job: IntegrationSyncJob,
    request: Omit<IntegrationReplayRequest, "sourceJobId">,
  ): Promise<IntegrationSyncJob> =>
    createSyncJob({
      tenantId: job.tenantId,
      connectionId: job.connectionId,
      provider: job.provider,
      direction: job.direction,
      object: job.object,
      requestedAt: request.requestedAt,
      requestedBy: request.requestedBy,
      mode: "replay",
      ...(job.cursor ? { cursor: job.cursor } : {}),
      retryPolicy: job.retryPolicy,
      replayOfJobId: job.jobId,
    });

  const executePullJob = async (params: {
    job: IntegrationSyncJob;
    connection: ConnectorConnectionReference;
    auditContext: AuditContext;
    mapping?: FieldMappingSet;
  }): Promise<PullJobExecutionResult> => {
    const connector = connectorRegistry.get(params.job.provider);
    const attempt = params.job.attemptCount + 1;
    const startedAt = now();

    try {
      const result = await connector.pull({
        connection: params.connection,
        job: {
          ...params.job,
          status: "running",
          attemptCount: attempt,
        },
        ...(params.mapping ? { mapping: params.mapping } : {}),
      });
      const mappedRecords = result.records.map((record) => ({
        ...record,
        values: params.mapping ? applyFieldMappingSet(record.values, params.mapping) : record.values,
      }));
      const completedJob: IntegrationSyncJob = {
        ...params.job,
        status: "succeeded",
        attemptCount: attempt,
        ...(result.nextCursor ? { cursor: result.nextCursor } : params.job.cursor ? { cursor: params.job.cursor } : {}),
      };
      const log = createSyncLog({
        idGenerator,
        job: completedJob,
        attempt,
        startedAt,
        completedAt: now(),
        status: "succeeded",
        recordsRead: result.records.length,
        recordsWritten: mappedRecords.length,
        duplicateCount: 0,
        conflictCount: 0,
        ...((result.nextCursor ?? completedJob.cursor)
          ? { cursor: result.nextCursor ?? completedJob.cursor }
          : {}),
      });

      await deps.jobStore.save(completedJob);
      await deps.logStore.append(log);
      await deps.auditLogger.log(params.auditContext, {
        action: "integration.pull_succeeded",
        entityId: completedJob.jobId,
        entityType: "integration_sync_job",
        metadata: {
          provider: completedJob.provider,
          object: completedJob.object,
          attempt,
          recordsRead: result.records.length,
          recordsWritten: mappedRecords.length,
        },
      });

      return {
        job: completedJob,
        log,
        mappedRecords,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      };
    } catch (error) {
      const { job, log } = createFailureArtifacts({
        error,
        job: params.job,
        attempt,
        startedAt,
        idGenerator,
      });

      await deps.jobStore.save(job);
      await deps.logStore.append(log);
      await deps.auditLogger.log(params.auditContext, {
        action: "integration.pull_failed",
        entityId: job.jobId,
        entityType: "integration_sync_job",
        metadata: {
          provider: job.provider,
          object: job.object,
          attempt,
          status: job.status,
        },
      });

      throw error;
    }
  };

  const executePushJob = async (params: {
    job: IntegrationSyncJob;
    connection: ConnectorConnectionReference;
    stage: WritebackStage;
    auditContext: AuditContext;
    mapping?: FieldMappingSet;
  }): Promise<PushJobExecutionResult> => {
    const connector = connectorRegistry.get(params.job.provider);
    const attempt = params.job.attemptCount + 1;
    const startedAt = now();

    if (await deps.idempotencyStore.has(params.stage.idempotencyKey)) {
      const completedJob: IntegrationSyncJob = {
        ...params.job,
        status: "succeeded",
        attemptCount: attempt,
      };
      const stage: WritebackStage = {
        ...params.stage,
        status: "pushed",
        pushedAt: params.stage.pushedAt ?? now(),
      };
      const log = createSyncLog({
        idGenerator,
        job: completedJob,
        attempt,
        startedAt,
        completedAt: now(),
        status: "succeeded",
        recordsRead: 1,
        recordsWritten: 0,
        duplicateCount: 1,
        conflictCount: 0,
      });

      await deps.jobStore.save(completedJob);
      await deps.stageStore.save(stage);
      await deps.logStore.append(log);
      await deps.auditLogger.log(params.auditContext, {
        action: "integration.push_deduplicated",
        entityId: completedJob.jobId,
        entityType: "integration_sync_job",
        metadata: {
          provider: completedJob.provider,
          target: params.stage.target,
          attempt,
        },
      });

      return {
        job: completedJob,
        log,
        stage,
      };
    }

    try {
      const stagedPayload = params.mapping
        ? applyFieldMappingSet(params.stage.payload, params.mapping)
        : params.stage.payload;
      const stageForPush: WritebackStage = {
        ...params.stage,
        payload: stagedPayload,
      };
      const connectorResult = await connector.push({
        connection: params.connection,
        job: {
          ...params.job,
          status: "running",
          attemptCount: attempt,
        },
        stage: stageForPush,
        ...(params.mapping ? { mapping: params.mapping } : {}),
      });

      if (connectorResult.status === "conflict") {
        const stage: WritebackStage = {
          ...stageForPush,
          status: "conflict",
          ...(connectorResult.conflict ? { conflict: connectorResult.conflict } : {}),
        };
        const failedJob: IntegrationSyncJob = {
          ...params.job,
          status: "failed",
          attemptCount: attempt,
        };
        const log = createSyncLog({
          idGenerator,
          job: failedJob,
          attempt,
          startedAt,
          completedAt: now(),
          status: "failed",
          recordsRead: 1,
          recordsWritten: 0,
          duplicateCount: 0,
          conflictCount: 1,
          ...(connectorResult.conflict?.reason
            ? { errorCode: connectorResult.conflict.reason }
            : {}),
          errorMessage: "Provider reported a writeback conflict.",
        });

        await deps.jobStore.save(failedJob);
        await deps.stageStore.save(stage);
        await deps.logStore.append(log);
        await deps.auditLogger.log(params.auditContext, {
          action: "integration.push_conflict",
          entityId: failedJob.jobId,
          entityType: "integration_sync_job",
          metadata: {
            provider: failedJob.provider,
            target: params.stage.target,
            attempt,
          },
        });

        throw new WritebackConflictDetectedError(
          stage.stageId,
          connectorResult.conflict?.reason ?? "provider_rejected",
        );
      }

      const completedJob: IntegrationSyncJob = {
        ...params.job,
        status: "succeeded",
        attemptCount: attempt,
      };
      const stage: WritebackStage = {
        ...stageForPush,
        status: "pushed",
        pushedAt: now(),
      };
      const log = createSyncLog({
        idGenerator,
        job: completedJob,
        attempt,
        startedAt,
        completedAt: now(),
        status: "succeeded",
        recordsRead: 1,
        recordsWritten: 1,
        duplicateCount: connectorResult.status === "duplicate" ? 1 : 0,
        conflictCount: 0,
      });

      await deps.idempotencyStore.remember(stage.idempotencyKey);
      await deps.jobStore.save(completedJob);
      await deps.stageStore.save(stage);
      await deps.logStore.append(log);
      await deps.auditLogger.log(params.auditContext, {
        action: "integration.push_succeeded",
        entityId: completedJob.jobId,
        entityType: "integration_sync_job",
        metadata: {
          provider: completedJob.provider,
          target: params.stage.target,
          attempt,
          connectorStatus: connectorResult.status,
        },
      });

      return {
        job: completedJob,
        log,
        stage,
        connectorResult,
      };
    } catch (error) {
      if (error instanceof WritebackConflictDetectedError) {
        throw error;
      }

      const { job, log } = createFailureArtifacts({
        error,
        job: params.job,
        attempt,
        startedAt,
        idGenerator,
      });

      await deps.jobStore.save(job);
      await deps.logStore.append(log);
      await deps.auditLogger.log(params.auditContext, {
        action: "integration.push_failed",
        entityId: job.jobId,
        entityType: "integration_sync_job",
        metadata: {
          provider: job.provider,
          target: params.stage.target,
          attempt,
          status: job.status,
        },
      });

      throw error;
    }
  };

  return Object.freeze({
    createSyncJob,
    executePullJob,
    stageWriteback,
    executePushJob,
    replayJob,
    connectorRegistry,
  });
}

export function createMockIntegrationConnector(params: {
  provider: IntegrationProvider;
  pullResult?: ConnectorPullResult;
  pushResult?: ConnectorPushResult;
  onPull?: (request: ConnectorPullRequest) => Promise<ConnectorPullResult>;
  onPush?: (request: ConnectorPushRequest) => Promise<ConnectorPushResult>;
}): IntegrationConnector {
  return createProviderConnector(params.provider, {
    pull:
      params.onPull ??
      (async () =>
        params.pullResult ?? {
          records: [],
        }),
    push:
      params.onPush ??
      (async (request) =>
        params.pushResult ?? {
          stageId: request.stage.stageId,
          target: request.stage.target,
          externalId: request.stage.sourceEntityId,
          status: "written",
        }),
  });
}

export const createQuickBooksConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("quickbooks_online", overrides);

export const createXeroConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("xero", overrides);

export const createZohoBooksConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("zoho_books", overrides);

export const createDearErpConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("dear_erp", overrides);

export const createGoogleSheetsConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("google_sheets", overrides);

export const createEmailInboxConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("email_inbox", overrides);

export const createPerfiosConnector = (overrides: ProviderConnectorOverrides = {}) =>
  createProviderConnector("perfios", overrides);

export class InMemoryIntegrationJobStore implements IntegrationJobStore {
  readonly jobs = new Map<string, IntegrationSyncJob>();
  readonly jobsByIdempotencyKey = new Map<string, IntegrationSyncJob>();

  save(job: IntegrationSyncJob): void {
    this.jobs.set(job.jobId, job);
    if (job.idempotencyKey) {
      this.jobsByIdempotencyKey.set(job.idempotencyKey, job);
    }
  }

  findByIdempotencyKey(key: string): IntegrationSyncJob | undefined {
    return this.jobsByIdempotencyKey.get(key);
  }
}

export class InMemoryIntegrationLogStore implements IntegrationLogStore {
  readonly logs: IntegrationSyncLog[] = [];

  append(log: IntegrationSyncLog): void {
    this.logs.push(log);
  }
}

export class InMemoryIntegrationWritebackStageStore implements IntegrationWritebackStageStore {
  readonly stages = new Map<string, WritebackStage>();

  save(stage: WritebackStage): void {
    this.stages.set(stage.stageId, stage);
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly keys = new Set<string>();

  has(key: string): boolean {
    return this.keys.has(key);
  }

  remember(key: string): void {
    this.keys.add(key);
  }
}

function createProviderConnector(
  provider: IntegrationProvider,
  overrides: ProviderConnectorOverrides,
): IntegrationConnector {
  const descriptor = findConnectorDescriptor(provider);

  return {
    descriptor,
    pull:
      overrides.pull ??
      (async () => ({
        records: [],
      })),
    push:
      overrides.push ??
      (async (request) => ({
        stageId: request.stage.stageId,
        target: request.stage.target,
        externalId: request.stage.sourceEntityId,
        status: "written",
      })),
  };
}

function findConnectorDescriptor(provider: IntegrationProvider): ConnectorDescriptor {
  const descriptor = defaultConnectorCatalog.find((candidate) => candidate.provider === provider);

  if (!descriptor) {
    throw new ConnectorNotRegisteredError(provider);
  }

  return descriptor;
}

function assertProviderSupportsCapability(
  provider: IntegrationProvider,
  capability: string,
): void {
  const descriptor = findConnectorDescriptor(provider);
  if (!descriptor.capabilities.includes(capability as ConnectorDescriptor["capabilities"][number])) {
    throw new UnsupportedSyncCapabilityError(provider, capability);
  }
}

function createSyncJobIdempotencyKey(input: CreateSyncJobInput): string {
  return stableStringify({
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    provider: input.provider,
    direction: input.direction,
    object: input.object,
    mode: input.mode ?? "incremental",
    cursor: input.cursor ?? null,
    replayOfJobId: input.replayOfJobId ?? null,
  });
}

function createFailureArtifacts(params: {
  error: unknown;
  job: IntegrationSyncJob;
  attempt: number;
  startedAt: string;
  idGenerator: (prefix: string) => string;
}) {
  const errorCode = readErrorCode(params.error);
  const retryable =
    (errorCode === "temporary_failure" || errorCode === "rate_limited") &&
    params.attempt < params.job.retryPolicy.maxAttempts;
  const job: IntegrationSyncJob = {
    ...params.job,
    status: retryable ? "retry_scheduled" : "failed",
    attemptCount: params.attempt,
  };
  const log = createSyncLog({
    idGenerator: params.idGenerator,
    job,
    attempt: params.attempt,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    status: retryable ? "retry_scheduled" : "failed",
    recordsRead: 0,
    recordsWritten: 0,
    duplicateCount: 0,
    conflictCount: 0,
    ...(errorCode ? { errorCode } : {}),
    errorMessage: params.error instanceof Error ? params.error.message : "Unknown connector failure",
    ...(job.cursor ? { cursor: job.cursor } : {}),
  });

  return { job, log };
}

function createSyncLog(params: {
  idGenerator: (prefix: string) => string;
  job: IntegrationSyncJob;
  attempt: number;
  startedAt: string;
  completedAt: string;
  status: IntegrationSyncLog["status"];
  recordsRead: number;
  recordsWritten: number;
  duplicateCount: number;
  conflictCount: number;
  cursor?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  return {
    logId: params.idGenerator("sync_log"),
    jobId: params.job.jobId,
    provider: params.job.provider,
    attempt: params.attempt,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    status: params.status,
    recordsRead: params.recordsRead,
    recordsWritten: params.recordsWritten,
    duplicateCount: params.duplicateCount,
    conflictCount: params.conflictCount,
    ...(params.cursor ? { cursor: params.cursor } : {}),
    ...(params.errorCode ? { errorCode: params.errorCode } : {}),
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
  } satisfies IntegrationSyncLog;
}

function readValue(values: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, values);
}

function transformValue(value: unknown, transform: NonNullable<FieldMappingSet["rules"][number]["transform"]>) {
  switch (transform) {
    case "identity":
      return value;
    case "string":
      return String(value);
    case "number":
      return Number(value);
    case "boolean":
      return Boolean(value);
    case "trim":
      return String(value).trim();
    case "uppercase":
      return String(value).toUpperCase();
    case "lowercase":
      return String(value).toLowerCase();
    case "iso_date":
      return new Date(String(value)).toISOString();
    default:
      return value;
  }
}

function createCounterIdGenerator() {
  let counter = 0;
  return (prefix: string) => `${prefix}_${++counter}`;
}

function readErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return undefined;
}

function cloneRecord(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function stableStringify(input: Record<string, unknown>) {
  return JSON.stringify(sortRecord(input));
}

function sortRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      const value = input[key];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        sorted[key] = sortRecord(value as Record<string, unknown>);
      } else {
        sorted[key] = value;
      }

      return sorted;
    }, {});
}
