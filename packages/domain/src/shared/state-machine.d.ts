import { type ActorContext, type AuditMetadata, type DomainEntity } from "./types.js";
export type TerminalOverridePolicy = "admin_manual_rollback" | "admin_manual_correction" | "admin_manual_reopen";
export interface TransitionContext extends ActorContext {
    occurredAt?: string;
    reason?: string;
    metadata?: AuditMetadata;
    overridePolicy?: TerminalOverridePolicy;
}
export interface StatefulEntity<TState extends string> extends DomainEntity {
    state: TState;
}
export interface TransitionAuditEvent<TState extends string> {
    machine: string;
    entityId: string;
    from: TState;
    to: TState;
    actorId: string;
    actorRole: ActorContext["actorRole"];
    occurredAt: string;
    reason?: string;
    metadata?: AuditMetadata;
}
export interface TransitionAuditHook<TState extends string> {
    onTransition(event: TransitionAuditEvent<TState>): void;
}
export type TransitionGuard<TEntity, TState extends string> = (entity: TEntity, context: TransitionContext, nextState: TState) => void;
type GuardMap<TEntity, TState extends string> = Partial<Record<TState, Partial<Record<TState, TransitionGuard<TEntity, TState>[]>>>>;
export interface StateMachineDefinition<TEntity extends StatefulEntity<TState>, TState extends string> {
    name: string;
    transitions: Record<TState, readonly TState[]>;
    terminalStates: readonly TState[];
    terminalOverridePolicy: TerminalOverridePolicy;
    guards?: GuardMap<TEntity, TState>;
}
export declare class TransitionError extends Error {
    constructor(message: string);
}
export declare class TransitionService<TEntity extends StatefulEntity<TState>, TState extends string> {
    private readonly definition;
    private readonly auditHook?;
    constructor(definition: StateMachineDefinition<TEntity, TState>, auditHook?: TransitionAuditHook<TState> | undefined);
    canTransition(entity: TEntity, nextState: TState): boolean;
    transition(entity: TEntity, nextState: TState, context: TransitionContext): TEntity;
    getTransitionMatrix(): Record<TState, readonly TState[]>;
    getTerminalStates(): readonly TState[];
}
export declare class InMemoryTransitionAuditHook<TState extends string> implements TransitionAuditHook<TState> {
    readonly events: TransitionAuditEvent<TState>[];
    onTransition(event: TransitionAuditEvent<TState>): void;
}
export {};
//# sourceMappingURL=state-machine.d.ts.map