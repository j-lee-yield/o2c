export class InMemoryAuditLogger {
    events = [];
    async log(context, event) {
        this.events.push({ context, event });
    }
}
export class InMemoryImmutableActivityLogStore {
    entries = [];
    append(entry) {
        this.entries.push(entry);
    }
}
export function createImmutableActivityLogEntry(input) {
    const entry = {
        ...input,
        metadata: cloneJson(input.metadata) ?? {},
        ...(input.before !== undefined ? { before: cloneJson(input.before) } : {}),
        ...(input.after !== undefined ? { after: cloneJson(input.after) } : {}),
    };
    return deepFreeze(entry);
}
export function createActivityLogDomainHelpers({ store, idGenerator = createCounterIdGenerator("activity"), now = () => new Date().toISOString(), }) {
    const append = (input) => {
        const entry = createImmutableActivityLogEntry({
            id: idGenerator(),
            occurredAt: now(),
            ...input,
        });
        store.append(entry);
        return entry;
    };
    const recordMutation = ({ actor, action, entityType, entityId, before, metadata, mutate, serializeAfter = defaultSerialize, }) => {
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
export function createCounterIdGenerator(prefix) {
    let counter = 0;
    return () => `${prefix}_${++counter}`;
}
function cloneJson(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
function deepFreeze(value) {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
    }
    Object.freeze(value);
    for (const nestedValue of Object.values(value)) {
        deepFreeze(nestedValue);
    }
    return value;
}
function defaultSerialize(value) {
    return cloneJson(value);
}
//# sourceMappingURL=activity-log.js.map