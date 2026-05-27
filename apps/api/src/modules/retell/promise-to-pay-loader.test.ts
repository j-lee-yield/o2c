import { describe, expect, it, vi } from "vitest";
import { loadPromiseToPayContextRows } from "./promise-to-pay-loader.js";

describe("loadPromiseToPayContextRows", () => {
  it("falls back when installment_line_ids is missing from the local schema", () => {
    const queryRows = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error(
          'ERROR:  column "installment_line_ids" does not exist\nLINE 12:           installment_line_ids AS "installmentLineIds",',
        );
      })
      .mockImplementationOnce((_databaseUrl: string, sql: string) => {
        expect(sql).not.toContain("installment_line_ids AS");
        expect(sql).toContain(`metadata->'installmentLineIds'`);
        return [
          {
            id: "ptp_1",
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z",
            state: "accepted",
            parentAccountId: "parent_1",
            billingAccountId: "billing_1",
            contactId: "contact_1",
            installmentLineIds: ["line_1"],
            promisedAmountCents: 100000,
            currency: "PHP",
            promiseDate: "2026-05-05",
            metadata: {
              invoiceIds: ["invoice_1"],
            },
          },
        ];
      });

    const rows = loadPromiseToPayContextRows({
      databaseUrl: "postgresql://postgres:postgres@localhost:5433/o2c",
      billingAccountId: "billing_1",
      contactId: "contact_1",
      invoiceIds: ["invoice_1"],
      queryRows,
    });

    expect(queryRows).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "ptp_1",
        installmentLineIds: ["line_1"],
      }),
    ]);
  });
});
