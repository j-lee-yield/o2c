import { describe, expect, it } from "vitest";
import {
  canAutoChaseInvoice,
  defaultRoutingLevel,
  domainModules,
  getCollectibleAmountCents
} from "./index.js";

describe("domainModules", () => {
  it("keeps the Sprint 1 scaffold surface explicit", () => {
    expect(domainModules.map((module) => module.name)).toEqual([
      "access_control",
      "accounts",
      "invoices",
      "installments",
      "payments",
      "payment_applications",
      "remittances",
      "promises_to_pay",
      "exceptions",
      "approvals",
      "credit_facilities",
      "activity_logs",
      "integrations",
      "learning_layer",
      "tasks",
      "customer_profiles",
      "deductions",
      "collections",
      "control-center",
      "cash_application",
    ]);
    expect(defaultRoutingLevel()).toBe("billing_account");
    expect(
      canAutoChaseInvoice({
        id: "inv-1",
        createdAt: "2026-03-26T00:00:00.000Z",
        updatedAt: "2026-03-26T00:00:00.000Z",
        state: "matched_to_erp",
        parentAccountId: "parent-1",
        billingAccountId: "bill-1",
        invoiceNumber: "SI-1001",
        currency: "PHP",
        amountCents: 10000,
        metadata: {},
      }),
    ).toBe(true);
  });

  it("allows chasing only the explicit undisputed portion of a partial dispute", () => {
    const invoice = {
      id: "inv-2",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
      state: "disputed_partial" as const,
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-1002",
      currency: "PHP",
      amountCents: 10000,
      disputedAmountCents: 2500,
      metadata: {},
    };

    expect(getCollectibleAmountCents(invoice)).toBe(7500);
    expect(canAutoChaseInvoice(invoice)).toBe(true);
  });

  it("blocks partial disputes when no explicit collectible amount exists", () => {
    const invoice = {
      id: "inv-3",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
      state: "disputed_partial" as const,
      parentAccountId: "parent-1",
      billingAccountId: "bill-1",
      invoiceNumber: "SI-1003",
      currency: "PHP",
      amountCents: 10000,
      metadata: {},
    };

    expect(getCollectibleAmountCents(invoice)).toBe(0);
    expect(canAutoChaseInvoice(invoice)).toBe(false);
  });
});
