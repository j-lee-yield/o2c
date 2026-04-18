import { describe, expect, it } from "vitest";

import {
  ExceptionCreationService,
  ExceptionTriageService,
  assertNoWorkflowBlockers,
} from "./service.js";
import { exceptionKinds, type ExceptionKind } from "./schema.js";
import { CollectionAutomationBlockedByExceptionError } from "./errors.js";

const creationService = new ExceptionCreationService();

describe("ExceptionCreationService", () => {
  it.each(exceptionKinds)("creates typed metadata for %s", (kind: ExceptionKind) => {
    const exception = creationService.create({
      id: `exception_${kind}`,
      entityType: "billing_account",
      entityId: "billing_1",
      kind,
      createdAt: "2026-03-26T09:00:00.000Z",
      metadata: {
        invoiceIds: ["inv_1"],
      },
    });

    expect(exception.kind).toBe(kind);
    expect(exception.owner.ownerRole).toBeTruthy();
    expect(exception.owner.queue).toBeTruthy();
    expect(exception.playbook.kind).toBe(kind);
    expect(exception.recommendedNextAction.code).toBe(exception.playbook.steps[0]?.code);
    expect(exception.sla.triageByAt).toBeTruthy();
    expect(exception.sla.resolveByAt).toBeTruthy();
  });

  it("adds a policy window for already-paid style exceptions", () => {
    const exception = creationService.create({
      id: "exception_paid",
      entityType: "billing_account",
      entityId: "billing_1",
      kind: "already_paid",
      createdAt: "2026-03-26T09:00:00.000Z",
      metadata: {
        invoiceIds: ["inv_1"],
      },
    });

    expect(exception.sla.policyWindowEndsAt).toBe("2026-03-29T09:00:00.000Z");
    expect(exception.workflowBlockers[0]?.releaseMode).toBe("policy_window_if_no_evidence");
  });
});

describe("ExceptionTriageService", () => {
  it("routes already-paid claims without evidence to waiting_on_customer", () => {
    const service = new ExceptionTriageService();
    const exception = creationService.create({
      id: "exception_1",
      entityType: "billing_account",
      entityId: "billing_1",
      kind: "already_paid",
      createdAt: "2026-03-26T09:00:00.000Z",
      metadata: {
        invoiceIds: ["inv_1"],
      },
    });

    const triaged = service.triage(exception, {
      actorId: "collector_1",
      actorRole: "ar_collector",
      requestedAdditionalProof: true,
      hasPaymentEvidence: false,
    });

    expect(triaged.state).toBe("waiting_on_customer");
    expect(triaged.recommendedNextAction.code).toBe("collect_payment_evidence");
    expect(triaged.metadata.paymentEvidencePresent).toBe(false);
  });

  it("routes evidence-backed claims to internal cash application review", () => {
    const service = new ExceptionTriageService();
    const exception = creationService.create({
      id: "exception_2",
      entityType: "billing_account",
      entityId: "billing_1",
      kind: "proof_remittance_received_not_matched",
      createdAt: "2026-03-26T09:00:00.000Z",
      metadata: {
        invoiceIds: ["inv_1"],
      },
    });

    const triaged = service.triage(exception, {
      actorId: "manager_1",
      actorRole: "ar_manager",
      hasPaymentEvidence: true,
      paymentEvidenceType: "remittance",
      searchBankData: true,
      likelyMatches: [
        {
          invoiceId: "inv_1",
          paymentId: "pay_1",
          confidence: 0.88,
          rationale: "Amount and customer reference align.",
        },
      ],
      routeToCashApplicationReview: true,
    });

    expect(triaged.state).toBe("waiting_on_internal");
    expect(triaged.owner.queue).toBe("cash_application_review");
    expect(triaged.recommendedNextAction.code).toBe("route_cash_application_review");
    expect(Array.isArray(triaged.metadata.likelyMatches)).toBe(true);
  });

  it("allows collections to resume after the policy window if no evidence emerged", () => {
    const service = new ExceptionTriageService();
    const exception = service.triage(
      creationService.create({
        id: "exception_3",
        entityType: "billing_account",
        entityId: "billing_1",
        kind: "already_paid",
        createdAt: "2026-03-26T09:00:00.000Z",
        metadata: {
          invoiceIds: ["inv_1"],
        },
      }),
      {
        actorId: "collector_1",
        actorRole: "ar_collector",
        hasPaymentEvidence: false,
        requestedAdditionalProof: true,
      }
    );

    expect(service.canResumeCollections(exception, "2026-03-29T08:59:59.000Z")).toBe(false);
    expect(service.canResumeCollections(exception, "2026-03-29T09:00:00.000Z")).toBe(true);
  });
});

describe("assertNoWorkflowBlockers", () => {
  it("blocks collection cadence while an evidence-backed payment exception is open", () => {
    const exception = new ExceptionTriageService().triage(
      creationService.create({
        id: "exception_4",
        entityType: "billing_account",
        entityId: "billing_1",
        kind: "already_paid",
        createdAt: "2026-03-26T09:00:00.000Z",
        metadata: {
          invoiceIds: ["inv_1"],
        },
      }),
      {
        actorId: "collector_1",
        actorRole: "ar_collector",
        hasPaymentEvidence: true,
        paymentEvidenceType: "proof_of_payment",
      }
    );

    expect(() =>
      assertNoWorkflowBlockers({
        workflow: "collection_cadence",
        invoices: [{ id: "inv_1", billingAccountId: "billing_1" }],
        exceptions: [exception],
        now: "2026-03-29T09:00:00.000Z",
      })
    ).toThrow(CollectionAutomationBlockedByExceptionError);
  });
});
