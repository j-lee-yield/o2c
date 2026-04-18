import {
  type ActorContext,
  type AuditMetadata,
  type DomainEntity,
  evolveEntityMetadata
} from "./types.js";

export type TerminalOverridePolicy =
  | "admin_manual_rollback"
  | "admin_manual_correction"
  | "admin_manual_reopen";

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

export type TransitionGuard<TEntity, TState extends string> = (
  entity: TEntity,
  context: TransitionContext,
  nextState: TState
) => void;

type GuardMap<TEntity, TState extends string> = Partial<
  Record<TState, Partial<Record<TState, TransitionGuard<TEntity, TState>[]>>>
>;

export interface StateMachineDefinition<TEntity extends StatefulEntity<TState>, TState extends string> {
  name: string;
  transitions: Record<TState, readonly TState[]>;
  terminalStates: readonly TState[];
  terminalOverridePolicy: TerminalOverridePolicy;
  guards?: GuardMap<TEntity, TState>;
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export class TransitionService<TEntity extends StatefulEntity<TState>, TState extends string> {
  constructor(
    private readonly definition: StateMachineDefinition<TEntity, TState>,
    private readonly auditHook?: TransitionAuditHook<TState>
  ) {}

  canTransition(entity: TEntity, nextState: TState): boolean {
    return this.definition.transitions[entity.state]?.includes(nextState) ?? false;
  }

  transition(entity: TEntity, nextState: TState, context: TransitionContext): TEntity {
    const fromState = entity.state;
    const timestamp = context.occurredAt ?? new Date().toISOString();
    const allowedTargets = this.definition.transitions[fromState] ?? [];
    const isTerminal = this.definition.terminalStates.includes(fromState);
    const hasTerminalOverride =
      isTerminal &&
      context.actorRole === "admin" &&
      context.overridePolicy === this.definition.terminalOverridePolicy;

    if (!allowedTargets.includes(nextState) && !hasTerminalOverride) {
      throw new TransitionError(
        `Invalid ${this.definition.name} transition: ${fromState} -> ${nextState}`
      );
    }

    const guards = this.definition.guards?.[fromState]?.[nextState] ?? [];
    for (const guard of guards) {
      guard(entity, context, nextState);
    }

    const updatedEntity = {
      ...entity,
      state: nextState,
      ...evolveEntityMetadata(entity, {
        at: timestamp,
        actorId: context.actorId,
        actorRole: context.actorRole
      })
    } as TEntity;

    const auditEvent: TransitionAuditEvent<TState> = {
      machine: this.definition.name,
      entityId: entity.id,
      from: fromState,
      to: nextState,
      actorId: context.actorId,
      actorRole: context.actorRole,
      occurredAt: timestamp,
      ...(context.reason !== undefined ? { reason: context.reason } : {}),
      ...(context.metadata !== undefined ? { metadata: context.metadata } : {})
    };

    this.auditHook?.onTransition(auditEvent);

    return updatedEntity;
  }

  getTransitionMatrix(): Record<TState, readonly TState[]> {
    return this.definition.transitions;
  }

  getTerminalStates(): readonly TState[] {
    return this.definition.terminalStates;
  }
}

export class InMemoryTransitionAuditHook<TState extends string>
  implements TransitionAuditHook<TState>
{
  readonly events: TransitionAuditEvent<TState>[] = [];

  onTransition(event: TransitionAuditEvent<TState>): void {
    this.events.push(event);
  }
}
