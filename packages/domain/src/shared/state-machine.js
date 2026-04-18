import { evolveEntityMetadata } from "./types.js";
export class TransitionError extends Error {
    constructor(message) {
        super(message);
        this.name = "TransitionError";
    }
}
export class TransitionService {
    definition;
    auditHook;
    constructor(definition, auditHook) {
        this.definition = definition;
        this.auditHook = auditHook;
    }
    canTransition(entity, nextState) {
        return this.definition.transitions[entity.state]?.includes(nextState) ?? false;
    }
    transition(entity, nextState, context) {
        const fromState = entity.state;
        const timestamp = context.occurredAt ?? new Date().toISOString();
        const allowedTargets = this.definition.transitions[fromState] ?? [];
        const isTerminal = this.definition.terminalStates.includes(fromState);
        const hasTerminalOverride = isTerminal &&
            context.actorRole === "admin" &&
            context.overridePolicy === this.definition.terminalOverridePolicy;
        if (!allowedTargets.includes(nextState) && !hasTerminalOverride) {
            throw new TransitionError(`Invalid ${this.definition.name} transition: ${fromState} -> ${nextState}`);
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
        };
        const auditEvent = {
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
    getTransitionMatrix() {
        return this.definition.transitions;
    }
    getTerminalStates() {
        return this.definition.terminalStates;
    }
}
export class InMemoryTransitionAuditHook {
    events = [];
    onTransition(event) {
        this.events.push(event);
    }
}
//# sourceMappingURL=state-machine.js.map