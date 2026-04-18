import { afterAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("accounts API", () => {
  it("imports parent accounts, billing accounts, branches, and contacts through the structured endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/accounts/imports",
      payload: {
        records: [
          {
            parentAccount: {
              externalId: "parent-metro",
              name: "Metro Group",
              externalReference: "PG-METRO",
              centrallyServiced: true,
            },
            billingAccount: {
              externalId: "billing-makati",
              accountNumber: "BA-100",
              displayName: "Metro Group - Makati",
              currency: "PHP",
              accountTier: "strategic",
              erpCustomerId: "ERP-100",
              centrallyPaid: true,
            },
            branch: {
              externalId: "branch-makati",
              code: "MKT",
              name: "Makati",
              region: "NCR",
            },
            contact: {
              externalId: "contact-ap-1",
              fullName: "Maria Santos",
              email: "maria@metro.example",
              role: "ap",
              scope: "billing_account",
              isPrimary: true,
              isVerified: true,
              allowAutoSend: true,
              recentSuccessfulResponses: 2,
            },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.importedParentAccountCount).toBe(1);
    expect(body.importedBillingAccountCount).toBe(1);
    expect(body.importedBranchCount).toBe(1);
    expect(body.importedContactCount).toBe(1);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/accounts",
    });
    expect(listResponse.statusCode).toBe(200);
    const item = listResponse.json().items.find(
      (entry: { billingAccountNumber: string }) => entry.billingAccountNumber === "BA-100",
    );
    expect(item?.parentAccountName).toBe("Metro Group");
    expect(item?.branchName).toBe("Makati");
    expect(item?.primaryContactEmail).toBe("maria@metro.example");
  });

  it("accepts raw CSV uploads for account imports", async () => {
    const csv = [
      "parent_account_name,parent_account_external_reference,billing_account_number,billing_account_name,currency,account_tier,centrally_paid,branch_code,branch_name,contact_name,contact_email,contact_role,is_primary,is_verified,allow_auto_send",
      "Bravo Holdings,PG-BRAVO,BA-200,Bravo Trading - Cebu,PHP,standard,false,CEB,Cebu,Juan Dela Cruz,juan@bravo.example,ap,true,true,false",
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/v1/accounts/imports/file",
      headers: {
        "content-type": "text/csv",
        "x-file-name": "accounts.csv",
        "x-upload-id": "accounts-upload-1",
      },
      payload: Buffer.from(csv, "utf8"),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.uploadId).toBe("accounts-upload-1");
    expect(body.sheetName).toBe("CSV");
    expect(body.importedBillingAccountCount).toBe(1);
    expect(body.heldRows).toEqual([]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/accounts",
    });
    expect(listResponse.statusCode).toBe(200);
    const item = listResponse.json().items.find(
      (entry: { billingAccountNumber: string }) => entry.billingAccountNumber === "BA-200",
    );
    expect(item?.parentAccountName).toBe("Bravo Holdings");
    expect(item?.branchCode).toBe("CEB");
    expect(item?.primaryContactEmail).toBe("juan@bravo.example");
  });
});
