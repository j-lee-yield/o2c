import { createHash } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { AuditContext } from "@o2c/audit";
import { buildApiApp } from "./app.js";
import { createOperatorConsoleCanonicalImportService } from "./bootstrap/operator-console-canonical-import-service.js";
import { setOperatorConsoleCanonicalImportServiceForTests } from "./modules/retell/routes.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  setOperatorConsoleCanonicalImportServiceForTests(undefined);
});

describe("operator console canonical import service", () => {
  it("materializes callable Retell targets when verification and phone are supplied", async () => {
    const service = createOperatorConsoleCanonicalImportService({
      sourceStore: {
        async listImportedSnapshots() {
          return [
            {
              id: "snapshot-1",
              sourceProvider: "business_central",
              sourceKind: "accounting",
              externalId: "bc-1",
              customerName: "Metro Group - Makati",
              customerReference: "CUST-1001",
              invoiceNumber: "INV-1001",
              currency: "PHP",
              totalAmountCents: 1500000,
              openAmountCents: 1500000,
              sourceStatus: "open",
              issuedAt: "2026-05-01",
              dueDate: "2026-05-15",
              lastImportedAt: "2026-05-03T01:00:00.000Z",
              metadata: {
                contactName: "Maria Santos",
                email: "maria@metro.example",
                branchName: "Makati",
              },
            },
          ];
        },
      },
      accountImporter: createFakeAccountImporter(),
      invoiceCanonicalizer: createFakeInvoiceCanonicalizer(),
    });

    const result = await service.materializeFromOperatorConsoleReadModel({
      tenantId: "test-tenant",
      auditContext: testAuditContext(),
      defaultPhoneNumber: "+639171234567",
      markContactsVerified: true,
    });

    expect(result.status).toBe("ok");
    expect(result.importedBillingAccountCount).toBe(1);
    expect(result.importedContactCount).toBe(1);
    expect(result.canonicalInvoiceCount).toBe(1);
    expect(result.callableTargets).toHaveLength(1);
    expect(result.callableTargets[0]?.phone).toBe("+639171234567");
    expect(result.sampleOutboundRequest).toEqual({
      billingAccountId: fakeBillingAccountId("CUST-1001", "Metro Group - Makati"),
      contactId: fakeContactId(
        fakeBillingAccountId("CUST-1001", "Metro Group - Makati"),
        "Maria Santos",
        "maria@metro.example",
        "+639171234567",
      ),
    });
  });

  it("surfaces non-callable targets when phone or verification is missing", async () => {
    const service = createOperatorConsoleCanonicalImportService({
      sourceStore: {
        async listImportedSnapshots() {
          return [
            {
              id: "snapshot-2",
              sourceProvider: "business_central",
              sourceKind: "accounting",
              externalId: "bc-2",
              customerName: "Trey Research",
              customerReference: "CUST-2002",
              invoiceNumber: "INV-2002",
              currency: "PHP",
              totalAmountCents: 2500000,
              openAmountCents: 2500000,
              sourceStatus: "open",
              issuedAt: "2026-05-01",
              dueDate: "2026-05-18",
              lastImportedAt: "2026-05-03T01:00:00.000Z",
              metadata: {
                contactName: "Helen Ray",
                email: "helen@trey.example",
              },
            },
          ];
        },
      },
      accountImporter: createFakeAccountImporter(),
      invoiceCanonicalizer: createFakeInvoiceCanonicalizer(),
    });

    const result = await service.materializeFromOperatorConsoleReadModel({
      tenantId: "test-tenant",
      auditContext: testAuditContext(),
      markContactsVerified: false,
    });

    expect(result.callableTargets).toHaveLength(0);
    expect(result.nonCallableTargets).toHaveLength(1);
    expect(result.nonCallableTargets[0]?.reason).toBe("missing_phone");
    expect(result.warnings).toContain(
      "No Retell-callable contacts were produced yet. Add a phone number or opt into verified test contacts for a local call run.",
    );
  });
});

describe("Retell operator console import route", () => {
  it("returns the materialized import summary", async () => {
    setOperatorConsoleCanonicalImportServiceForTests({
      async materializeFromOperatorConsoleReadModel() {
        return {
          status: "ok",
          importedSnapshotCount: 2,
          importedBillingAccountCount: 1,
          importedContactCount: 1,
          canonicalInvoiceCount: 2,
          pendingInvoiceCount: 0,
          heldInvoiceCount: 0,
          callableTargets: [
            {
              billingAccountId: "billing-1",
              billingAccountName: "Metro Group - Makati",
              contactId: "contact-1",
              contactName: "Maria Santos",
              phone: "+639171234567",
              invoiceCount: 2,
            },
          ],
          nonCallableTargets: [],
          warnings: [],
          sampleOutboundRequest: {
            billingAccountId: "billing-1",
            contactId: "contact-1",
          },
        };
      },
    } as ReturnType<typeof createOperatorConsoleCanonicalImportService>);

    const response = await app.inject({
      method: "POST",
      url: "/v1/retell/testing/import-operator-console-read-model",
      payload: {
        customerName: "Metro Group - Makati",
        defaultPhoneNumber: "+639171234567",
        markContactsVerified: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.filters.customerName).toBe("Metro Group - Makati");
    expect(body.filters.defaultPhoneNumberApplied).toBe(true);
    expect(body.callableTargets[0]?.contactId).toBe("contact-1");
  });
});

function createFakeAccountImporter() {
  return {
    async importRecords(input: {
      records: Array<{
        billingAccount: { accountNumber: string; displayName: string };
        contact?: {
          fullName: string;
          email?: string;
          phone?: string;
          isVerified: boolean;
          allowAutoSend: boolean;
        };
      }>;
    }) {
      const billingAccounts = new Map<string, { id: string; displayName: string }>();
      const contacts = new Map<
        string,
        {
          id: string;
          billingAccountId: string;
          fullName: string;
          email?: string;
          phone?: string;
          isVerified: boolean;
          allowAutoSend: boolean;
        }
      >();

      for (const record of input.records) {
        const billingAccountId = fakeBillingAccountId(
          record.billingAccount.accountNumber,
          record.billingAccount.displayName,
        );
        billingAccounts.set(billingAccountId, {
          id: billingAccountId,
          displayName: record.billingAccount.displayName,
        });

        if (!record.contact) {
          continue;
        }

        const contactId = fakeContactId(
          billingAccountId,
          record.contact.fullName,
          record.contact.email,
          record.contact.phone,
        );
        contacts.set(contactId, {
          id: contactId,
          billingAccountId,
          fullName: record.contact.fullName,
          ...(record.contact.email ? { email: record.contact.email } : {}),
          ...(record.contact.phone ? { phone: record.contact.phone } : {}),
          isVerified: record.contact.isVerified,
          allowAutoSend: record.contact.allowAutoSend,
        });
      }

      return {
        parentAccounts: [],
        billingAccounts: [...billingAccounts.values()],
        contacts: [...contacts.values()],
      };
    },
  };
}

function createFakeInvoiceCanonicalizer() {
  return {
    async syncImportedInvoiceRecords(input: {
      invoices: Array<{
        externalId: string;
        customerName: string;
        customerNumber?: string;
        invoiceNumber: string;
        totalAmountCents: number;
        remainingAmountCents: number;
        status: string;
      }>;
    }) {
      return {
        provider: "business_central" as const,
        importedCount: input.invoices.length,
        skippedCount: 0,
        canonicalUpsertedCount: input.invoices.length,
        pendingAccountMappingCount: 0,
        heldInvalidCount: 0,
        snapshots: input.invoices.map((invoice) => ({
          id: `snapshot:${invoice.externalId}`,
          tenantId: "test-tenant",
          version: 1,
          createdAt: "2026-05-03T00:00:00.000Z",
          updatedAt: "2026-05-03T00:00:00.000Z",
          sourceProvider: "business_central" as const,
          sourceKind: "accounting" as const,
          externalId: invoice.externalId,
          customerName: invoice.customerName,
          ...(invoice.customerNumber ? { customerReference: invoice.customerNumber } : {}),
          invoiceNumber: invoice.invoiceNumber,
          currency: "PHP",
          totalAmountCents: invoice.totalAmountCents,
          openAmountCents: invoice.remainingAmountCents,
          sourceStatus: invoice.status,
          lastImportedAt: "2026-05-03T00:00:00.000Z",
          canonicalInvoiceId: `invoice:${invoice.externalId}`,
          canonicalizationStatus: "canonical_upserted" as const,
          fingerprint: invoice.externalId,
          metadata: {
            normalizedHierarchy: {
              billingAccountId: fakeBillingAccountId(
                invoice.customerNumber,
                invoice.customerName,
              ),
            },
          },
        })),
      };
    },
  };
}

function fakeBillingAccountId(customerNumber: string | undefined, customerName: string) {
  const accountNumber =
    customerNumber?.trim() || `rm-${sha(customerName).slice(0, 10).toUpperCase()}`;
  return `billing:${accountNumber}`;
}

function fakeContactId(
  billingAccountId: string,
  fullName: string,
  email?: string,
  phone?: string,
) {
  return `contact:${sha([billingAccountId, fullName, email ?? "", phone ?? ""].join("|"))}`;
}

function sha(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function testAuditContext(): AuditContext {
  return {
    actorId: "test",
    actorType: "system",
    correlationId: "corr-1",
    occurredAt: "2026-05-03T00:00:00.000Z",
  };
}
