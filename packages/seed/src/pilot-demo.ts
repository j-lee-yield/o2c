import type {
  SeedScenario,
  EmailInboxRemittanceInput,
  LinkedPaymentWorkflowRemittanceInput,
  UploadRemittanceInput,
} from "@o2c/contracts";
import type {
  BillingAccount,
  Branch,
  CustomerInvoice,
  ParentAccount,
  Payment,
  PromiseToPay,
  UploadedDocument,
} from "@o2c/domain";

export type PilotIndustry = "distributor" | "manufacturer" | "importer_wholesaler";

export type PilotScenarioTag =
  | "multi_branch_centralized_payer"
  | "already_paid_not_yet_matched"
  | "partial_dispute"
  | "short_payment"
  | "overpayment"
  | "proof_of_payment_upload"
  | "promise_kept"
  | "promise_broken";

export interface PilotMetricAssumptions {
  overdueBalanceBeforeCents: number;
  overdueBalanceAfterCents: number;
  inScopeCashCollectedCents: number;
  collectorMinutesBefore: number;
  collectorMinutesAfter: number;
  touchCount: number;
  promiseCount: number;
  promisesKeptCount: number;
  unmatchedCashAgingDaysBefore: number;
  unmatchedCashAgingDaysAfter: number;
  disputeIdentificationHoursBefore: number;
  disputeIdentificationHoursAfter: number;
}

export interface PilotPromiseStory {
  id: string;
  promiseDate: string;
  promisedAmountCents: number;
  currentState: PromiseToPay["state"];
  outcome: "kept" | "broken";
}

export interface PilotEvaluationInput {
  account: BillingAccount;
  payment: Payment;
  allocations: Array<{
    invoice: CustomerInvoice;
    amountCents: number;
  }>;
  payerIdentified: boolean;
  matchConfidence: number;
  noRegretAutoApply: boolean;
  manualOverrideErpWritebackConflict?: boolean;
}

export interface PilotDemoScenario {
  id: string;
  title: string;
  operatorLane: "cash_application" | "approvals" | "exceptions";
  industry: PilotIndustry;
  focus: string;
  tags: PilotScenarioTag[];
  evaluation: PilotEvaluationInput;
  metricAssumptions: PilotMetricAssumptions;
  promiseStory?: PilotPromiseStory;
  uploadedDocuments: UploadedDocument[];
  payloadIds: string[];
  walkthroughCue: string;
}

export interface PilotSamplePayload {
  id: string;
  scenarioId: string;
  title: string;
  kind: "email_inbox" | "upload" | "linked_payment_workflow";
  payload: EmailInboxRemittanceInput | UploadRemittanceInput | LinkedPaymentWorkflowRemittanceInput;
}

export interface PilotSeedScript {
  id: string;
  title: string;
  description: string;
  scenarioIds: string[];
}

export interface PilotWalkthroughStep {
  id: string;
  title: string;
  scenarioId?: string;
  speakerNote: string;
  expectedOutcome: string;
  metricCallout: string;
}

export interface PilotDemoCatalog {
  scenario: SeedScenario;
  parentAccounts: ParentAccount[];
  billingAccounts: BillingAccount[];
  branches: Branch[];
  invoices: CustomerInvoice[];
  payments: Payment[];
  uploadedDocuments: UploadedDocument[];
  promisesToPay: PromiseToPay[];
  scenarios: PilotDemoScenario[];
  samplePayloads: PilotSamplePayload[];
  seedScripts: PilotSeedScript[];
  walkthrough: PilotWalkthroughStep[];
}

const now = "2026-03-26T00:00:00.000Z";

export function buildPilotDemoCatalog(): PilotDemoCatalog {
  const parentAccounts = buildParentAccounts();
  const billingAccounts = buildBillingAccounts();
  const branches = buildBranches();
  const scenarios = buildPilotDemoScenarios();
  const exampleInvoices = buildExampleInvoices();
  const samplePayloads = buildPilotSamplePayloads();

  return {
    scenario: {
      code: "ph-b2b-pilot-demo",
      description: "Pilot-ready Philippine B2B order-to-cash demo data with KPI instrumentation scenarios.",
    },
    parentAccounts,
    billingAccounts,
    branches,
    invoices: [
      ...scenarios.flatMap((scenario) =>
        scenario.evaluation.allocations.map((allocation) => allocation.invoice)
      ),
      ...exampleInvoices,
    ],
    payments: scenarios.map((scenario) => scenario.evaluation.payment),
    uploadedDocuments: scenarios.flatMap((scenario) => scenario.uploadedDocuments),
    promisesToPay: scenarios.flatMap((scenario) =>
      scenario.promiseStory ? [makePromise(scenario)] : []
    ),
    scenarios,
    samplePayloads,
    seedScripts: [
      {
        id: "seed-customer-master-data",
        title: "Seed customer master data",
        description:
          "Load parent accounts, billing accounts, and branch routing needed for distributor, manufacturer, and importer/wholesaler demos.",
        scenarioIds: scenarios.map((scenario) => scenario.id),
      },
      {
        id: "seed-open-ar-backlog",
        title: "Seed open AR backlog",
        description:
          "Insert invoices, payments, and uploaded proof artifacts that reproduce overdue, unmatched cash, dispute, short-pay, and overpayment queues.",
        scenarioIds: scenarios.map((scenario) => scenario.id),
      },
      {
        id: "seed-demo-journeys",
        title: "Seed demo walkthrough journeys",
        description:
          "Attach remittance payloads and promise-to-pay records so the demo can replay approvals, exceptions, and kept or broken promise stories end to end.",
        scenarioIds: scenarios.map((scenario) => scenario.id),
      },
    ],
    walkthrough: [
      {
        id: "walkthrough-01",
        title: "Open with the distributor auto-apply baseline",
        scenarioId: "distributor-exact-auto-apply",
        speakerNote:
          "Show that billing-account routing remains the default while branch IDs are preserved on the invoice and allocation.",
        expectedOutcome: "Cash auto-applies with no manual step and no branch data loss.",
        metricCallout: "Use this to anchor auto-applied cash % and DSO improvement.",
      },
      {
        id: "walkthrough-02",
        title: "Demonstrate strategic centralized payer controls",
        scenarioId: "manufacturer-centralized-payer-approval",
        speakerNote:
          "Switch to the multi-branch manufacturer account and show that centralized payer visibility does not bypass billing-account routing or strategic approval gates.",
        expectedOutcome: "The payment is routed to approval even with strong match evidence.",
        metricCallout: "Use this to explain conservative controls for strategic accounts.",
      },
      {
        id: "walkthrough-03",
        title: "Resolve already-paid-but-unmatched cash from proof upload",
        scenarioId: "importer-proof-upload-unmatched-cash",
        speakerNote:
          "Replay the proof-of-payment upload and show the cash moving from unmatched to applied once the invoice evidence is linked.",
        expectedOutcome: "The kept promise-to-pay is confirmed and unmatched cash aging drops sharply.",
        metricCallout: "Use this for cash collected, collector hours saved, and unmatched cash aging.",
      },
      {
        id: "walkthrough-04",
        title: "Surface short-pay and partial-dispute controls",
        scenarioId: "distributor-short-pay-partial-dispute",
        speakerNote:
          "Show that a broken promise-to-pay and a partial dispute stay out of auto-chasing and auto-application workflows.",
        expectedOutcome: "The payment is held for review with dispute context attached.",
        metricCallout: "Use this for dispute identification speed and broken promise handling.",
      },
      {
        id: "walkthrough-05",
        title: "Show conservative handling of overpayments",
        scenarioId: "wholesaler-overpayment-proof-upload",
        speakerNote:
          "Highlight that the platform auto-applies only the supported amount and leaves the excess unmatched for audited follow-up.",
        expectedOutcome: "The invoice is paid, excess cash remains visible, and proof is attached.",
        metricCallout: "Use this for unapplied cash visibility and cash collected from in-scope invoices.",
      },
      {
        id: "walkthrough-06",
        title: "Close on KPI instrumentation",
        speakerNote:
          "End on the KPI snapshot and explain how each scenario contributes to DSO, overdue balance reduction, auto-applied cash, promise outcomes, and collector productivity.",
        expectedOutcome: "Stakeholders understand the pilot scorecard and how it is derived from the fixtures.",
        metricCallout: "Primary KPI is DSO improvement. Everything else supports the pilot business case.",
      },
    ],
  };
}

function buildExampleInvoices(): CustomerInvoice[] {
  return [
    makeInvoice({
      id: "inv-example-standard-current",
      parentAccountId: "parent-dist-1",
      billingAccountId: "bill-dist-1",
      branchId: "branch-dist-manila",
      invoiceNumber: "SI-EX-STANDARD-1001",
      amountCents: 180_000,
      invoiceDate: "2026-04-01",
      dueDate: "2026-05-01",
      metadata: {
        exampleType: "standard_credit_terms",
        exampleLabel: "Standard net-30 current invoice",
        paymentTerms: "Net 30",
        openAmountCents: 180_000,
      },
    }),
    makeInvoice({
      id: "inv-example-standard-overdue",
      parentAccountId: "parent-dist-1",
      billingAccountId: "bill-dist-2",
      branchId: "branch-dist-pampanga",
      invoiceNumber: "SI-EX-STANDARD-1002",
      amountCents: 240_000,
      invoiceDate: "2026-02-10",
      dueDate: "2026-03-12",
      metadata: {
        exampleType: "standard_credit_terms",
        exampleLabel: "Standard net-30 overdue invoice",
        paymentTerms: "Net 30",
        openAmountCents: 240_000,
      },
    }),
    makeInvoice({
      id: "inv-example-installment-current",
      parentAccountId: "parent-imp-1",
      billingAccountId: "bill-imp-1",
      branchId: "branch-imp-pasay",
      invoiceNumber: "SI-EX-INSTALL-2001",
      amountCents: 600_000,
      invoiceDate: "2026-01-05",
      dueDate: "2026-01-05",
      metadata: {
        exampleType: "installment_plan",
        exampleLabel: "6-month installment receivable with one line currently due",
        paymentTerms: "6 monthly installments",
        installmentPlan: {
          installmentPlanId: "plan-example-2001",
          numberOfInstallments: 6,
          cadence: "monthly",
          planStartDate: "2026-01-05",
        },
        installmentLines: [
          {
            installmentLineId: "plan-example-2001-line-1",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 1,
            dueDate: "2026-02-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 100_000,
            remainingAmountCents: 0,
            status: "paid",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2001-line-2",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 2,
            dueDate: "2026-03-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 100_000,
            remainingAmountCents: 0,
            status: "paid",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2001-line-3",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 3,
            dueDate: "2026-04-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 100_000,
            remainingAmountCents: 0,
            status: "paid",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2001-line-4",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 4,
            dueDate: "2026-05-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 0,
            remainingAmountCents: 100_000,
            status: "due",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2001-line-5",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 5,
            dueDate: "2026-06-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 0,
            remainingAmountCents: 100_000,
            status: "future",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2001-line-6",
            installmentPlanId: "plan-example-2001",
            parentInvoiceId: "inv-example-installment-current",
            billingAccountId: "bill-imp-1",
            branchId: "branch-imp-pasay",
            currency: "PHP",
            sequenceNumber: 6,
            dueDate: "2026-07-05",
            scheduledAmountCents: 100_000,
            paidAmountCents: 0,
            remainingAmountCents: 100_000,
            status: "future",
            daysPastDue: 0,
          },
        ],
      },
    }),
    makeInvoice({
      id: "inv-example-installment-overdue",
      parentAccountId: "parent-mfg-1",
      billingAccountId: "bill-mfg-2",
      branchId: "branch-mfg-davao",
      invoiceNumber: "SI-EX-INSTALL-2002",
      amountCents: 360_000,
      invoiceDate: "2025-12-20",
      dueDate: "2025-12-20",
      metadata: {
        exampleType: "installment_plan",
        exampleLabel: "6-month installment receivable with one missed line",
        paymentTerms: "6 monthly installments",
        installmentPlan: {
          installmentPlanId: "plan-example-2002",
          numberOfInstallments: 6,
          cadence: "monthly",
          planStartDate: "2025-12-20",
        },
        installmentLines: [
          {
            installmentLineId: "plan-example-2002-line-1",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 1,
            dueDate: "2026-01-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 60_000,
            remainingAmountCents: 0,
            status: "paid",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2002-line-2",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 2,
            dueDate: "2026-02-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 60_000,
            remainingAmountCents: 0,
            status: "paid",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2002-line-3",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 3,
            dueDate: "2026-03-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 0,
            remainingAmountCents: 60_000,
            status: "overdue",
            daysPastDue: 32,
          },
          {
            installmentLineId: "plan-example-2002-line-4",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 4,
            dueDate: "2026-04-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 0,
            remainingAmountCents: 60_000,
            status: "due",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2002-line-5",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 5,
            dueDate: "2026-05-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 0,
            remainingAmountCents: 60_000,
            status: "future",
            daysPastDue: 0,
          },
          {
            installmentLineId: "plan-example-2002-line-6",
            installmentPlanId: "plan-example-2002",
            parentInvoiceId: "inv-example-installment-overdue",
            billingAccountId: "bill-mfg-2",
            branchId: "branch-mfg-davao",
            currency: "PHP",
            sequenceNumber: 6,
            dueDate: "2026-06-20",
            scheduledAmountCents: 60_000,
            paidAmountCents: 0,
            remainingAmountCents: 60_000,
            status: "future",
            daysPastDue: 0,
          },
        ],
      },
    }),
  ];
}

function buildPilotDemoScenarios(): PilotDemoScenario[] {
  return [
    {
      id: "distributor-exact-auto-apply",
      title: "Distributor exact-match auto-apply",
      operatorLane: "cash_application",
      industry: "distributor",
      focus: "Standard distributor payment auto-applies with preserved branch routing.",
      tags: [],
      evaluation: {
        account: makeAccount({
          id: "bill-dist-1",
          parentAccountId: "parent-dist-1",
          accountNumber: "DIST-001",
          displayName: "Luzon Distributor Group - Manila",
          accountTier: "standard",
          centrallyPaid: false,
        }),
        payment: makePayment({
          id: "pay-dist-1",
          parentAccountId: "parent-dist-1",
          billingAccountId: "bill-dist-1",
          amountCents: 1_500_000,
          paymentReference: "RCPT-DIST-7788",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-dist-1",
              parentAccountId: "parent-dist-1",
              billingAccountId: "bill-dist-1",
              branchId: "branch-dist-manila",
              invoiceNumber: "SI-DIST-1001",
              amountCents: 1_500_000,
              invoiceDate: "2026-01-14",
              dueDate: "2026-02-15",
            }),
            amountCents: 1_500_000,
          },
        ],
        payerIdentified: true,
        matchConfidence: 0.99,
        noRegretAutoApply: true,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 1_500_000,
        overdueBalanceAfterCents: 0,
        inScopeCashCollectedCents: 1_500_000,
        collectorMinutesBefore: 90,
        collectorMinutesAfter: 10,
        touchCount: 2,
        promiseCount: 0,
        promisesKeptCount: 0,
        unmatchedCashAgingDaysBefore: 5,
        unmatchedCashAgingDaysAfter: 0.5,
        disputeIdentificationHoursBefore: 0,
        disputeIdentificationHoursAfter: 0,
      },
      uploadedDocuments: [],
      payloadIds: ["payload-dist-1"],
      walkthroughCue: "Start with a clean win that proves conservative auto-apply and branch preservation.",
    },
    {
      id: "manufacturer-centralized-payer-approval",
      title: "Manufacturer multi-branch centralized payer approval",
      operatorLane: "approvals",
      industry: "manufacturer",
      focus: "Strategic centralized payer needs approval even with strong evidence across multiple branches.",
      tags: ["multi_branch_centralized_payer"],
      evaluation: {
        account: makeAccount({
          id: "bill-mfg-1",
          parentAccountId: "parent-mfg-1",
          accountNumber: "MFG-001",
          displayName: "Archipelago Manufacturing HQ",
          accountTier: "strategic",
          centrallyPaid: true,
          branchId: "branch-mfg-hq",
        }),
        payment: makePayment({
          id: "pay-mfg-1",
          parentAccountId: "parent-mfg-1",
          billingAccountId: "bill-mfg-1",
          amountCents: 3_000_000,
          paymentReference: "TREASURY-3000",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-mfg-1a",
              parentAccountId: "parent-mfg-1",
              billingAccountId: "bill-mfg-1",
              branchId: "branch-mfg-laguna",
              invoiceNumber: "SI-MFG-2001",
              amountCents: 1_800_000,
              invoiceDate: "2026-03-05",
              dueDate: "2026-03-22",
            }),
            amountCents: 1_800_000,
          },
          {
            invoice: makeInvoice({
              id: "inv-mfg-1b",
              parentAccountId: "parent-mfg-1",
              billingAccountId: "bill-mfg-1",
              branchId: "branch-mfg-cebu",
              invoiceNumber: "SI-MFG-2002",
              amountCents: 1_200_000,
              invoiceDate: "2026-03-10",
              dueDate: "2026-03-24",
            }),
            amountCents: 1_200_000,
          },
        ],
        payerIdentified: true,
        matchConfidence: 0.97,
        noRegretAutoApply: true,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 3_000_000,
        overdueBalanceAfterCents: 3_000_000,
        inScopeCashCollectedCents: 0,
        collectorMinutesBefore: 140,
        collectorMinutesAfter: 55,
        touchCount: 1,
        promiseCount: 0,
        promisesKeptCount: 0,
        unmatchedCashAgingDaysBefore: 4,
        unmatchedCashAgingDaysAfter: 2,
        disputeIdentificationHoursBefore: 0,
        disputeIdentificationHoursAfter: 0,
      },
      uploadedDocuments: [],
      payloadIds: ["payload-mfg-1"],
      walkthroughCue: "Use this to explain why centralized payer behavior does not loosen strategic controls.",
    },
    {
      id: "importer-proof-upload-unmatched-cash",
      title: "Importer proof upload resolves already-paid but unmatched cash",
      operatorLane: "cash_application",
      industry: "importer_wholesaler",
      focus: "Proof-of-payment upload links a kept promise and clears already-paid cash that had not yet been matched.",
      tags: ["already_paid_not_yet_matched", "proof_of_payment_upload", "promise_kept"],
      evaluation: {
        account: makeAccount({
          id: "bill-imp-1",
          parentAccountId: "parent-imp-1",
          accountNumber: "IMP-001",
          displayName: "Pacific Imports and Wholesale - NCR",
          accountTier: "standard",
          centrallyPaid: false,
        }),
        payment: makePayment({
          id: "pay-imp-1",
          parentAccountId: "parent-imp-1",
          billingAccountId: "bill-imp-1",
          amountCents: 1_200_000,
          paymentReference: "UPLD-POP-1200",
          state: "ingested_unmatched",
          receivedAt: "2026-03-23T09:00:00.000Z",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-imp-1",
              parentAccountId: "parent-imp-1",
              billingAccountId: "bill-imp-1",
              branchId: "branch-imp-pasay",
              invoiceNumber: "SI-IMP-3001",
              amountCents: 1_200_000,
              invoiceDate: "2026-01-18",
              dueDate: "2026-02-18",
            }),
            amountCents: 1_200_000,
          },
        ],
        payerIdentified: true,
        matchConfidence: 0.98,
        noRegretAutoApply: true,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 1_200_000,
        overdueBalanceAfterCents: 0,
        inScopeCashCollectedCents: 1_200_000,
        collectorMinutesBefore: 120,
        collectorMinutesAfter: 18,
        touchCount: 1,
        promiseCount: 1,
        promisesKeptCount: 1,
        unmatchedCashAgingDaysBefore: 11,
        unmatchedCashAgingDaysAfter: 1,
        disputeIdentificationHoursBefore: 12,
        disputeIdentificationHoursAfter: 1,
      },
      promiseStory: {
        id: "ptp-imp-1",
        promiseDate: "2026-03-23",
        promisedAmountCents: 1_200_000,
        currentState: "kept",
        outcome: "kept",
      },
      uploadedDocuments: [
        makeUploadedDocument({
          id: "doc-imp-proof-1",
          documentType: "supporting",
          source: "portal",
          storageKey: "proofs/pacific-imports-proof-1.png",
          checksum: "sha256-proof-imp-1",
          uploadedBy: "collector.demo",
          uploadedAt: "2026-03-23T10:15:00.000Z",
          metadata: {
            scenarioId: "importer-proof-upload-unmatched-cash",
            proofType: "proof_of_payment",
          },
        }),
      ],
      payloadIds: ["payload-imp-1"],
      walkthroughCue: "Show unmatched cash before the proof upload, then replay the link and auto-apply.",
    },
    {
      id: "distributor-short-pay-partial-dispute",
      title: "Distributor short pay with partial dispute and broken promise",
      operatorLane: "exceptions",
      industry: "distributor",
      focus: "Broken promise, short payment, and partial dispute should stay out of auto-application and auto-chasing.",
      tags: ["partial_dispute", "short_payment", "promise_broken"],
      evaluation: {
        account: makeAccount({
          id: "bill-dist-2",
          parentAccountId: "parent-dist-1",
          accountNumber: "DIST-002",
          displayName: "Luzon Distributor Group - Pampanga",
          accountTier: "standard",
          centrallyPaid: false,
        }),
        payment: makePayment({
          id: "pay-dist-2",
          parentAccountId: "parent-dist-1",
          billingAccountId: "bill-dist-2",
          amountCents: 900_000,
          paymentReference: "SHORTPAY-900",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-dist-2",
              parentAccountId: "parent-dist-1",
              billingAccountId: "bill-dist-2",
              branchId: "branch-dist-pampanga",
              invoiceNumber: "SI-DIST-1002",
              amountCents: 1_100_000,
              invoiceDate: "2026-03-01",
              dueDate: "2026-03-21",
              state: "disputed_partial",
            }),
            amountCents: 900_000,
          },
        ],
        payerIdentified: true,
        matchConfidence: 0.94,
        noRegretAutoApply: false,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 1_100_000,
        overdueBalanceAfterCents: 1_100_000,
        inScopeCashCollectedCents: 0,
        collectorMinutesBefore: 180,
        collectorMinutesAfter: 95,
        touchCount: 2,
        promiseCount: 1,
        promisesKeptCount: 0,
        unmatchedCashAgingDaysBefore: 7,
        unmatchedCashAgingDaysAfter: 4,
        disputeIdentificationHoursBefore: 36,
        disputeIdentificationHoursAfter: 3,
      },
      promiseStory: {
        id: "ptp-dist-2",
        promiseDate: "2026-03-20",
        promisedAmountCents: 1_100_000,
        currentState: "broken",
        outcome: "broken",
      },
      uploadedDocuments: [],
      payloadIds: ["payload-dist-2"],
      walkthroughCue: "Use this to show the system refusing to move money on a disputed short pay.",
    },
    {
      id: "wholesaler-overpayment-proof-upload",
      title: "Wholesaler overpayment with proof upload",
      operatorLane: "cash_application",
      industry: "importer_wholesaler",
      focus: "Supported amount auto-applies while excess cash remains unmatched and auditable.",
      tags: ["overpayment", "proof_of_payment_upload"],
      evaluation: {
        account: makeAccount({
          id: "bill-wh-1",
          parentAccountId: "parent-wh-1",
          accountNumber: "WH-001",
          displayName: "Harbor Wholesale Hub - Cebu",
          accountTier: "standard",
          centrallyPaid: false,
        }),
        payment: makePayment({
          id: "pay-wh-1",
          parentAccountId: "parent-wh-1",
          billingAccountId: "bill-wh-1",
          amountCents: 1_050_000,
          paymentReference: "OVERPAY-1050",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-wh-1",
              parentAccountId: "parent-wh-1",
              billingAccountId: "bill-wh-1",
              branchId: "branch-wh-cebu",
              invoiceNumber: "SI-WH-4001",
              amountCents: 900_000,
              invoiceDate: "2026-01-22",
              dueDate: "2026-02-22",
            }),
            amountCents: 900_000,
          },
        ],
        payerIdentified: true,
        matchConfidence: 0.96,
        noRegretAutoApply: true,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 900_000,
        overdueBalanceAfterCents: 0,
        inScopeCashCollectedCents: 900_000,
        collectorMinutesBefore: 110,
        collectorMinutesAfter: 25,
        touchCount: 1,
        promiseCount: 0,
        promisesKeptCount: 0,
        unmatchedCashAgingDaysBefore: 14,
        unmatchedCashAgingDaysAfter: 5,
        disputeIdentificationHoursBefore: 8,
        disputeIdentificationHoursAfter: 2,
      },
      uploadedDocuments: [
        makeUploadedDocument({
          id: "doc-wh-proof-1",
          documentType: "supporting",
          source: "portal",
          storageKey: "proofs/harbor-wholesale-proof-1.pdf",
          checksum: "sha256-proof-wh-1",
          uploadedBy: "collector.demo",
          uploadedAt: "2026-03-25T11:00:00.000Z",
          metadata: {
            scenarioId: "wholesaler-overpayment-proof-upload",
            proofType: "proof_of_payment",
          },
        }),
      ],
      payloadIds: ["payload-wh-1"],
      walkthroughCue: "Highlight the unapplied remainder and the preserved audit trail on the proof document.",
    },
    {
      id: "manufacturer-centralized-payer-unidentified",
      title: "Manufacturer centralized payer with unidentified remittance",
      operatorLane: "exceptions",
      industry: "manufacturer",
      focus: "Centralized payer remittance without confident payer identification remains in review.",
      tags: ["multi_branch_centralized_payer"],
      evaluation: {
        account: makeAccount({
          id: "bill-mfg-2",
          parentAccountId: "parent-mfg-1",
          accountNumber: "MFG-002",
          displayName: "Archipelago Manufacturing Shared Services",
          accountTier: "standard",
          centrallyPaid: true,
        }),
        payment: makePayment({
          id: "pay-mfg-2",
          parentAccountId: "parent-mfg-1",
          amountCents: 875_000,
          paymentReference: "UNKNOWN-875",
        }),
        allocations: [
          {
            invoice: makeInvoice({
              id: "inv-mfg-2",
              parentAccountId: "parent-mfg-1",
              billingAccountId: "bill-mfg-2",
              branchId: "branch-mfg-davao",
              invoiceNumber: "SI-MFG-2003",
              amountCents: 875_000,
              invoiceDate: "2026-03-12",
              dueDate: "2026-03-26",
            }),
            amountCents: 875_000,
          },
        ],
        payerIdentified: false,
        matchConfidence: 0.62,
        noRegretAutoApply: false,
      },
      metricAssumptions: {
        overdueBalanceBeforeCents: 875_000,
        overdueBalanceAfterCents: 875_000,
        inScopeCashCollectedCents: 0,
        collectorMinutesBefore: 100,
        collectorMinutesAfter: 60,
        touchCount: 1,
        promiseCount: 0,
        promisesKeptCount: 0,
        unmatchedCashAgingDaysBefore: 9,
        unmatchedCashAgingDaysAfter: 4,
        disputeIdentificationHoursBefore: 10,
        disputeIdentificationHoursAfter: 3,
      },
      uploadedDocuments: [],
      payloadIds: ["payload-mfg-2"],
      walkthroughCue: "Use this to show that centralized payers still need clear payer evidence before money moves.",
    },
  ];
}

function buildPilotSamplePayloads(): PilotSamplePayload[] {
  return [
    {
      id: "payload-dist-1",
      scenarioId: "distributor-exact-auto-apply",
      title: "Distributor remittance email",
      kind: "email_inbox",
      payload: {
        channel: "email_inbox",
        sourceId: "email-dist-1",
        receivedAt: "2026-03-26T08:00:00.000Z",
        fromEmail: "ap@luzondistributor.example",
        fromName: "Luzon Distributor AP",
        subject: "Remittance for SI-DIST-1001",
        bodyText:
          "Please apply RCPT-DIST-7788 for SI-DIST-1001 amount PHP 15,000.00 to Manila branch.",
        attachments: [],
        metadata: {
          scenarioId: "distributor-exact-auto-apply",
        },
      },
    },
    {
      id: "payload-mfg-1",
      scenarioId: "manufacturer-centralized-payer-approval",
      title: "Centralized treasury linked payment note",
      kind: "linked_payment_workflow",
      payload: {
        channel: "linked_payment_workflow",
        sourceId: "linked-mfg-1",
        linkedAt: "2026-03-26T08:20:00.000Z",
        paymentId: "pay-mfg-1",
        paymentReference: "TREASURY-3000",
        bodyText:
          "Shared services paid for SI-MFG-2001 and SI-MFG-2002 across Laguna and Cebu. Please route for strategic approval.",
        attachments: [],
        metadata: {
          scenarioId: "manufacturer-centralized-payer-approval",
        },
      },
    },
    {
      id: "payload-imp-1",
      scenarioId: "importer-proof-upload-unmatched-cash",
      title: "Proof-of-payment upload for unmatched importer cash",
      kind: "upload",
      payload: {
        channel: "upload",
        sourceId: "upload-imp-1",
        uploadedAt: "2026-03-23T10:15:00.000Z",
        uploadedBy: "collector.demo",
        fileName: "pacific-imports-proof.png",
        bodyText:
          "Proof of payment for SI-IMP-3001. Payment UPLD-POP-1200 was already sent and should match the kept promise from March 23.",
        attachments: [
          {
            documentId: "doc-imp-proof-1",
            fileName: "pacific-imports-proof.png",
            checksum: "sha256-proof-imp-1",
            mimeType: "image/png",
            source: "manual",
            uploadedAt: "2026-03-23T10:15:00.000Z",
            storageKey: "proofs/pacific-imports-proof-1.png",
          },
        ],
        metadata: {
          scenarioId: "importer-proof-upload-unmatched-cash",
          proofType: "proof_of_payment",
        },
      },
    },
    {
      id: "payload-dist-2",
      scenarioId: "distributor-short-pay-partial-dispute",
      title: "Short-pay dispute email",
      kind: "email_inbox",
      payload: {
        channel: "email_inbox",
        sourceId: "email-dist-2",
        receivedAt: "2026-03-26T09:30:00.000Z",
        fromEmail: "claims@luzondistributor.example",
        fromName: "Luzon Distributor Claims",
        subject: "Short pay on SI-DIST-1002",
        bodyText:
          "We only paid PHP 9,000.00 because part of SI-DIST-1002 is damaged. Our March 20 payment promise could not be met in full.",
        attachments: [],
        metadata: {
          scenarioId: "distributor-short-pay-partial-dispute",
        },
      },
    },
    {
      id: "payload-wh-1",
      scenarioId: "wholesaler-overpayment-proof-upload",
      title: "Wholesaler overpayment upload",
      kind: "upload",
      payload: {
        channel: "upload",
        sourceId: "upload-wh-1",
        uploadedAt: "2026-03-25T11:00:00.000Z",
        uploadedBy: "collector.demo",
        fileName: "harbor-wholesale-proof.pdf",
        bodyText:
          "Attached proof for OVERPAY-1050 covering SI-WH-4001. Excess amount should remain unmatched pending refund or credit guidance.",
        attachments: [
          {
            documentId: "doc-wh-proof-1",
            fileName: "harbor-wholesale-proof.pdf",
            checksum: "sha256-proof-wh-1",
            mimeType: "application/pdf",
            source: "manual",
            uploadedAt: "2026-03-25T11:00:00.000Z",
            storageKey: "proofs/harbor-wholesale-proof-1.pdf",
          },
        ],
        metadata: {
          scenarioId: "wholesaler-overpayment-proof-upload",
          proofType: "proof_of_payment",
        },
      },
    },
    {
      id: "payload-mfg-2",
      scenarioId: "manufacturer-centralized-payer-unidentified",
      title: "Ambiguous centralized remittance email",
      kind: "email_inbox",
      payload: {
        channel: "email_inbox",
        sourceId: "email-mfg-2",
        receivedAt: "2026-03-26T10:00:00.000Z",
        fromEmail: "sharedservices@archipelago.example",
        fromName: "Archipelago Shared Services",
        subject: "Payment UNKNOWN-875",
        bodyText:
          "A centralized payment was made for one of our branch invoices, but the message does not clearly identify which branch or billing account.",
        attachments: [],
        metadata: {
          scenarioId: "manufacturer-centralized-payer-unidentified",
        },
      },
    },
  ];
}

function buildParentAccounts(): ParentAccount[] {
  return [
    makeParentAccount({
      id: "parent-dist-1",
      name: "Luzon Distributor Group",
    }),
    makeParentAccount({
      id: "parent-mfg-1",
      name: "Archipelago Manufacturing Holdings",
      centrallyServiced: true,
    }),
    makeParentAccount({
      id: "parent-imp-1",
      name: "Pacific Imports and Wholesale",
    }),
    makeParentAccount({
      id: "parent-wh-1",
      name: "Harbor Wholesale Hub",
    }),
  ];
}

function buildBillingAccounts(): BillingAccount[] {
  return [
    makeAccount({
      id: "bill-dist-1",
      parentAccountId: "parent-dist-1",
      accountNumber: "DIST-001",
      displayName: "Luzon Distributor Group - Manila",
      accountTier: "standard",
      centrallyPaid: false,
    }),
    makeAccount({
      id: "bill-dist-2",
      parentAccountId: "parent-dist-1",
      accountNumber: "DIST-002",
      displayName: "Luzon Distributor Group - Pampanga",
      accountTier: "standard",
      centrallyPaid: false,
    }),
    makeAccount({
      id: "bill-mfg-1",
      parentAccountId: "parent-mfg-1",
      accountNumber: "MFG-001",
      displayName: "Archipelago Manufacturing HQ",
      accountTier: "strategic",
      centrallyPaid: true,
      branchId: "branch-mfg-hq",
    }),
    makeAccount({
      id: "bill-mfg-2",
      parentAccountId: "parent-mfg-1",
      accountNumber: "MFG-002",
      displayName: "Archipelago Manufacturing Shared Services",
      accountTier: "standard",
      centrallyPaid: true,
    }),
    makeAccount({
      id: "bill-imp-1",
      parentAccountId: "parent-imp-1",
      accountNumber: "IMP-001",
      displayName: "Pacific Imports and Wholesale - NCR",
      accountTier: "standard",
      centrallyPaid: false,
    }),
    makeAccount({
      id: "bill-wh-1",
      parentAccountId: "parent-wh-1",
      accountNumber: "WH-001",
      displayName: "Harbor Wholesale Hub - Cebu",
      accountTier: "standard",
      centrallyPaid: false,
    }),
  ];
}

function buildBranches(): Branch[] {
  return [
    makeBranch({
      id: "branch-dist-manila",
      parentAccountId: "parent-dist-1",
      billingAccountId: "bill-dist-1",
      code: "MNL",
      name: "Manila Branch",
      region: "NCR",
    }),
    makeBranch({
      id: "branch-dist-pampanga",
      parentAccountId: "parent-dist-1",
      billingAccountId: "bill-dist-2",
      code: "PAM",
      name: "Pampanga Branch",
      region: "Central Luzon",
    }),
    makeBranch({
      id: "branch-mfg-hq",
      parentAccountId: "parent-mfg-1",
      billingAccountId: "bill-mfg-1",
      code: "HQ",
      name: "Head Office",
      region: "NCR",
    }),
    makeBranch({
      id: "branch-mfg-laguna",
      parentAccountId: "parent-mfg-1",
      billingAccountId: "bill-mfg-1",
      code: "LAG",
      name: "Laguna Plant",
      region: "Calabarzon",
    }),
    makeBranch({
      id: "branch-mfg-cebu",
      parentAccountId: "parent-mfg-1",
      billingAccountId: "bill-mfg-1",
      code: "CEB",
      name: "Cebu Plant",
      region: "Central Visayas",
    }),
    makeBranch({
      id: "branch-mfg-davao",
      parentAccountId: "parent-mfg-1",
      billingAccountId: "bill-mfg-2",
      code: "DAV",
      name: "Davao Shared Service Branch",
      region: "Davao Region",
    }),
    makeBranch({
      id: "branch-imp-pasay",
      parentAccountId: "parent-imp-1",
      billingAccountId: "bill-imp-1",
      code: "PAS",
      name: "Pasay Distribution Center",
      region: "NCR",
    }),
    makeBranch({
      id: "branch-wh-cebu",
      parentAccountId: "parent-wh-1",
      billingAccountId: "bill-wh-1",
      code: "CEB",
      name: "Cebu Wholesale Hub",
      region: "Central Visayas",
    }),
  ];
}

function makePromise(scenario: PilotDemoScenario): PromiseToPay {
  if (!scenario.promiseStory) {
    throw new Error(`Scenario ${scenario.id} does not include a promise story.`);
  }

  return {
    id: scenario.promiseStory.id,
    createdAt: now,
    updatedAt: now,
    parentAccountId: scenario.evaluation.account.parentAccountId,
    billingAccountId: scenario.evaluation.account.id,
    promisedAmountCents: scenario.promiseStory.promisedAmountCents,
    currency: scenario.evaluation.payment.currency,
    promiseDate: scenario.promiseStory.promiseDate,
    state: scenario.promiseStory.currentState,
    metadata: {
      scenarioId: scenario.id,
      outcome: scenario.promiseStory.outcome,
    },
  };
}

function makeParentAccount(overrides: Partial<ParentAccount>): ParentAccount {
  return {
    id: "parent-default",
    createdAt: now,
    updatedAt: now,
    name: "Default Parent",
    status: "active",
    metadata: {},
    ...overrides,
  };
}

function makeAccount(overrides: Partial<BillingAccount>): BillingAccount {
  return {
    id: "bill-default",
    createdAt: now,
    updatedAt: now,
    parentAccountId: "parent-default",
    accountNumber: "BA-DEFAULT",
    displayName: "Default Billing Account",
    currency: "PHP",
    accountTier: "standard",
    status: "active",
    centrallyPaid: false,
    metadata: {},
    ...overrides,
  };
}

function makeBranch(overrides: Partial<Branch>): Branch {
  return {
    id: "branch-default",
    createdAt: now,
    updatedAt: now,
    parentAccountId: "parent-default",
    billingAccountId: "bill-default",
    code: "DEF",
    name: "Default Branch",
    status: "active",
    countryCode: "PH",
    metadata: {},
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<CustomerInvoice>): CustomerInvoice {
  return {
    id: "inv-default",
    createdAt: now,
    updatedAt: now,
    state: "matched_to_erp",
    parentAccountId: "parent-default",
    billingAccountId: "bill-default",
    branchId: "branch-default",
    invoiceNumber: "SI-DEFAULT",
    currency: "PHP",
    amountCents: 100_000,
    metadata: {},
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<Payment> & { billingAccountId?: string }
): Payment {
  return {
    id: "pay-default",
    createdAt: now,
    updatedAt: now,
    state: "ingested_unmatched",
    parentAccountId: "parent-default",
    paymentReference: "PAY-DEFAULT",
    currency: "PHP",
    amountCents: 100_000,
    receivedAt: now,
    metadata: {},
    ...overrides,
  };
}

function makeUploadedDocument(overrides: Partial<UploadedDocument>): UploadedDocument {
  return {
    id: "doc-default",
    createdAt: now,
    updatedAt: now,
    documentType: "supporting",
    source: "portal",
    storageKey: "proofs/default-proof.pdf",
    checksum: "sha256-default",
    uploadedBy: "collector.demo",
    uploadedAt: now,
    metadata: {},
    ...overrides,
  };
}
