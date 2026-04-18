import { describe, expect, it } from "vitest";

import {
  InMemoryImmutableActivityLogStore,
  createActivityLogDomainHelpers,
} from "./index.js";

describe("immutable activity log integrity", () => {
  it("stores deep-frozen before and after snapshots", () => {
    const store = new InMemoryImmutableActivityLogStore();
    const helpers = createActivityLogDomainHelpers({
      store,
      now: () => "2026-03-26T00:00:00.000Z",
      idGenerator: () => "activity_1",
    });

    const before = { status: "draft", payload: { nested: { invoiceId: "inv_1" } } };
    const after = { status: "pending_approval", payload: { nested: { invoiceId: "inv_1" } } };

    const entry = helpers.append({
      actorId: "collector_1",
      actorRole: "ar_collector",
      action: "approval.request.submitted",
      entityType: "approval_request",
      entityId: "approval_1",
      before,
      after,
      metadata: { source: "test" },
    });

    before.payload.nested.invoiceId = "tampered";

    expect(store.entries).toHaveLength(1);
    expect(entry.before?.payload).toEqual({ nested: { invoiceId: "inv_1" } });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.after?.payload as object)).toBe(true);
    expect(() => {
      (entry.metadata as Record<string, unknown>).source = "changed";
    }).toThrow(TypeError);
  });

  it("records workflow mutations through the domain helper", () => {
    const store = new InMemoryImmutableActivityLogStore();
    const helpers = createActivityLogDomainHelpers({
      store,
      now: () => "2026-03-26T00:00:00.000Z",
      idGenerator: () => "activity_2",
    });

    const outcome = helpers.recordMutation({
      actor: { id: "controller_1", role: "controller" },
      action: "approval.request.reopened",
      entityType: "approval_request",
      entityId: "approval_1",
      before: { status: "approved" },
      metadata: { reason: "manual override" },
      mutate: () => ({ status: "reopened", reopenedFromStatus: "approved" }),
    });

    expect(outcome.result).toEqual({
      status: "reopened",
      reopenedFromStatus: "approved",
    });
    expect(store.entries[0]?.action).toBe("approval.request.reopened");
    expect(store.entries[0]?.after).toEqual({
      status: "reopened",
      reopenedFromStatus: "approved",
    });
  });
});
