import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import { DisputedInvoiceAutoChaseBlockedError, StrategicAccountApprovalRequiredError } from "@o2c/domain";
import { makeBillingAccount, makeInvoice } from "@o2c/testkit";

import { requestCollectionSend } from "./index.js";

describe("requestCollectionSend", () => {
  it("blocks disputed invoices from auto-chase", async () => {
    const auditLogger = new InMemoryAuditLogger();

    await expect(
      requestCollectionSend({
        invoice: makeInvoice({ state: "disputed_full" }),
        account: makeBillingAccount(),
        auditContext: {
          actorId: "system",
          actorType: "automation",
          correlationId: "test-1",
          occurredAt: new Date().toISOString(),
        },
        deps: { auditLogger },
      }),
    ).rejects.toBeInstanceOf(DisputedInvoiceAutoChaseBlockedError);
  });

  it("still blocks partial disputes from direct auto-send even when an undisputed amount exists", async () => {
    const auditLogger = new InMemoryAuditLogger();

    await expect(
      requestCollectionSend({
        invoice: makeInvoice({
          state: "disputed_partial",
          disputedAmountCents: 2500,
          metadata: {},
        }),
        account: makeBillingAccount(),
        auditContext: {
          actorId: "system",
          actorType: "automation",
          correlationId: "test-1b",
          occurredAt: new Date().toISOString(),
        },
        deps: { auditLogger },
      }),
    ).rejects.toBeInstanceOf(DisputedInvoiceAutoChaseBlockedError);
  });

  it("requires approval for strategic accounts", async () => {
    const auditLogger = new InMemoryAuditLogger();

    await expect(
      requestCollectionSend({
        invoice: makeInvoice({ state: "matched_to_erp" }),
        account: makeBillingAccount({ accountTier: "strategic" }),
        auditContext: {
          actorId: "system",
          actorType: "automation",
          correlationId: "test-2",
          occurredAt: new Date().toISOString(),
        },
        deps: { auditLogger },
      }),
    ).rejects.toBeInstanceOf(StrategicAccountApprovalRequiredError);
  });
});
