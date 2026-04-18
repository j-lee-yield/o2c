export interface AuditContext {
  actorId: string;
  actorType: "user" | "system" | "automation";
  correlationId: string;
  occurredAt: string;
}

export type ActivityRole = "ar_collector" | "ar_manager" | "controller" | "admin";

export interface AuditEvent {
  action: string;
  entityId: string;
  entityType: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditLogger {
  log(context: AuditContext, event: AuditEvent): Promise<void>;
}

export type ActivitySnapshot = Record<string, unknown> | null;

export interface ImmutableActivityLogEntry {
  id: string;
  occurredAt: string;
  action: string;
  actorId: string;
  actorRole: ActivityRole | "system";
  entityType: string;
  entityId: string;
  before?: ActivitySnapshot;
  after?: ActivitySnapshot;
  metadata: Record<string, unknown>;
}

export interface ActivityActor {
  id: string;
  role: ActivityRole | "system";
}

export interface ActivityMutationInput<TAfter> {
  actor: ActivityActor;
  action: string;
  entityType: string;
  entityId: string;
  before?: ActivitySnapshot;
  metadata?: Record<string, unknown>;
  mutate: () => TAfter;
  serializeAfter?: (after: TAfter) => Record<string, unknown>;
}

export interface ImmutableActivityLogStore {
  append(entry: ImmutableActivityLogEntry): void | Promise<void>;
}

export class InMemoryAuditLogger implements AuditLogger {
  readonly events: Array<{ context: AuditContext; event: AuditEvent }> = [];

  async log(context: AuditContext, event: AuditEvent): Promise<void> {
    this.events.push({ context, event });
  }
}

export class InMemoryImmutableActivityLogStore implements ImmutableActivityLogStore {
  readonly entries: ImmutableActivityLogEntry[] = [];

  append(entry: ImmutableActivityLogEntry): void {
    this.entries.push(entry);
  }
}

export function createImmutableActivityLogEntry(input: ImmutableActivityLogEntry) {
  const entry: ImmutableActivityLogEntry = {
    ...input,
    metadata: cloneJson(input.metadata) ?? {},
    ...(input.before !== undefined ? { before: cloneJson(input.before) } : {}),
    ...(input.after !== undefined ? { after: cloneJson(input.after) } : {}),
  };

  return deepFreeze(entry);
}

export function createActivityLogDomainHelpers({
  store,
  idGenerator = createCounterIdGenerator("activity"),
  now = () => new Date().toISOString(),
}: {
  store: ImmutableActivityLogStore;
  idGenerator?: () => string;
  now?: () => string;
}) {
  const append = (input: Omit<ImmutableActivityLogEntry, "id" | "occurredAt">) => {
    const entry = createImmutableActivityLogEntry({
      id: idGenerator(),
      occurredAt: now(),
      ...input,
    });

    store.append(entry);
    return entry;
  };

  const recordMutation = <TAfter>({
    actor,
    action,
    entityType,
    entityId,
    before,
    metadata,
    mutate,
    serializeAfter = defaultSerialize,
  }: ActivityMutationInput<TAfter>) => {
    const after = mutate();
    const entry = append({
      actorId: actor.id,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      metadata: metadata ?? {},
      ...(before !== undefined ? { before } : {}),
      after: serializeAfter(after),
    });

    return { result: after, entry };
  };

  return Object.freeze({
    append,
    recordMutation,
  });
}

export function createCounterIdGenerator(prefix: string) {
  let counter = 0;
  return () => `${prefix}_${++counter}`;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return value;
}

function defaultSerialize<TAfter>(value: TAfter): Record<string, unknown> {
  return cloneJson(value) as Record<string, unknown>;
}
