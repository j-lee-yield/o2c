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
export declare class InMemoryAuditLogger implements AuditLogger {
    readonly events: Array<{
        context: AuditContext;
        event: AuditEvent;
    }>;
    log(context: AuditContext, event: AuditEvent): Promise<void>;
}
export declare class InMemoryImmutableActivityLogStore implements ImmutableActivityLogStore {
    readonly entries: ImmutableActivityLogEntry[];
    append(entry: ImmutableActivityLogEntry): void;
}
export declare function createImmutableActivityLogEntry(input: ImmutableActivityLogEntry): ImmutableActivityLogEntry;
export declare function createActivityLogDomainHelpers({ store, idGenerator, now, }: {
    store: ImmutableActivityLogStore;
    idGenerator?: () => string;
    now?: () => string;
}): Readonly<{
    append: (input: Omit<ImmutableActivityLogEntry, "id" | "occurredAt">) => ImmutableActivityLogEntry;
    recordMutation: <TAfter>({ actor, action, entityType, entityId, before, metadata, mutate, serializeAfter, }: ActivityMutationInput<TAfter>) => {
        result: TAfter;
        entry: ImmutableActivityLogEntry;
    };
}>;
export declare function createCounterIdGenerator(prefix: string): () => string;
//# sourceMappingURL=activity-log.d.ts.map