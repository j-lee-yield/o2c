import type {
  BillingAccount,
  Branch,
  Contact,
  CustomerConfiguration,
  CustomerHierarchy,
  CustomerInvoice,
  ParentAccount
} from "@o2c/domain";

export interface HierarchyFixture extends CustomerHierarchy {
  invoices: CustomerInvoice[];
}

export function buildRealisticMultiBranchFixture(options?: {
  centralizedPayer?: boolean;
  siblingBillingAccounts?: number;
  branchesPerBillingAccount?: number;
}): HierarchyFixture {
  const centralizedPayer = options?.centralizedPayer ?? false;
  const siblingBillingAccounts = options?.siblingBillingAccounts ?? 2;
  const branchesPerBillingAccount = options?.branchesPerBillingAccount ?? 4;
  const now = "2026-03-26T00:00:00.000Z";
  const parentId = "parent-acme";

  const parentAccounts: ParentAccount[] = [
    {
      id: parentId,
      createdAt: now,
      updatedAt: now,
      name: "Acme Holdings",
      status: "active",
      centrallyServiced: centralizedPayer,
      metadata: {}
    }
  ];

  const billingAccounts: BillingAccount[] = [];
  const branches: Branch[] = [];
  const invoices: CustomerInvoice[] = [];
  const contacts: Contact[] = [
    makeContact({
      id: "contact-parent-treasury",
      parentAccountId: parentId,
      scope: "parent_account",
      scopeId: parentId,
      fullName: "Acme Treasury",
      email: "treasury@acme.example",
      role: "treasury",
      isVerified: true,
      allowAutoSend: centralizedPayer,
      recentSuccessfulResponses: centralizedPayer ? 6 : 2
    })
  ];
  const configurations: CustomerConfiguration[] = [
    {
      id: "config-parent-acme",
      createdAt: now,
      updatedAt: now,
      parentAccountId: parentId,
      centralizedPayerEnabled: centralizedPayer,
      centrallyServiced: centralizedPayer
    }
  ];

  for (let billingIndex = 1; billingIndex <= siblingBillingAccounts; billingIndex += 1) {
    const billingId = `bill-acme-${billingIndex}`;
    billingAccounts.push({
      id: billingId,
      createdAt: now,
      updatedAt: now,
      parentAccountId: parentId,
      accountNumber: `ACME-${billingIndex.toString().padStart(3, "0")}`,
      displayName: `Acme Region ${billingIndex}`,
      currency: "USD",
      accountTier: centralizedPayer ? "strategic" : "standard",
      status: "active",
      centrallyPaid: centralizedPayer,
      metadata: {}
    });
    configurations.push({
      id: `config-${billingId}`,
      createdAt: now,
      updatedAt: now,
      billingAccountId: billingId,
      centralizedPayerEnabled: centralizedPayer,
      centrallyServiced: centralizedPayer
    });
    contacts.push(
      makeContact({
        id: `contact-${billingId}-ap`,
        parentAccountId: parentId,
        billingAccountId: billingId,
        scope: "billing_account",
        scopeId: billingId,
        fullName: `Region ${billingIndex} AP`,
        email: `ap-${billingIndex}@acme.example`,
        role: "ap",
        isVerified: true,
        allowAutoSend: true,
        recentSuccessfulResponses: 10 - billingIndex
      }),
      makeContact({
        id: `contact-${billingId}-new`,
        parentAccountId: parentId,
        billingAccountId: billingId,
        scope: "billing_account",
        scopeId: billingId,
        fullName: `Region ${billingIndex} Finance`,
        email: `new-finance-${billingIndex}@acme.example`,
        role: "shared_finance",
        isVerified: false,
        allowAutoSend: false,
        recentSuccessfulResponses: 0
      })
    );

    for (let branchIndex = 1; branchIndex <= branchesPerBillingAccount; branchIndex += 1) {
      const branchId = `branch-${billingIndex}-${branchIndex}`;
      const invoiceId = `invoice-${billingIndex}-${branchIndex}`;
      branches.push({
        id: branchId,
        createdAt: now,
        updatedAt: now,
        parentAccountId: parentId,
        billingAccountId: billingId,
        code: `BR-${billingIndex}-${branchIndex}`,
        name: `Acme Branch ${billingIndex}-${branchIndex}`,
        status: "active",
        metadata: {}
      });
      contacts.push(
        makeContact({
          id: `contact-invoice-${billingIndex}-${branchIndex}`,
          parentAccountId: parentId,
          billingAccountId: billingId,
          branchId,
          invoiceId,
          scope: "invoice",
          scopeId: invoiceId,
          fullName: `Invoice Contact ${billingIndex}-${branchIndex}`,
          email: `invoice-${billingIndex}-${branchIndex}@acme.example`,
          role: "invoice",
          isVerified: true,
          allowAutoSend: true,
          recentSuccessfulResponses: branchIndex + 1
        }),
        makeContact({
          id: `contact-branch-${billingIndex}-${branchIndex}`,
          parentAccountId: parentId,
          billingAccountId: billingId,
          branchId,
          scope: "branch",
          scopeId: branchId,
          fullName: `Branch Contact ${billingIndex}-${branchIndex}`,
          email: `branch-${billingIndex}-${branchIndex}@acme.example`,
          role: "branch",
          isVerified: true,
          allowAutoSend: true,
          recentSuccessfulResponses: branchIndex
        })
      );
      invoices.push({
        id: invoiceId,
        createdAt: now,
        updatedAt: now,
        state: "matched_to_erp",
        parentAccountId: parentId,
        billingAccountId: billingId,
        branchId,
        ...(branchIndex === 1
          ? { invoiceContactId: `contact-invoice-${billingIndex}-${branchIndex}` }
          : {}),
        invoiceNumber: `SI-${billingIndex}${branchIndex.toString().padStart(3, "0")}`,
        currency: "USD",
        amountCents: 100_000 + branchIndex,
        metadata: {}
      });
    }
  }

  return {
    parentAccounts,
    billingAccounts,
    branches,
    contacts,
    configurations,
    invoices
  };
}

export function buildHundredsOfBranchesFixture(branchCount = 400): HierarchyFixture {
  return buildRealisticMultiBranchFixture({
    siblingBillingAccounts: 1,
    branchesPerBillingAccount: branchCount
  });
}

export function buildSimpleCustomerFixture(): HierarchyFixture {
  const now = "2026-03-26T00:00:00.000Z";
  const sharedId = "simple-customer";

  return {
    parentAccounts: [
      {
        id: sharedId,
        createdAt: now,
        updatedAt: now,
        name: "Simple Customer LLC",
        status: "active",
        metadata: {}
      }
    ],
    billingAccounts: [
      {
        id: sharedId,
        createdAt: now,
        updatedAt: now,
        parentAccountId: sharedId,
        branchId: sharedId,
        accountNumber: "SIMPLE-001",
        displayName: "Simple Customer LLC",
        currency: "USD",
        accountTier: "standard",
        status: "active",
        centrallyPaid: false,
        metadata: {}
      }
    ],
    branches: [
      {
        id: sharedId,
        createdAt: now,
        updatedAt: now,
        parentAccountId: sharedId,
        billingAccountId: sharedId,
        code: "SIMPLE",
        name: "Simple Customer LLC",
        status: "active",
        metadata: {}
      }
    ],
    contacts: [
      makeContact({
        id: "simple-contact-ap",
        parentAccountId: sharedId,
        billingAccountId: sharedId,
        branchId: sharedId,
        scope: "billing_account",
        scopeId: sharedId,
        fullName: "Simple AP",
        email: "ap@simple.example",
        role: "ap",
        isVerified: true,
        allowAutoSend: true,
        recentSuccessfulResponses: 8
      })
    ],
    configurations: [],
    invoices: [
      {
        id: "invoice-simple-1",
        createdAt: now,
        updatedAt: now,
        state: "matched_to_erp",
        parentAccountId: sharedId,
        billingAccountId: sharedId,
        branchId: sharedId,
        invoiceNumber: "SIMPLE-INV-1",
        currency: "USD",
        amountCents: 50_000,
        metadata: {}
      }
    ]
  };
}

function makeContact(input: Omit<Contact, "createdAt" | "updatedAt" | "isPrimary" | "metadata">): Contact {
  return {
    ...input,
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
    isPrimary: true,
    metadata: {}
  };
}
