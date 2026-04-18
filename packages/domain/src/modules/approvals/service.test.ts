import { describe, expect, it } from "vitest";

import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import { AuthorizationError } from "@o2c/auth";
import { createActivityLogDomainHelpers } from "@o2c/audit";

import {
  ApprovalEditNotAllowedError,
  ApprovalPolicyViolationError,
  ApprovalReopenNotAllowedError,
} from "./errors.js";
import { ApprovalRequestService } from "./service.js";

function createHarness() {
  const store = new InMemoryImmutableActivityLogStore();
  const audit = createActivityLogDomainHelpers({
    store,
    now: () => "2026-03-26T00:00:00.000Z",
  });

  const service = new ApprovalRequestService({
    audit,
    now: () => "2026-03-26T00:00:00.000Z",
    idGenerator: () => "approval_1",
  });

  return { service, store };
}

function createApprovedRequest(service: ApprovalRequestService, principal: Principal) {
  const created = service.create(principal, {
    requestType: "cash_application_adjustment",
    payload: { paymentId: "payment_1" },
  });
  const submitted = service.submit(principal, created);
  return service.decide(
    { id: "manager_1", roles: ["ar_manager"] },
    submitted,
    "approved"
  );
}

describe("manual reopen permissions", () => {
  it("allows only controller and admin to reopen terminal approvals", () => {
    const { service } = createHarness();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const approval = createApprovedRequest(service, collector);

    expect(() =>
      service.manualReopen(collector, approval, { reason: "retry" })
    ).toThrowError(AuthorizationError);

    expect(() =>
      service.manualReopen(
        { id: "manager_2", roles: ["ar_manager"] },
        approval,
        { reason: "retry" }
      )
    ).toThrowError(AuthorizationError);

    const controllerReopen = service.manualReopen(
      { id: "controller_1", roles: ["controller"] },
      approval,
      { reason: "downstream fix" }
    );
    const adminReopen = service.manualReopen(
      { id: "admin_1", roles: ["admin"] },
      approval,
      { reason: "admin override" }
    );

    expect(controllerReopen.status).toBe("reopened");
    expect(controllerReopen.reopenedFromStatus).toBe("approved");
    expect(adminReopen.status).toBe("reopened");
  });

  it("rejects manual reopen for non-terminal approvals", () => {
    const { service } = createHarness();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const approval = service.create(collector, {
      requestType: "cash_application_adjustment",
      payload: { paymentId: "payment_1" },
    });

    expect(() =>
      service.manualReopen(
        { id: "admin_1", roles: ["admin"] },
        approval,
        { reason: "should fail" }
      )
    ).toThrowError(ApprovalReopenNotAllowedError);
  });
});

describe("approval review and edit controls", () => {
  it("blocks review by the wrong assignee role", () => {
    const { service } = createHarness();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const created = service.create(collector, {
      requestType: "collections_outreach_review",
      assigneeRole: "controller",
      payload: { summary: "Controller review required." },
    });
    const submitted = service.submit(collector, created);

    expect(() =>
      service.decide({ id: "manager_1", roles: ["ar_manager"] }, submitted, "approved")
    ).toThrowError(ApprovalPolicyViolationError);

    const approved = service.decide(
      { id: "controller_1", roles: ["controller"] },
      submitted,
      "approved"
    );

    expect(approved.status).toBe("approved");
  });

  it("edits pending approvals back to draft for resubmission", () => {
    const { service, store } = createHarness();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const created = service.create(collector, {
      requestType: "collections_outreach_review",
      payload: { summary: "Initial summary." },
    });
    const submitted = service.submit(collector, created);
    const edited = service.edit(collector, submitted, {
      payload: { summary: "Updated summary." },
    });

    expect(edited.status).toBe("draft");
    expect(edited.currentStep).toBe("awaiting_resubmission");
    expect(edited.payload.summary).toBe("Updated summary.");
    expect(store.entries.at(-1)?.action).toBe("approval.request.edited");
  });

  it("rejects edits for terminal approvals", () => {
    const { service } = createHarness();
    const collector: Principal = { id: "collector_1", roles: ["ar_collector"] };
    const approval = createApprovedRequest(service, collector);

    expect(() =>
      service.edit(collector, approval, {
        payload: { summary: "No longer editable." },
      })
    ).toThrowError(ApprovalEditNotAllowedError);
  });
});
