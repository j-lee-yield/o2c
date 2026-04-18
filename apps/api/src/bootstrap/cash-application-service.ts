import { createHash, randomUUID } from "node:crypto";
import { createActivityLogDomainHelpers, InMemoryImmutableActivityLogStore } from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  PostgresImmutableActivityLogStore,
  PostgresLearningLayerRuntimeStore,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import {
  DeterministicOperatorFeedbackCaptureService,
  InvoiceTransitionService,
  PaymentTransitionService,
  createPaymentApplication,
  type BillingAccount,
  type CustomerInvoice,
  type OperatorFeedbackTarget,
  type Payment,
  type PaymentApplication,
} from "@o2c/domain";
import { makeBillingAccount, makeInvoice, makePayment } from "@o2c/testkit";
import { getApprovalQueueService } from "./approval-queue-service.js";
import {
  getBuyerTaxProfileStore,
  getPaymentFinalityStore,
  type StoredBuyerTaxProfile,
  type StoredPaymentResidualAction,
  type StoredWithholdingComponent,
} from "./payment-finality-store.js";
import {
  buildOdooAppliedCashWritebackPreview,
  type OdooAppliedCashWritebackPreview,
} from "../integrations/odoo-cash-writeback.js";
import {
  buildQuickBooksAppliedCashWritebackPreview,
  type QuickBooksAppliedCashWritebackPreview,
} from "../integrations/quickbooks-cash-writeback.js";

type AppliedCashWritebackPreview =
  | OdooAppliedCashWritebackPreview
  | QuickBooksAppliedCashWritebackPreview;

export type CashQueueStatus =
  | "needs_review"
  | "auto_applied"
  | "unmatched"
  | "partial_applied"
  | "manually_applied";

export interface CashApplicationSummary {
  autoAppliedToday: number;
  needsReview: number;
  unmatched: number;
  partialApplied: number;
  totalUnappliedCashCents: number;
}

export interface CashApplicationMatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmountCents: number;
  paymentAmountCents: number;
  differenceCents: number;
  confidence: number;
  rationale: string;
}

export interface CashApplicationHighlightedPayment {
  paymentId: string;
  paymentReference: string;
  accountName: string;
  amountCents: number;
  receivedOn: string;
  method: string;
  reviewLabel: string;
  severityLabel: string;
  footerTag: string;
  settlementStatus?: string;
  sourceBankTransactionIds?: string[];
  withholdingSummary?: {
    recognizedAmountCents: number;
    evidenceStatus?: string;
  };
  matches: CashApplicationMatchCandidate[];
}

export interface CashAppBankAccount {
  id: string;
  bankName: string;
  accountMasked: string;
  currency: string;
  routingLevel: "billing_account";
  billingAccountId: string;
  branchCoverage: string[];
  sourceStatus: "verified" | "seeded";
}

export interface CashAppBankTransaction {
  id: string;
  bankAccountId: string;
  paymentId?: string;
  postedAt: string;
  reference: string;
  description: string;
  amountCents: number;
  direction: "credit" | "debit";
  matchStatus: "linked_payment" | "review_required" | "unmatched";
}

export interface CashAppRemittanceItem {
  id: string;
  paymentId?: string;
  source: string;
  payerName?: string;
  receivedAt: string;
  state: string;
  invoiceReferences: string[];
  amountCents?: number;
  summary: string;
}

export interface PaymentResidualAction {
  code:
    | "unapplied_cash"
    | "overpayment_hold"
    | "customer_short_pay"
    | "withholding_under_review"
    | "bank_charge_adjustment"
    | "writeoff";
  label: string;
  detail: string;
  riskLabel: string;
  defaultSelected?: boolean;
}

export interface CashAppOverviewSummary {
  totalBankedTodayCents: number;
  totalAppliedTodayCents: number;
  reviewQueueCount: number;
  remittanceAwaitingLinkCount: number;
  writebackPendingCount: number;
  unappliedCashCents: number;
}

export interface CashAppReviewRow {
  paymentId: string;
  paymentReference: string;
  accountName: string;
  bankReference?: string;
  amountCents: number;
  state: string;
  reviewReason: string;
  receivedOn: string;
  remittanceState: string;
  writebackStatus: string;
  residualAmountCents: number;
  residualType?: string;
  recommendedAction: string;
  matches: CashApplicationMatchCandidate[];
}

export interface CashAppAllocationLine {
  invoiceId: string;
  invoiceNumber: string;
  branchId?: string;
  invoiceAmountCents: number;
  openAmountCents: number;
  applyAmountCents: number;
  source: "suggested_match" | "invoice_search";
  status: "suggested" | "selected" | "applied_partial";
  rationale: string;
}

export interface CashAppFinalizeFlow {
  status: "ready" | "review_required" | "blocked";
  primaryActionLabel: string;
  helperText: string;
  requiresApproval: boolean;
}

export interface CashAppWritebackStatus {
  state: "not_started" | "staged" | "pending" | "failed" | "completed";
  detail: string;
  erpReference?: string;
}

export interface CashApplicationSession {
  id: string;
  paymentId: string;
  activeTab: "overview" | "payments" | "bank_transactions" | "remittances";
  allocationLines: CashAppAllocationLine[];
  availableInvoiceSearchResults: CashAppAllocationLine[];
  residualAmountCents: number;
  residualAction: PaymentResidualAction;
  residualActionOptions: PaymentResidualAction[];
  withholdingSummary?: {
    recognizedAmountCents: number;
    evidenceStatus?: string;
    autoClosureAllowed: boolean;
  };
  buyerTaxProfile?: StoredBuyerTaxProfile;
  writebackPreview?: AppliedCashWritebackPreview;
  finalizeFlow: CashAppFinalizeFlow;
  writebackStatus: CashAppWritebackStatus;
}

export interface CashAppContextPanel {
  paymentNotes: string[];
  remittanceNotes: string[];
  policyGuardrails: string[];
  linkedEntities: Array<{
    kind: "invoice" | "payment_application" | "remittance";
    label: string;
    detail: string;
  }>;
  withholdingNotes?: string[];
}

export interface CashApplicationConsoleView {
  summary: CashApplicationSummary;
  overviewSummary: CashAppOverviewSummary;
  bankAccount?: CashAppBankAccount;
  reviewRows: CashAppReviewRow[];
  bankTransactions: CashAppBankTransaction[];
  remittances: CashAppRemittanceItem[];
  activeSession?: CashApplicationSession;
  contextPanel?: CashAppContextPanel;
  highlightedPayment?: CashApplicationHighlightedPayment;
}

export interface CashApplicationFinalityView {
  paymentId: string;
  settlementStatus?: string;
  sourceBankTransactionIds: string[];
  withholdingComponents: StoredWithholdingComponent[];
  residualActions: StoredPaymentResidualAction[];
  buyerTaxProfile?: StoredBuyerTaxProfile;
  writebackPreview?: AppliedCashWritebackPreview;
}

class CashApplicationRecordNotFoundError extends Error {
  constructor(readonly paymentId: string) {
    super(`Cash application payment ${paymentId} was not found.`);
    this.name = "CashApplicationRecordNotFoundError";
  }
}

class CashApplicationCandidateNotFoundError extends Error {
  constructor(readonly paymentId: string, readonly invoiceId: string) {
    super(`Suggested match ${invoiceId} was not found for payment ${paymentId}.`);
    this.name = "CashApplicationCandidateNotFoundError";
  }
}

class CashApplicationActionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashApplicationActionNotAllowedError";
  }
}

type CashApplicationRecord = {
  payment: Payment;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  method: string;
  receivedOn: string;
  reviewLabel: string;
  severityLabel: string;
  footerTag: string;
  status: CashQueueStatus;
  matches: CashApplicationMatchCandidate[];
  applications: PaymentApplication[];
  notes: string[];
};

interface CashApplicationCaseRepository {
  list(): Promise<CashApplicationRecord[]>;
  get(paymentId: string): Promise<CashApplicationRecord | undefined>;
  save(record: CashApplicationRecord): Promise<void>;
}

class InMemoryCashApplicationCaseRepository implements CashApplicationCaseRepository {
  private readonly records = new Map<string, CashApplicationRecord>();

  seed(record: CashApplicationRecord) {
    this.records.set(record.payment.id, structuredClone(record));
  }

  async list(): Promise<CashApplicationRecord[]> {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async get(paymentId: string): Promise<CashApplicationRecord | undefined> {
    const record = this.records.get(paymentId);
    return record ? structuredClone(record) : undefined;
  }

  async save(record: CashApplicationRecord): Promise<void> {
    this.records.set(record.payment.id, structuredClone(record));
  }
}

type CashApplicationRecordRow = {
  queueStatus: CashQueueStatus;
  payment: Payment;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  method: string;
  receivedOn: string;
  reviewLabel: string;
  severityLabel: string;
  footerTag: string;
  matches: CashApplicationMatchCandidate[];
  applications: PaymentApplication[];
  notes: string[];
};

class PostgresCashApplicationCaseRepository implements CashApplicationCaseRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId = "default",
  ) {}

  async list(): Promise<CashApplicationRecord[]> {
    const rows = queryJsonRows<CashApplicationRecordRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            queue_status AS "queueStatus",
            (account_snapshot || jsonb_build_object('id', account_id::text)) AS "account",
            invoice_snapshots AS "invoices",
            matches,
            applications,
            notes,
            method,
            received_on AS "receivedOn",
            review_label AS "reviewLabel",
            severity_label AS "severityLabel",
            footer_tag AS "footerTag",
            (
              SELECT jsonb_build_object(
                'id', payment.id::text,
                'tenantId', payment.tenant_id,
                'createdAt', payment.created_at,
                'updatedAt', payment.updated_at,
                'state', payment.state,
                'parentAccountId', payment.parent_account_id::text,
                'billingAccountId', payment.billing_account_id::text,
                'uploadedDocumentId', payment.uploaded_document_id::text,
                'paymentReference', payment.payment_reference,
                'currency', payment.currency,
                'amountCents', payment.amount_cents,
                'receivedAt', payment.received_at,
                'metadata', payment.metadata,
                'version', payment.version
              )
            ) AS payment
          FROM cash_application_case
          INNER JOIN payment ON payment.id = cash_application_case.payment_id
          WHERE cash_application_case.tenant_id = '${quoteLiteral(this.tenantId)}'
          ORDER BY cash_application_case.updated_at DESC
        ) q
      `,
    );

    return rows.map(toCashApplicationRecord);
  }

  async get(paymentId: string): Promise<CashApplicationRecord | undefined> {
    const [row] = queryJsonRows<CashApplicationRecordRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            queue_status AS "queueStatus",
            (account_snapshot || jsonb_build_object('id', account_id::text)) AS "account",
            invoice_snapshots AS "invoices",
            matches,
            applications,
            notes,
            method,
            received_on AS "receivedOn",
            review_label AS "reviewLabel",
            severity_label AS "severityLabel",
            footer_tag AS "footerTag",
            (
              SELECT jsonb_build_object(
                'id', payment.id::text,
                'tenantId', payment.tenant_id,
                'createdAt', payment.created_at,
                'updatedAt', payment.updated_at,
                'state', payment.state,
                'parentAccountId', payment.parent_account_id::text,
                'billingAccountId', payment.billing_account_id::text,
                'uploadedDocumentId', payment.uploaded_document_id::text,
                'paymentReference', payment.payment_reference,
                'currency', payment.currency,
                'amountCents', payment.amount_cents,
                'receivedAt', payment.received_at,
                'metadata', payment.metadata,
                'version', payment.version
              )
            ) AS payment
          FROM cash_application_case
          INNER JOIN payment ON payment.id = cash_application_case.payment_id
          WHERE cash_application_case.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND cash_application_case.payment_id = '${quoteLiteral(paymentId)}'::uuid
          LIMIT 1
        ) q
      `,
    );

    return row ? toCashApplicationRecord(row) : undefined;
  }

  async save(record: CashApplicationRecord): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO cash_application_case (
          payment_id,
          tenant_id,
          queue_status,
          account_id,
          account_snapshot,
          invoice_snapshots,
          matches,
          applications,
          notes,
          method,
          received_on,
          review_label,
          severity_label,
          footer_tag,
          created_at,
          updated_at
        )
        VALUES (
          '${quoteLiteral(record.payment.id)}'::uuid,
          '${quoteLiteral(record.payment.tenantId ?? this.tenantId)}',
          '${quoteLiteral(record.status)}',
          '${quoteLiteral(record.account.id)}'::uuid,
          '${jsonLiteral(record.account)}'::jsonb,
          '${jsonLiteral(record.invoices)}'::jsonb,
          '${jsonLiteral(record.matches)}'::jsonb,
          '${jsonLiteral(record.applications)}'::jsonb,
          '${jsonLiteral(record.notes)}'::jsonb,
          '${quoteLiteral(record.method)}',
          '${quoteLiteral(record.receivedOn)}',
          '${quoteLiteral(record.reviewLabel)}',
          '${quoteLiteral(record.severityLabel)}',
          '${quoteLiteral(record.footerTag)}',
          '${quoteLiteral(record.payment.createdAt)}'::timestamptz,
          NOW()
        )
        ON CONFLICT (payment_id) DO UPDATE SET
          queue_status = EXCLUDED.queue_status,
          account_id = EXCLUDED.account_id,
          account_snapshot = EXCLUDED.account_snapshot,
          invoice_snapshots = EXCLUDED.invoice_snapshots,
          matches = EXCLUDED.matches,
          applications = EXCLUDED.applications,
          notes = EXCLUDED.notes,
          method = EXCLUDED.method,
          received_on = EXCLUDED.received_on,
          review_label = EXCLUDED.review_label,
          severity_label = EXCLUDED.severity_label,
          footer_tag = EXCLUDED.footer_tag,
          updated_at = EXCLUDED.updated_at
      `,
    );
  }
}

const databaseUrl = createDatabaseClientConfig().connectionString;
const databaseBacked = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
const inMemoryRepository = new InMemoryCashApplicationCaseRepository();
const repository: CashApplicationCaseRepository = databaseBacked
  ? new PostgresCashApplicationCaseRepository(databaseUrl)
  : inMemoryRepository;
const learningRuntimeStore = databaseBacked
  ? new PostgresLearningLayerRuntimeStore(databaseUrl)
  : undefined;
const activityStore = databaseBacked
  ? new PostgresImmutableActivityLogStore(databaseUrl)
  : new InMemoryImmutableActivityLogStore();
const paymentTransitions = new PaymentTransitionService();
const invoiceTransitions = new InvoiceTransitionService();
const operatorFeedbackCapture = new DeterministicOperatorFeedbackCaptureService();
const paymentFinalityStore = getPaymentFinalityStore();
const buyerTaxProfileStore = getBuyerTaxProfileStore();
const audit = createActivityLogDomainHelpers({
  store: activityStore,
  now: () => new Date().toISOString(),
  idGenerator: () => randomUUID(),
});
let seeded = false;
let applicationCounter = 0;

export async function getCashApplicationService() {
  if (!seeded && !databaseBacked) {
    seeded = true;
    seedCashApplicationQueue();
  }

  return {
    getConsoleView,
    getFinalityView,
    applySuggestedMatch,
    splitSuggestedMatch,
    holdAsUnapplied,
    rejectAllSuggestions,
    flagForManualReview,
    overrideResidualAction,
    getWritebackPreview,
    stageWritebackForProvider,
  };
}

function seedCashApplicationQueue() {
  const reviewAccount = makeBillingAccount({
    id: "bill-puregold",
    parentAccountId: "parent-puregold",
    displayName: "Puregold Price Club Inc.",
    accountNumber: "BA-PUREGOLD",
    accountTier: "standard",
    metadata: { contactName: "Roberto Lim" },
  });
  const reviewPayment = makePayment({
    id: "cash_payment_1",
    parentAccountId: "parent-puregold",
    billingAccountId: "bill-puregold",
    paymentReference: "PAY-2024-0235",
    amountCents: 320_000_00,
    receivedAt: "2026-03-28T00:00:00.000Z",
    state: "review_required",
    metadata: {
      method: "Bank Transfer",
      settlementStatus: "settled",
      sourceBankTransactionIds: ["bank-txn-cash-payment-1"],
      customerProfileId: "customer-profile-puregold",
    },
  });
  const reviewInvoices = [
    makeInvoice({
      id: "invoice-0945",
      parentAccountId: "parent-puregold",
      billingAccountId: "bill-puregold",
      branchId: "branch-pasig",
      invoiceNumber: "INV-2024-0945",
      amountCents: 320_000_00,
      state: "matched_to_erp",
      invoiceDate: "2026-02-01",
      dueDate: "2026-03-14",
      metadata: { openAmountCents: 320_000_00 },
    }),
    makeInvoice({
      id: "invoice-0946",
      parentAccountId: "parent-puregold",
      billingAccountId: "bill-puregold",
      branchId: "branch-pasig",
      invoiceNumber: "INV-2024-0946",
      amountCents: 315_000_00,
      state: "matched_to_erp",
      invoiceDate: "2026-02-02",
      dueDate: "2026-03-15",
      metadata: { openAmountCents: 315_000_00 },
    }),
  ];

  inMemoryRepository.seed({
    payment: reviewPayment,
    account: reviewAccount,
    invoices: reviewInvoices,
    method: "Bank Transfer",
    receivedOn: "3/28/2026",
    reviewLabel: "Review Suggested",
    severityLabel: "Medium",
    footerTag: "Missing Remittance Advice",
    status: "needs_review",
    matches: [
      {
        invoiceId: "invoice-0945",
        invoiceNumber: "INV-2024-0945",
        invoiceAmountCents: 320_000_00,
        paymentAmountCents: 320_000_00,
        differenceCents: 0,
        confidence: 0.82,
        rationale: "Exact invoice amount match and linked payer evidence were found.",
      },
      {
        invoiceId: "invoice-0946",
        invoiceNumber: "INV-2024-0946",
        invoiceAmountCents: 315_000_00,
        paymentAmountCents: 320_000_00,
        differenceCents: 5_000_00,
        confidence: 0.65,
        rationale: "Invoice number is plausible but the variance keeps this on manual review.",
      },
    ],
    applications: [],
    notes: [],
  });

  inMemoryRepository.seed(
    createTerminalRecord({
      payment: makePayment({
        id: "cash_payment_2",
        parentAccountId: "parent-sm",
        billingAccountId: "bill-sm",
        paymentReference: "PAY-2024-0234",
        amountCents: 456_000_00,
        receivedAt: "2026-03-29T09:45:00.000Z",
        state: "auto_applied",
        metadata: {
          settlementStatus: "settled",
          sourceBankTransactionIds: ["bank-txn-cash-payment-2"],
        },
      }),
      account: makeBillingAccount({
        id: "bill-sm",
        parentAccountId: "parent-sm",
        displayName: "SM Retail Inc.",
        accountNumber: "BA-SM",
      }),
      status: "auto_applied",
      amountCents: 456_000_00,
      invoices: [
        makeInvoice({
          id: "invoice-sm-1",
          parentAccountId: "parent-sm",
          billingAccountId: "bill-sm",
          branchId: "branch-sm-north",
          invoiceNumber: "INV-SM-2001",
          amountCents: 456_000_00,
          state: "paid",
          invoiceDate: "2026-03-10",
          dueDate: "2026-03-25",
          metadata: { openAmountCents: 0 },
        }),
      ],
      applications: [
        createPaymentApplication({
          id: randomUUID(),
          createdAt: "2026-03-29T09:46:00.000Z",
          paymentId: "cash_payment_2",
          invoiceId: "invoice-sm-1",
          parentAccountId: "parent-sm",
          billingAccountId: "bill-sm",
          branchId: "branch-sm-north",
          currency: "PHP",
          appliedAmountCents: 456_000_00,
          state: "applied",
          rationale: "Seeded exact cash application.",
          metadata: {
            paymentReference: "PAY-2024-0234",
          },
        }),
      ],
    })
  );

  inMemoryRepository.seed(
    createTerminalRecord({
      payment: makePayment({
        id: "cash_payment_3",
        parentAccountId: "parent-garcia",
        paymentReference: "PAY-2024-0236",
        amountCents: 125_000_00,
        receivedAt: "2026-03-28T00:00:00.000Z",
        state: "unapplied_cash",
        metadata: {
          settlementStatus: "settled",
          sourceBankTransactionIds: ["bank-txn-cash-payment-3"],
        },
      }),
      account: makeBillingAccount({
        id: "bill-garcia",
        parentAccountId: "parent-garcia",
        displayName: "Unknown - GARCIA TRADING",
        accountNumber: "BA-GARCIA",
      }),
      status: "unmatched",
      amountCents: 125_000_00,
    })
  );

  inMemoryRepository.seed(
    createTerminalRecord({
      payment: makePayment({
        id: "cash_payment_4",
        parentAccountId: "parent-robinsons",
        billingAccountId: "bill-robinsons",
        paymentReference: "PAY-2024-0237",
        amountCents: 450_000_00,
        receivedAt: "2026-03-28T00:00:00.000Z",
        state: "partially_applied",
        metadata: {
          settlementStatus: "settled",
          sourceBankTransactionIds: ["bank-txn-cash-payment-4"],
        },
      }),
      account: makeBillingAccount({
        id: "bill-robinsons",
        parentAccountId: "parent-robinsons",
        displayName: "Robinsons Supermarket Corp.",
        accountNumber: "BA-ROBINSONS",
      }),
      status: "partial_applied",
      amountCents: 450_000_00,
    })
  );
}

function createTerminalRecord(params: {
  payment: Payment;
  account: BillingAccount;
  status: Exclude<CashQueueStatus, "needs_review">;
  amountCents: number;
  invoices?: CustomerInvoice[];
  applications?: PaymentApplication[];
}): CashApplicationRecord {
  return {
    payment: params.payment,
    account: params.account,
    invoices: params.invoices ?? [],
    method: "Bank Transfer",
    receivedOn: "3/28/2026",
    reviewLabel: "Completed",
    severityLabel: "Low",
    footerTag: "No action required",
    status: params.status,
    matches: [],
    applications: params.applications ?? [],
    notes: [],
  };
}

async function getConsoleView(): Promise<CashApplicationConsoleView> {
  const snapshot = await repository.list();
  const summary: CashApplicationSummary = {
    autoAppliedToday: snapshot.filter((record) => record.status === "auto_applied").length,
    needsReview: snapshot.filter((record) => record.status === "needs_review").length,
    unmatched: snapshot.filter((record) => record.status === "unmatched").length,
    partialApplied: snapshot.filter((record) => record.status === "partial_applied").length,
    totalUnappliedCashCents: snapshot
      .filter((record) => record.status === "unmatched" || record.status === "partial_applied")
      .reduce((sum, record) => sum + getUnappliedAmount(record), 0),
  };

  const highlightedRecord = snapshot.find((record) => record.status === "needs_review");
  const overviewSummary: CashAppOverviewSummary = {
    totalBankedTodayCents: snapshot.reduce((sum, record) => sum + record.payment.amountCents, 0),
    totalAppliedTodayCents: snapshot.reduce(
      (sum, record) =>
        sum +
        record.applications.reduce((applicationSum, application) => applicationSum + application.appliedAmountCents, 0),
      0,
    ),
    reviewQueueCount: summary.needsReview,
    remittanceAwaitingLinkCount: snapshot.filter((record) => record.footerTag.includes("Remittance")).length,
    writebackPendingCount: snapshot.filter((record) => record.payment.state === "writeback_pending").length,
    unappliedCashCents: summary.totalUnappliedCashCents,
  };
  const finalityByPayment = new Map<
    string,
    {
      withholdingComponents: StoredWithholdingComponent[];
      residualActions: StoredPaymentResidualAction[];
      buyerTaxProfile?: StoredBuyerTaxProfile;
    }
  >();
  for (const record of snapshot) {
    const finality = await loadPaymentFinalityArtifacts(record);
    finalityByPayment.set(record.payment.id, finality);
  }

  return {
    summary,
    overviewSummary,
    reviewRows: snapshot.map((record) => serializeReviewRow(record, finalityByPayment.get(record.payment.id))),
    bankTransactions: highlightedRecord ? buildBankTransactions(highlightedRecord) : [],
    remittances: highlightedRecord ? buildRemittances(highlightedRecord) : [],
    ...(highlightedRecord ? { bankAccount: buildBankAccount(highlightedRecord) } : {}),
    ...(highlightedRecord
      ? { activeSession: buildActiveSession(highlightedRecord, finalityByPayment.get(highlightedRecord.payment.id)) }
      : {}),
    ...(highlightedRecord
      ? { contextPanel: buildContextPanel(highlightedRecord, finalityByPayment.get(highlightedRecord.payment.id)) }
      : {}),
    ...(highlightedRecord
      ? { highlightedPayment: serializeHighlightedPayment(highlightedRecord, finalityByPayment.get(highlightedRecord.payment.id)) }
      : {}),
  };
}

async function getFinalityView(paymentId: string): Promise<CashApplicationFinalityView> {
  const record = await requireRecord(paymentId);

  const finality = await loadPaymentFinalityArtifacts(record);
  return {
    paymentId,
    settlementStatus: readSettlementStatus(record.payment),
    sourceBankTransactionIds: readSourceBankTransactionIds(record.payment),
    withholdingComponents: finality.withholdingComponents,
    residualActions: finality.residualActions,
    ...(finality.buyerTaxProfile ? { buyerTaxProfile: finality.buyerTaxProfile } : {}),
    writebackPreview: buildWritebackPreview(record, finality),
  };
}

async function applySuggestedMatch(principal: Principal, paymentId: string, invoiceId: string) {
  const record = await requireReviewRecord(paymentId);
  const candidate = requireCandidate(record, invoiceId);
  const invoice = requireInvoice(record, invoiceId);
  const occurredAt = new Date().toISOString();
  const approvalRequestId = await maybeRequestManualApplyApproval({
    principal,
    record,
    candidate,
    invoice,
    occurredAt,
    action: "apply",
  });
  if (approvalRequestId) {
    const pendingApprovalRecord = markRecordApprovalPending({
      record,
      occurredAt,
      approvalRequestId,
      summary: `Approval requested by ${principal.id} at ${occurredAt}`,
    });
    await repository.save(pendingApprovalRecord);
    return serializeHighlightedPayment(pendingApprovalRecord);
  }
  const paymentReady = preparePaymentForApplication(record.payment, principal, occurredAt);
  const appliedPayment = paymentTransitions.transition(paymentReady, "manually_applied", {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    occurredAt,
    reason: "cash_application_manual_apply",
    metadata: {
      matchEvidence: true,
    },
  });
  const settlementArtifacts = await resolveSettlementArtifacts({
    record,
    invoice,
    candidate,
    occurredAt,
    action: "apply",
  });
  const updatedInvoice = applyToInvoice(
    invoice,
    candidate.invoiceAmountCents,
    settlementArtifacts.recognizedWithholdingAmountCents,
    occurredAt,
    canCloseInvoiceFromBankMatch(record.payment),
  );
  const application = createAppliedApplication(record, updatedInvoice, candidate.invoiceAmountCents, occurredAt);

  const updatedRecord: CashApplicationRecord = {
    ...record,
    payment: appliedPayment,
    invoices: record.invoices.map((item) => (item.id === invoiceId ? updatedInvoice : item)),
    applications: [...record.applications, application],
    status: "manually_applied",
    notes: [...record.notes, `Applied by ${principal.id} at ${occurredAt}`],
  };
  await repository.save(updatedRecord);
  await persistSettlementArtifacts(updatedRecord, settlementArtifacts);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.apply_confirmed",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      invoiceId,
      branchId: updatedInvoice.branchId ?? "",
      appliedAmountCents: candidate.invoiceAmountCents,
      recognizedWithholdingAmountCents: settlementArtifacts.recognizedWithholdingAmountCents,
    },
  });
  recordCashOperatorFeedback({
    principal,
    payment: updatedRecord.payment,
    account: updatedRecord.account,
    targetType: "payment_match",
    targetId: `${paymentId}:${invoiceId}`,
    feedbackType: "match_corrected",
    reasonCode: "operator_confirmed_match",
    beforePayload: {
      candidateInvoiceId: invoiceId,
      paymentStatus: record.status,
    },
    afterPayload: {
      appliedInvoiceId: invoiceId,
      queueStatus: updatedRecord.status,
      applications: updatedRecord.applications.map((application) => application.id),
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function splitSuggestedMatch(principal: Principal, paymentId: string, invoiceId: string) {
  const record = await requireReviewRecord(paymentId);
  const candidate = requireCandidate(record, invoiceId);
  const invoice = requireInvoice(record, invoiceId);
  const occurredAt = new Date().toISOString();
  const approvalRequestId = await maybeRequestManualApplyApproval({
    principal,
    record,
    candidate,
    invoice,
    occurredAt,
    action: "split",
  });
  if (approvalRequestId) {
    const pendingApprovalRecord = markRecordApprovalPending({
      record,
      occurredAt,
      approvalRequestId,
      summary: `Split approval requested by ${principal.id} at ${occurredAt}`,
    });
    await repository.save(pendingApprovalRecord);
    return serializeHighlightedPayment(pendingApprovalRecord);
  }
  const paymentReady = preparePaymentForApplication(record.payment, principal, occurredAt);
  const partiallyAppliedPayment = paymentTransitions.transition(paymentReady, "partially_applied", {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    occurredAt,
    reason: "cash_application_split_apply",
    metadata: {
      matchEvidence: true,
    },
  });
  const settlementArtifacts = await resolveSettlementArtifacts({
    record,
    invoice,
    candidate,
    occurredAt,
    action: "split",
  });
  const updatedInvoice = applyToInvoice(
    invoice,
    candidate.invoiceAmountCents,
    settlementArtifacts.recognizedWithholdingAmountCents,
    occurredAt,
    canCloseInvoiceFromBankMatch(record.payment),
  );
  const application = createAppliedApplication(record, updatedInvoice, candidate.invoiceAmountCents, occurredAt);

  const updatedRecord: CashApplicationRecord = {
    ...record,
    payment: partiallyAppliedPayment,
    invoices: record.invoices.map((item) => (item.id === invoiceId ? updatedInvoice : item)),
    applications: [...record.applications, application],
    status: "partial_applied",
    notes: [...record.notes, `Split by ${principal.id} at ${occurredAt}`],
  };
  await repository.save(updatedRecord);
  await persistSettlementArtifacts(updatedRecord, settlementArtifacts);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.split_confirmed",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      invoiceId,
      appliedAmountCents: candidate.invoiceAmountCents,
      unappliedAmountCents: Math.max(0, record.payment.amountCents - candidate.invoiceAmountCents),
      recognizedWithholdingAmountCents: settlementArtifacts.recognizedWithholdingAmountCents,
    },
  });
  recordCashOperatorFeedback({
    principal,
    payment: updatedRecord.payment,
    account: updatedRecord.account,
    targetType: "payment_match",
    targetId: `${paymentId}:${invoiceId}:split`,
    feedbackType: "match_corrected",
    reasonCode: "operator_split_match",
    beforePayload: {
      candidateInvoiceId: invoiceId,
      paymentStatus: record.status,
    },
    afterPayload: {
      appliedInvoiceId: invoiceId,
      queueStatus: updatedRecord.status,
      unappliedAmountCents: Math.max(0, record.payment.amountCents - candidate.invoiceAmountCents),
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function holdAsUnapplied(principal: Principal, paymentId: string) {
  const record = await requireReviewRecord(paymentId);
  const occurredAt = new Date().toISOString();
  const unappliedPayment = paymentTransitions.transition(record.payment, "unapplied_cash", {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    occurredAt,
    reason: "cash_application_hold_unapplied",
  });

  const updatedRecord: CashApplicationRecord = {
    ...record,
    payment: unappliedPayment,
    status: "unmatched",
    notes: [...record.notes, `Held as unapplied by ${principal.id} at ${occurredAt}`],
  };
  await repository.save(updatedRecord);
  await paymentFinalityStore.replaceWithholdingComponents(paymentId, []);
  await paymentFinalityStore.replaceResidualActions(paymentId, [
    {
      residualActionId: deterministicUuid(`residual:${paymentId}:hold`),
      tenantId: updatedRecord.payment.tenantId ?? "default",
      paymentId,
      residualType: "unapplied_cash",
      amountMinor: updatedRecord.payment.amountCents,
      reasonCode: "operator_hold_unapplied_cash",
      requiresApproval: false,
      status: "open",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
  ]);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.held_as_unapplied",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      unappliedAmountCents: record.payment.amountCents,
    },
  });
  recordCashOperatorFeedback({
    principal,
    payment: updatedRecord.payment,
    account: updatedRecord.account,
    targetType: "cash_application_decision",
    targetId: paymentId,
    feedbackType: "override",
    reasonCode: "operator_held_unapplied",
    beforePayload: {
      queueStatus: record.status,
    },
    afterPayload: {
      queueStatus: updatedRecord.status,
      unappliedAmountCents: record.payment.amountCents,
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function rejectAllSuggestions(principal: Principal, paymentId: string) {
  const record = await requireReviewRecord(paymentId);
  const occurredAt = new Date().toISOString();

  const updatedRecord: CashApplicationRecord = {
    ...record,
    notes: [...record.notes, `Rejected suggested matches by ${principal.id} at ${occurredAt}`],
  };
  await repository.save(updatedRecord);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.suggestions_rejected",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      candidateCount: record.matches.length,
    },
  });
  recordCashOperatorFeedback({
    principal,
    payment: updatedRecord.payment,
    account: updatedRecord.account,
    targetType: "payment_match",
    targetId: paymentId,
    feedbackType: "match_rejected",
    reasonCode: "operator_rejected_suggestions",
    beforePayload: {
      candidateCount: record.matches.length,
    },
    afterPayload: {
      queueStatus: updatedRecord.status,
      notes: updatedRecord.notes,
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function flagForManualReview(principal: Principal, paymentId: string) {
  const record = await requireReviewRecord(paymentId);
  const occurredAt = new Date().toISOString();

  const updatedRecord: CashApplicationRecord = {
    ...record,
    notes: [...record.notes, `Escalated to manual review by ${principal.id} at ${occurredAt}`],
    footerTag: "Manual review requested",
  };
  await repository.save(updatedRecord);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.manual_review_requested",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      candidateCount: record.matches.length,
    },
  });
  recordCashOperatorFeedback({
    principal,
    payment: updatedRecord.payment,
    account: updatedRecord.account,
    targetType: "cash_application_decision",
    targetId: paymentId,
    feedbackType: "override",
    reasonCode: "operator_requested_manual_review",
    beforePayload: {
      footerTag: record.footerTag,
    },
    afterPayload: {
      footerTag: updatedRecord.footerTag,
      queueStatus: updatedRecord.status,
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function overrideResidualAction(
  principal: Principal,
  paymentId: string,
  input: {
    residualType: StoredPaymentResidualAction["residualType"];
    reasonCode?: string;
    note?: string;
  },
) {
  const record = await requireRecord(paymentId);
  const occurredAt = new Date().toISOString();
  const amountMinor = Math.max(0, getUnappliedAmount(record));
  const residualAction: StoredPaymentResidualAction = {
    residualActionId: deterministicUuid(`residual:${paymentId}:${input.residualType}`),
    tenantId: record.payment.tenantId ?? "default",
    paymentId,
    invoiceId: record.applications[0]?.invoiceId ?? record.matches[0]?.invoiceId,
    residualType: input.residualType,
    amountMinor,
    reasonCode: input.reasonCode ?? defaultResidualReasonCode(input.residualType),
    requiresApproval:
      input.residualType === "writeoff" || input.residualType === "bank_charge_adjustment",
    status: "open",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  await paymentFinalityStore.replaceResidualActions(paymentId, [residualAction]);

  const existingWithholding = await paymentFinalityStore.listWithholdingComponents(paymentId);
  if (
    existingWithholding.length > 0 &&
    (input.residualType === "withholding_under_review" ||
      input.residualType === "customer_short_pay" ||
      input.residualType === "bank_charge_adjustment" ||
      input.residualType === "writeoff")
  ) {
    await paymentFinalityStore.replaceWithholdingComponents(
      paymentId,
      existingWithholding.map((component) => ({
        ...component,
        recognizedForInvoiceClosure: false,
        updatedAt: occurredAt,
      })),
    );
  }

  const updatedRecord: CashApplicationRecord = {
    ...record,
    notes: [
      ...record.notes,
      `Residual override set to ${input.residualType} by ${principal.id} at ${occurredAt}${
        input.note ? ` (${input.note})` : ""
      }`,
    ],
    footerTag:
      input.residualType === "withholding_under_review"
        ? "Withholding review required"
        : input.residualType === "bank_charge_adjustment"
          ? "Bank charge review required"
          : record.footerTag,
  };
  await repository.save(updatedRecord);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.residual_overridden",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      residualType: input.residualType,
      amountMinor,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  });

  return serializeHighlightedPayment(updatedRecord);
}

async function getWritebackPreview(
  paymentId: string,
  provider?: "odoo" | "quickbooks_online",
): Promise<AppliedCashWritebackPreview> {
  const record = await requireRecord(paymentId);
  const finality = await loadPaymentFinalityArtifacts(record);
  return buildWritebackPreview(record, finality, provider);
}

async function stageWritebackForProvider(
  principal: Principal,
  paymentId: string,
  provider?: "odoo" | "quickbooks_online",
) {
  const record = await requireRecord(paymentId);
  const finality = await loadPaymentFinalityArtifacts(record);
  const preview = buildWritebackPreview(record, finality, provider);

  if (preview.supportStatus !== "supported") {
    throw new CashApplicationActionNotAllowedError(
      preview.reason ?? `${preview.providerLabel} writeback cannot be staged safely yet.`,
    );
  }

  const occurredAt = new Date().toISOString();
  const stagedPayment = paymentTransitions.transition(record.payment, "writeback_pending", {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    occurredAt,
    reason: "cash_application_writeback_staged",
    metadata: {
      provider,
      target: preview.target,
    },
  });
  const updatedInvoices = record.invoices.map((invoice) => {
    const linkedApplication = record.applications.find((application) => application.invoiceId === invoice.id);
    if (!linkedApplication || invoice.state !== "partially_paid") {
      return invoice;
    }
    return invoiceTransitions.transition(invoice, "writeback_pending", {
      actorId: principal.id,
      actorRole: principal.roles[0] ?? "ar_manager",
      occurredAt,
      reason: "cash_application_writeback_staged",
      metadata: {
        provider,
        paymentId,
      },
    });
  });

  const updatedRecord: CashApplicationRecord = {
    ...record,
    payment: {
      ...stagedPayment,
      metadata: {
        ...stagedPayment.metadata,
        writebackProvider: provider,
        writebackTarget: preview.target,
        writebackPreview: preview,
        writebackStagedAt: occurredAt,
      },
    },
    invoices: updatedInvoices,
    notes: [...record.notes, `ERP writeback staged for ${provider} by ${principal.id} at ${occurredAt}`],
  };
  await repository.save(updatedRecord);

  audit.append({
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    action: "cash_application.writeback_staged",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      provider,
      target: preview.target,
      outcome: preview.outcome,
    },
  });

  return {
    paymentId,
    provider,
    preview,
    writebackStatus: describeWritebackStatus(updatedRecord),
  };
}

async function requireReviewRecord(paymentId: string) {
  const record = await requireRecord(paymentId);

  if (record.status !== "needs_review") {
    throw new CashApplicationActionNotAllowedError(
      `Payment ${paymentId} is no longer waiting in the review queue.`
    );
  }

  return record;
}

async function requireRecord(paymentId: string) {
  const record = await repository.get(paymentId);
  if (!record) {
    throw new CashApplicationRecordNotFoundError(paymentId);
  }
  return record;
}

function requireCandidate(record: CashApplicationRecord, invoiceId: string) {
  const candidate = record.matches.find((item) => item.invoiceId === invoiceId);
  if (!candidate) {
    throw new CashApplicationCandidateNotFoundError(record.payment.id, invoiceId);
  }
  return candidate;
}

function requireInvoice(record: CashApplicationRecord, invoiceId: string) {
  const invoice = record.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    throw new CashApplicationCandidateNotFoundError(record.payment.id, invoiceId);
  }
  return invoice;
}

function createAppliedApplication(
  record: CashApplicationRecord,
  invoice: CustomerInvoice,
  appliedAmountCents: number,
  occurredAt: string
) {
  return createPaymentApplication({
    id: randomUUID(),
    createdAt: occurredAt,
    paymentId: record.payment.id,
    invoiceId: invoice.id,
    parentAccountId: record.account.parentAccountId,
    billingAccountId: record.account.id,
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    currency: record.payment.currency,
    appliedAmountCents,
    state: "applied",
    rationale: "Confirmed by cash application operator.",
    metadata: {
      paymentReference: record.payment.paymentReference,
    },
  });
}

function applyToInvoice(
  invoice: CustomerInvoice,
  appliedAmountCents: number,
  recognizedWithholdingAmountCents: number,
  occurredAt: string,
  allowPaidClosure: boolean,
) {
  const openAmountCents = getInvoiceOpenAmount(invoice);
  const fullyCovered = appliedAmountCents + recognizedWithholdingAmountCents >= openAmountCents;
  const targetState = allowPaidClosure && fullyCovered ? "paid" : "partially_paid";
  const transitioned =
    invoice.state === targetState
      ? invoice
      : invoiceTransitions.transition(invoice, targetState, {
          actorId: "system_cash_application",
          actorRole: "system",
          occurredAt,
          reason: "cash_application_applied",
        });

  return {
    ...transitioned,
    updatedAt: occurredAt,
    metadata: {
      ...transitioned.metadata,
      cashAppliedAmountCents: appliedAmountCents,
      recognizedWithholdingAmountCents,
      openAmountCents: Math.max(0, openAmountCents - appliedAmountCents - recognizedWithholdingAmountCents),
    },
  };
}

function preparePaymentForApplication(payment: Payment, principal: Principal, occurredAt: string) {
  if (payment.state === "candidate_match_found" || payment.state === "review_required") {
    return payment;
  }

  return paymentTransitions.transition(payment, "candidate_match_found", {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "ar_manager",
    occurredAt,
    reason: "cash_application_candidate_confirmed",
  });
}

function getInvoiceOpenAmount(invoice: CustomerInvoice) {
  const openAmount = invoice.metadata.openAmountCents;
  return typeof openAmount === "number" && Number.isFinite(openAmount) ? openAmount : invoice.amountCents;
}

function getUnappliedAmount(record: CashApplicationRecord) {
  const appliedAmount = record.applications.reduce((sum, item) => sum + item.appliedAmountCents, 0);
  return Math.max(0, record.payment.amountCents - appliedAmount);
}

type SettlementArtifacts = {
  recognizedWithholdingAmountCents: number;
  withholdingComponents: StoredWithholdingComponent[];
  residualActions: StoredPaymentResidualAction[];
  buyerTaxProfile?: StoredBuyerTaxProfile;
};

async function resolveSettlementArtifacts(input: {
  record: CashApplicationRecord;
  invoice: CustomerInvoice;
  candidate: CashApplicationMatchCandidate;
  occurredAt: string;
  action: "apply" | "split";
}): Promise<SettlementArtifacts> {
  const payment = input.record.payment;
  const sourceBankTransactionIds = readSourceBankTransactionIds(payment);
  const invoiceOpenAmount = getInvoiceOpenAmount(input.invoice);
  const cashAppliedAmountCents = Math.min(input.candidate.paymentAmountCents, invoiceOpenAmount);
  const shortfallAmountCents = Math.max(0, invoiceOpenAmount - cashAppliedAmountCents);
  const remittanceStatesWithholding = textMentionsWithholding(input.record.notes.join(" ")) ||
    textMentionsWithholding(input.record.footerTag);
  const explicitWithholdingAmountCents = readNumber(payment.metadata, "withholdingAmountCents");
  const explicitWithholdingRateBps = readNumber(payment.metadata, "withholdingRateBps");
  const profileId = readCustomerProfileId(payment, input.record.account);
  const buyerTaxProfile = profileId ? await buyerTaxProfileStore.get(profileId) : undefined;
  const invoiceTaxBasisExplicit = readBoolean(input.invoice.metadata, "invoiceTaxBasisExplicit") === true ||
    readBoolean(input.invoice.metadata, "taxBasisExplicit") === true;
  const mixedGoodsServices = readBoolean(input.invoice.metadata, "mixedGoodsServices") === true ||
    readBoolean(input.invoice.metadata, "mixedTaxBasis") === true;
  const canCloseFromBankMatch = sourceBankTransactionIds.length > 0;

  let recognizedWithholdingAmountCents = 0;
  let withholdingComponents: StoredWithholdingComponent[] = [];
  let residualActions: StoredPaymentResidualAction[] = [];
  let learnedBuyerTaxProfile = buyerTaxProfile;

  if (
    canCloseFromBankMatch &&
    shortfallAmountCents > 0 &&
    !mixedGoodsServices &&
    invoiceTaxBasisExplicit &&
    (explicitWithholdingAmountCents === shortfallAmountCents || remittanceStatesWithholding)
  ) {
    recognizedWithholdingAmountCents = explicitWithholdingAmountCents ?? shortfallAmountCents;
    const withholdingType = resolveWithholdingType(input.invoice, buyerTaxProfile);
    const withholdingRateBps =
      explicitWithholdingRateBps ?? inferWithholdingRateBps(invoiceOpenAmount, recognizedWithholdingAmountCents);
    withholdingComponents = [
      {
        withholdingComponentId: deterministicUuid(`withholding:${payment.id}:${input.invoice.id}`),
        tenantId: payment.tenantId ?? "default",
        paymentId: payment.id,
        invoiceId: input.invoice.id,
        withholdingType,
        ...(withholdingRateBps !== undefined ? { withholdingRateBps } : {}),
        withholdingAmountMinor: recognizedWithholdingAmountCents,
        evidenceStatus: explicitWithholdingAmountCents !== undefined ? "remittance_only" : "remittance_only",
        recognizedForInvoiceClosure: true,
        notes: "Recognized from matched bank transaction plus explicit withholding evidence.",
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      },
    ];
    if (profileId) {
      learnedBuyerTaxProfile = await buyerTaxProfileStore.learnFromSettlement({
        profileId,
        tenantId: payment.tenantId ?? "default",
        withholdingType: mapWithholdingTypeToProfile(withholdingType),
        ...(withholdingRateBps !== undefined ? { withholdingRateBps } : {}),
        evidenceStatus: "remittance_only",
        notes: "learned from historical payment settlement",
      });
    }
  } else if (shortfallAmountCents > 0) {
    residualActions = [
      {
        residualActionId: deterministicUuid(`residual:${payment.id}:${input.invoice.id}:${input.action}`),
        tenantId: payment.tenantId ?? "default",
        paymentId: payment.id,
        invoiceId: input.invoice.id,
        residualType: remittanceStatesWithholding ? "withholding_under_review" : "customer_short_pay",
        amountMinor: shortfallAmountCents,
        reasonCode: remittanceStatesWithholding
          ? "possible_bir_withholding_unconfirmed"
          : "short_payment_unexplained",
        requiresApproval: false,
        status: "open",
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      },
    ];
  }

  const overpaymentAmountCents = Math.max(0, payment.amountCents - cashAppliedAmountCents);
  if (overpaymentAmountCents > 0) {
    residualActions.push({
      residualActionId: deterministicUuid(`residual:${payment.id}:${input.invoice.id}:overpayment`),
      tenantId: payment.tenantId ?? "default",
      paymentId: payment.id,
      invoiceId: input.invoice.id,
      residualType: "overpayment_hold",
      amountMinor: overpaymentAmountCents,
      reasonCode: "overpayment_hold",
      requiresApproval: false,
      status: "open",
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  return {
    recognizedWithholdingAmountCents,
    withholdingComponents,
    residualActions,
    ...(learnedBuyerTaxProfile ? { buyerTaxProfile: learnedBuyerTaxProfile } : {}),
  };
}

async function persistSettlementArtifacts(record: CashApplicationRecord, artifacts: SettlementArtifacts) {
  await paymentFinalityStore.replaceWithholdingComponents(record.payment.id, artifacts.withholdingComponents);
  await paymentFinalityStore.replaceResidualActions(record.payment.id, artifacts.residualActions);
}

async function loadPaymentFinalityArtifacts(record: CashApplicationRecord) {
  const withholdingComponents = await paymentFinalityStore.listWithholdingComponents(record.payment.id);
  const residualActions = await paymentFinalityStore.listResidualActions(record.payment.id);
  const profileId = readCustomerProfileId(record.payment, record.account);
  const buyerTaxProfile = profileId ? await buyerTaxProfileStore.get(profileId) : undefined;
  return {
    withholdingComponents,
    residualActions,
    ...(buyerTaxProfile ? { buyerTaxProfile } : {}),
  };
}

function canCloseInvoiceFromBankMatch(payment: Payment) {
  return readSourceBankTransactionIds(payment).length > 0;
}

function readSourceBankTransactionIds(payment: Payment) {
  const sourceIds = payment.metadata.sourceBankTransactionIds;
  return Array.isArray(sourceIds)
    ? sourceIds.filter((value): value is string => typeof value === "string")
    : [];
}

function readSettlementStatus(payment: Payment) {
  const settlementStatus = payment.settlementStatus ?? payment.metadata.settlementStatus;
  return typeof settlementStatus === "string" ? settlementStatus : undefined;
}

function readWritebackPreview(payment: Payment) {
  const preview = payment.metadata.writebackPreview;
  if (!preview || typeof preview !== "object") {
    return undefined;
  }
  return preview as AppliedCashWritebackPreview;
}

function readCustomerProfileId(payment: Payment, account: BillingAccount) {
  const paymentProfileId = payment.metadata.customerProfileId;
  if (typeof paymentProfileId === "string" && paymentProfileId.length > 0) {
    return paymentProfileId;
  }
  const accountProfileId = account.metadata.customerProfileId;
  return typeof accountProfileId === "string" && accountProfileId.length > 0 ? accountProfileId : undefined;
}

function resolveWithholdingType(
  invoice: CustomerInvoice,
  profile: StoredBuyerTaxProfile | undefined,
): StoredWithholdingComponent["withholdingType"] {
  const invoiceType = invoice.metadata.withholdingType;
  if (invoiceType === "cwt_goods" || invoiceType === "cwt_services" || invoiceType === "cwt_special_goods") {
    return invoiceType;
  }
  if (profile?.withholdingDefaultType === "goods") {
    return "cwt_goods";
  }
  if (profile?.withholdingDefaultType === "services") {
    return "cwt_services";
  }
  if (profile?.withholdingDefaultType === "special_goods") {
    return "cwt_special_goods";
  }
  return "unknown";
}

function mapWithholdingTypeToProfile(
  withholdingType: StoredWithholdingComponent["withholdingType"],
): StoredBuyerTaxProfile["withholdingDefaultType"] {
  switch (withholdingType) {
    case "cwt_goods":
      return "goods";
    case "cwt_services":
      return "services";
    case "cwt_special_goods":
      return "special_goods";
    default:
      return "none";
  }
}

function inferWithholdingRateBps(grossAmountCents: number, withholdingAmountCents: number) {
  if (grossAmountCents <= 0 || withholdingAmountCents <= 0) {
    return undefined;
  }
  return Math.round((withholdingAmountCents / grossAmountCents) * 10_000);
}

function serializeHighlightedPayment(
  record: CashApplicationRecord,
  finality?: {
    withholdingComponents: StoredWithholdingComponent[];
    residualActions: StoredPaymentResidualAction[];
    buyerTaxProfile?: StoredBuyerTaxProfile;
  },
): CashApplicationHighlightedPayment {
  const recognizedAmountCents = finality?.withholdingComponents
    .filter((component) => component.recognizedForInvoiceClosure)
    .reduce((sum, component) => sum + component.withholdingAmountMinor, 0);
  return {
    paymentId: record.payment.id,
    paymentReference: record.payment.paymentReference,
    accountName: record.account.displayName,
    amountCents: record.payment.amountCents,
    receivedOn: record.receivedOn,
    method: record.method,
    reviewLabel: record.reviewLabel,
    severityLabel: record.severityLabel,
    footerTag: record.footerTag,
    ...(readSettlementStatus(record.payment) ? { settlementStatus: readSettlementStatus(record.payment) } : {}),
    ...(readSourceBankTransactionIds(record.payment).length > 0
      ? { sourceBankTransactionIds: readSourceBankTransactionIds(record.payment) }
      : {}),
    ...(recognizedAmountCents && recognizedAmountCents > 0
      ? {
          withholdingSummary: {
            recognizedAmountCents,
            evidenceStatus: finality?.withholdingComponents[0]?.evidenceStatus,
          },
        }
      : {}),
    matches: record.matches,
  };
}

function serializeReviewRow(
  record: CashApplicationRecord,
  finality?: {
    withholdingComponents: StoredWithholdingComponent[];
    residualActions: StoredPaymentResidualAction[];
    buyerTaxProfile?: StoredBuyerTaxProfile;
  },
): CashAppReviewRow {
  return {
    paymentId: record.payment.id,
    paymentReference: record.payment.paymentReference,
    accountName: record.account.displayName,
    ...(record.payment.paymentReference ? { bankReference: record.payment.paymentReference } : {}),
    amountCents: record.payment.amountCents,
    state: humanizeCashQueueStatus(record.status),
    reviewReason: describeReviewReason(record),
    receivedOn: record.receivedOn,
    remittanceState: describeRemittanceState(record),
    writebackStatus: describeWritebackStatus(record).detail,
    residualAmountCents: getUnappliedAmount(record),
    ...(finality?.residualActions[0] ? { residualType: finality.residualActions[0].residualType } : {}),
    recommendedAction: describeRecommendedAction(record),
    matches: record.matches,
  };
}

function buildBankAccount(record: CashApplicationRecord): CashAppBankAccount {
  return {
    id: `bank-${record.account.id}`,
    bankName: record.account.displayName.includes("Puregold") ? "BDO Unibank" : "Bank of the Philippine Islands",
    accountMasked: record.account.displayName.includes("Puregold") ? "****-1045" : "****-8821",
    currency: record.payment.currency,
    routingLevel: "billing_account",
    billingAccountId: record.account.id,
    branchCoverage: Array.from(
      new Set(record.invoices.map((invoice) => invoice.branchId).filter((value): value is string => Boolean(value))),
    ),
    sourceStatus: "seeded",
  };
}

function buildBankTransactions(record: CashApplicationRecord): CashAppBankTransaction[] {
  return [
    {
      id: `${record.payment.id}-credit`,
      bankAccountId: `bank-${record.account.id}`,
      paymentId: record.payment.id,
      postedAt: record.payment.receivedAt,
      reference: record.payment.paymentReference,
      description: `${record.method} credit for ${record.account.displayName}`,
      amountCents: record.payment.amountCents,
      direction: "credit",
      matchStatus: record.status === "needs_review" ? "review_required" : "linked_payment",
    },
    {
      id: `${record.payment.id}-bank-fee`,
      bankAccountId: `bank-${record.account.id}`,
      postedAt: record.payment.receivedAt,
      reference: `${record.payment.paymentReference}-FEE`,
      description: "Bank fee placeholder visible until residual treatment is finalized.",
      amountCents: 2500,
      direction: "debit",
      matchStatus: "unmatched",
    },
  ];
}

function buildRemittances(record: CashApplicationRecord): CashAppRemittanceItem[] {
  return [
    {
      id: `${record.payment.id}-remittance-1`,
      paymentId: record.payment.id,
      source: "email",
      payerName: record.account.displayName,
      receivedAt: record.payment.receivedAt,
      state: record.footerTag.includes("Remittance") ? "review_required" : "linked_to_payment",
      invoiceReferences: record.matches.map((match) => match.invoiceNumber),
      amountCents: record.payment.amountCents,
      summary:
        record.footerTag.includes("Remittance")
          ? "Payment landed before advice was verified, so the remittance stays in review."
          : "Remittance evidence is linked to the payment and kept visible for allocation review.",
    },
    {
      id: `${record.payment.id}-remittance-2`,
      source: "uploaded_proof",
      receivedAt: record.payment.receivedAt,
      state: "parsed_structured",
      invoiceReferences: record.matches.slice(0, 1).map((match) => match.invoiceNumber),
      summary: "Uploaded proof remains visible but does not override payment or remittance state rules.",
    },
  ];
}

function buildActiveSession(
  record: CashApplicationRecord,
  finality?: {
    withholdingComponents: StoredWithholdingComponent[];
    residualActions: StoredPaymentResidualAction[];
    buyerTaxProfile?: StoredBuyerTaxProfile;
  },
): CashApplicationSession {
  const selectedAllocation = record.matches[0];
  const selectedInvoice = selectedAllocation
    ? record.invoices.find((invoice) => invoice.id === selectedAllocation.invoiceId)
    : undefined;
  const allocationLines: CashAppAllocationLine[] =
    selectedAllocation && selectedInvoice
      ? [
          {
            invoiceId: selectedAllocation.invoiceId,
            invoiceNumber: selectedAllocation.invoiceNumber,
            ...(selectedInvoice.branchId ? { branchId: selectedInvoice.branchId } : {}),
            invoiceAmountCents: selectedAllocation.invoiceAmountCents,
            openAmountCents: getInvoiceOpenAmount(selectedInvoice),
            applyAmountCents: selectedAllocation.invoiceAmountCents,
            source: "suggested_match",
            status: "selected",
            rationale: selectedAllocation.rationale,
          },
        ]
      : [];
  const availableInvoiceSearchResults: CashAppAllocationLine[] = record.matches.map((candidate) => {
    const invoice = record.invoices.find((item) => item.id === candidate.invoiceId);
    return {
      invoiceId: candidate.invoiceId,
      invoiceNumber: candidate.invoiceNumber,
      ...(invoice?.branchId ? { branchId: invoice.branchId } : {}),
      invoiceAmountCents: candidate.invoiceAmountCents,
      openAmountCents: invoice ? getInvoiceOpenAmount(invoice) : candidate.invoiceAmountCents,
      applyAmountCents: Math.min(candidate.invoiceAmountCents, record.payment.amountCents),
      source: "invoice_search",
      status: candidate.invoiceId === selectedAllocation?.invoiceId ? "selected" : "suggested",
      rationale: candidate.rationale,
    };
  });
  const residualAmountCents = Math.max(
    0,
    record.payment.amountCents - allocationLines.reduce((sum, line) => sum + line.applyAmountCents, 0),
  );
  const residualActionOptions: PaymentResidualAction[] = [
    {
      code: "unapplied_cash",
      label: "Leave as unapplied cash",
      detail: "Safe default while the remaining funds stay parked and visible to operators.",
      riskLabel: "Lowest risk",
    },
    {
      code: "overpayment_hold",
      label: "Hold as overpayment",
      detail: "Keep confirmed excess cash available for sibling invoices or later direction.",
      riskLabel: "Conservative",
    },
    {
      code: "customer_short_pay",
      label: "Mark as customer short pay",
      detail: "Use when the buyer paid less than expected and no withholding evidence closes the gap.",
      riskLabel: "Needs triage",
    },
    {
      code: "withholding_under_review",
      label: "Hold as withholding under review",
      detail: "Preserve the shortfall as a possible tax withholding until evidence is confirmed.",
      riskLabel: "Needs tax review",
    },
    {
      code: "bank_charge_adjustment",
      label: "Treat as bank fee",
      detail: "Only valid when policy and evidence support a small bank-charge variance.",
      riskLabel: "Controlled override",
    },
    {
      code: "writeoff",
      label: "Propose write-off",
      detail: "Use only for approved residual cleanup after the business decision is explicit.",
      riskLabel: "Approval required",
    },
  ];
  const selectedResidualType =
    finality?.residualActions[0]?.residualType ??
    (residualAmountCents > 0 ? "unapplied_cash" : "unapplied_cash");
  const residualAction =
    residualActionOptions.find((option) => option.code === selectedResidualType) ??
    residualActionOptions[0] ?? {
      code: "unapplied_cash",
      label: "Leave as unapplied cash",
      detail: "Safe default while the remaining funds stay parked and visible to operators.",
      riskLabel: "Lowest risk",
    };

  return {
    id: `session-${record.payment.id}`,
    paymentId: record.payment.id,
    activeTab: "overview",
    allocationLines,
    availableInvoiceSearchResults,
    residualAmountCents,
    residualAction,
    residualActionOptions,
    ...(finality?.withholdingComponents.length
      ? {
          withholdingSummary: {
            recognizedAmountCents: finality.withholdingComponents.reduce(
              (sum, component) => sum + component.withholdingAmountMinor,
              0,
            ),
            evidenceStatus: finality.withholdingComponents[0]?.evidenceStatus,
            autoClosureAllowed: finality.withholdingComponents.some(
              (component) => component.recognizedForInvoiceClosure,
            ),
          },
        }
      : {}),
    ...(finality?.buyerTaxProfile ? { buyerTaxProfile: finality.buyerTaxProfile } : {}),
    writebackPreview: buildWritebackPreview(record, finality),
    finalizeFlow: {
      status: hasPendingApproval(record)
        ? "blocked"
        : record.status === "needs_review"
          ? "review_required"
          : "ready",
      primaryActionLabel: "Finalize allocation and stage writeback",
      helperText:
        "Finalization only stages writeback after operator-reviewed allocations, preserving payment_application and remittance safety rules.",
      requiresApproval: hasPendingApproval(record),
    },
    writebackStatus: describeWritebackStatus(record),
  };
}

function buildContextPanel(
  record: CashApplicationRecord,
  finality?: {
    withholdingComponents: StoredWithholdingComponent[];
    residualActions: StoredPaymentResidualAction[];
    buyerTaxProfile?: StoredBuyerTaxProfile;
  },
): CashAppContextPanel {
  return {
    paymentNotes: [
      `${record.account.displayName} is routed at the billing-account level by default.`,
      "Branch identity is preserved on every selected invoice before any payment_application is staged.",
      ...record.notes,
    ],
    remittanceNotes: [
      "Conflicting or missing remittance evidence keeps the payment in review.",
      "Parsed proof is visible to the operator but does not silently alter ERP truth.",
    ],
    policyGuardrails: [
      "No auto-apply under cross-entity ambiguity or remittance conflict.",
      "Disputed invoices must stay out of automatic chase and unsafe application flows.",
      "Failed or unavailable writeback paths must remain visible before finalize is allowed.",
    ],
    linkedEntities: [
      ...record.invoices.map((invoice) => ({
        kind: "invoice" as const,
        label: invoice.invoiceNumber,
        detail: `Open ${formatPhp(getInvoiceOpenAmount(invoice))}${invoice.branchId ? ` • ${invoice.branchId}` : ""}`,
      })),
      ...record.applications.map((application) => ({
        kind: "payment_application" as const,
        label: application.id,
        detail: `${formatPhp(application.appliedAmountCents)} • ${application.state}`,
      })),
      {
        kind: "remittance" as const,
        label: `${record.payment.id}-remittance-1`,
        detail: describeRemittanceState(record),
      },
    ],
    ...(finality?.withholdingComponents.length || finality?.buyerTaxProfile
      ? {
          withholdingNotes: [
            ...(finality?.withholdingComponents.length
              ? [
                  `Recognized withholding: ${formatPhp(
                    finality.withholdingComponents.reduce(
                      (sum, component) => sum + component.withholdingAmountMinor,
                      0,
                    ),
                  )} (${finality.withholdingComponents[0]?.evidenceStatus ?? "none"}).`,
                ]
              : []),
            ...(finality?.buyerTaxProfile
              ? [
                  `Buyer tax profile: ${finality.buyerTaxProfile.withholdingDefaultType} default, historical score ${(
                    finality.buyerTaxProfile.historicalWithholdingBehaviorScore ?? 0
                  ).toFixed(2)}.`,
                ]
              : []),
          ],
        }
      : {}),
  };
}

function buildWritebackPreview(
  record: CashApplicationRecord,
  finality:
    | {
        withholdingComponents: StoredWithholdingComponent[];
        residualActions: StoredPaymentResidualAction[];
        buyerTaxProfile?: StoredBuyerTaxProfile;
      }
    | undefined,
  provider?: "odoo" | "quickbooks_online",
): AppliedCashWritebackPreview {
  const resolvedFinality = finality ?? {
    withholdingComponents: [],
    residualActions: [],
  };
  const resolvedProvider = provider ?? resolveWritebackProvider(record);
  switch (resolvedProvider) {
    case "odoo":
      return buildOdooAppliedCashWritebackPreview({
        payment: record.payment,
        account: record.account,
        invoices: record.invoices,
        applications: record.applications,
        withholdingComponents: resolvedFinality.withholdingComponents,
        residualActions: resolvedFinality.residualActions,
        settlementStatus: readSettlementStatus(record.payment),
        sourceBankTransactionIds: readSourceBankTransactionIds(record.payment),
      });
    case "quickbooks_online":
      return buildQuickBooksAppliedCashWritebackPreview({
        payment: record.payment,
        account: record.account,
        invoices: record.invoices,
        applications: record.applications,
        withholdingComponents: resolvedFinality.withholdingComponents,
        residualActions: resolvedFinality.residualActions,
        settlementStatus: readSettlementStatus(record.payment),
        sourceBankTransactionIds: readSourceBankTransactionIds(record.payment),
      });
    default:
      return buildOdooAppliedCashWritebackPreview({
        payment: record.payment,
        account: record.account,
        invoices: record.invoices,
        applications: record.applications,
        withholdingComponents: resolvedFinality.withholdingComponents,
        residualActions: resolvedFinality.residualActions,
        settlementStatus: readSettlementStatus(record.payment),
        sourceBankTransactionIds: readSourceBankTransactionIds(record.payment),
      });
  }
}

function resolveWritebackProvider(record: CashApplicationRecord): "odoo" | "quickbooks_online" {
  const explicitProvider = record.payment.metadata.writebackProvider;
  if (explicitProvider === "quickbooks_online" || explicitProvider === "odoo") {
    return explicitProvider;
  }

  const paymentImportProvider = record.payment.metadata.importProvider;
  if (paymentImportProvider === "quickbooks_online" || paymentImportProvider === "odoo") {
    return paymentImportProvider;
  }

  const accountProvider = record.account.metadata.importProvider;
  if (accountProvider === "quickbooks_online" || accountProvider === "odoo") {
    return accountProvider;
  }

  const invoiceProviders = new Set(
    record.invoices
      .map((invoice) => invoice.metadata.importProvider)
      .filter(
        (provider): provider is "quickbooks_online" | "odoo" =>
          provider === "quickbooks_online" || provider === "odoo",
      ),
  );
  if (invoiceProviders.size === 1) {
    return Array.from(invoiceProviders)[0]!;
  }

  return "odoo";
}

function defaultResidualReasonCode(residualType: StoredPaymentResidualAction["residualType"]) {
  switch (residualType) {
    case "unapplied_cash":
      return "operator_hold_unapplied_cash";
    case "overpayment_hold":
      return "operator_marked_overpayment_hold";
    case "customer_short_pay":
      return "operator_marked_short_pay";
    case "withholding_under_review":
      return "operator_marked_withholding_review";
    case "bank_charge_adjustment":
      return "operator_marked_bank_charge_review";
    case "writeoff":
      return "operator_proposed_writeoff";
  }
}

function describeReviewReason(record: CashApplicationRecord) {
  if (hasPendingApproval(record)) {
    return "Approval is pending before this cash application can be confirmed.";
  }
  if (record.footerTag.includes("Remittance")) {
    return "Remittance evidence is incomplete, so the operator must confirm the allocation.";
  }
  if (record.status === "partial_applied") {
    return "Residual cash remains after application and needs an explicit operator action.";
  }
  if (record.status === "unmatched") {
    return "Payer identification is still insufficient for a safe application.";
  }
  return "Candidate match is available but still requires operator confirmation.";
}

function describeRecommendedAction(record: CashApplicationRecord) {
  if (hasPendingApproval(record)) {
    return "Wait for approval before applying cash or staging ERP writeback.";
  }
  if (record.status === "needs_review") {
    return "Confirm allocation, choose residual treatment, then stage writeback.";
  }
  if (record.status === "partial_applied") {
    return "Resolve the residual before staging or retrying ERP writeback.";
  }
  if (record.status === "unmatched") {
    return "Collect remittance or bank proof before any money movement.";
  }
  return "Monitor writeback outcome and audit trail.";
}

function describeRemittanceState(record: CashApplicationRecord) {
  if (hasPendingApproval(record)) {
    return "Approval pending before remittance-backed allocation can proceed";
  }
  if (record.footerTag.includes("Remittance")) {
    return "Awaiting remittance verification";
  }
  if (record.status === "unmatched") {
    return "No remittance linked";
  }
  return "Linked or reviewable evidence on file";
}

function describeWritebackStatus(record: CashApplicationRecord): CashAppWritebackStatus {
  const stagedPreview = readWritebackPreview(record.payment);
  if (hasPendingApproval(record)) {
    const pendingApprovalId = getPendingApprovalId(record);
    return {
      state: "not_started",
      detail: "Writeback is blocked until the requested approval is resolved.",
      ...(pendingApprovalId ? { erpReference: pendingApprovalId } : {}),
    };
  }
  if (record.payment.state === "writeback_pending") {
    return {
      state: "pending",
      detail:
        stagedPreview?.supportStatus === "supported"
          ? `${stagedPreview.providerLabel} writeback has been staged and is awaiting completion.`
          : "ERP writeback has been staged and is awaiting completion.",
      erpReference: record.payment.paymentReference,
    };
  }
  if (record.payment.state === "writeback_failed") {
    return {
      state: "failed",
      detail: "ERP writeback failed and must be retried explicitly.",
      erpReference: record.payment.paymentReference,
    };
  }
  if (stagedPreview?.supportStatus === "manual_required") {
    return {
      state: "staged",
      detail:
        stagedPreview.reason ??
        `${stagedPreview.providerLabel} needs manual settlement handling before push can proceed.`,
      erpReference: record.payment.paymentReference,
    };
  }
  if (record.status === "auto_applied" || record.status === "manually_applied" || record.status === "partial_applied") {
    return {
      state: "staged",
      detail: "Ready to stage ERP writeback once the allocation pack is finalized.",
      erpReference: record.payment.paymentReference,
    };
  }
  return {
    state: "not_started",
    detail: "Writeback is blocked until review, residual treatment, and remittance checks are complete.",
  };
}

async function maybeRequestManualApplyApproval(input: {
  principal: Principal;
  record: CashApplicationRecord;
  candidate: CashApplicationMatchCandidate;
  invoice: CustomerInvoice;
  occurredAt: string;
  action: "apply" | "split";
}) {
  if (!manualApplyRequiresApproval(input.record, input.candidate)) {
    return undefined;
  }

  const approvalQueueService = await getApprovalQueueService();
  const approval = await approvalQueueService.createAndSubmit(input.principal, {
    requestType: "low_confidence_cash_application",
    assigneeRole: "controller",
    currentStep: "cash_application_review",
    payload: {
      summary:
        input.action === "split"
          ? `Approve split application of ${formatPhp(input.candidate.invoiceAmountCents)} to ${input.invoice.invoiceNumber}.`
          : `Approve application of ${formatPhp(input.candidate.invoiceAmountCents)} to ${input.invoice.invoiceNumber}.`,
      paymentId: input.record.payment.id,
      invoiceId: input.invoice.id,
      billingAccountId: input.record.account.id,
    },
    policyContext: {
      reasonCodes: buildManualApplyApprovalReasons(input.record, input.candidate),
      confidence: input.candidate.confidence,
      requestedAction: input.action,
    },
  });

  audit.append({
    actorId: input.principal.id,
    actorRole: input.principal.roles[0] ?? "controller",
    action: "cash_application.approval_requested",
    entityType: "payment",
    entityId: input.record.payment.id,
    metadata: {
      approvalRequestId: approval.id,
      invoiceId: input.invoice.id,
      confidence: input.candidate.confidence,
      requestedAction: input.action,
    },
  });

  return approval.id;
}

function manualApplyRequiresApproval(
  record: CashApplicationRecord,
  candidate: CashApplicationMatchCandidate,
) {
  return (
    record.account.accountTier === "strategic" ||
    candidate.confidence < 0.99 ||
    record.footerTag.includes("Remittance") ||
    record.payment.amountCents !== candidate.invoiceAmountCents
  );
}

function buildManualApplyApprovalReasons(
  record: CashApplicationRecord,
  candidate: CashApplicationMatchCandidate,
) {
  return [
    ...(candidate.confidence < 0.99 ? ["medium_confidence_match"] : []),
    ...(record.footerTag.includes("Remittance") ? ["missing_remittance"] : []),
    ...(record.account.accountTier === "strategic" ? ["strategic_account"] : []),
    ...(record.payment.amountCents !== candidate.invoiceAmountCents ? ["residual_cash_present"] : []),
  ];
}

function markRecordApprovalPending(input: {
  record: CashApplicationRecord;
  occurredAt: string;
  approvalRequestId: string;
  summary: string;
}) {
  return {
    ...input.record,
    reviewLabel: "Approval requested",
    footerTag: "Approval requested",
    notes: [...input.record.notes, input.summary],
    payment: {
      ...input.record.payment,
      updatedAt: input.occurredAt,
      metadata: {
        ...input.record.payment.metadata,
        pendingApprovalRequestId: input.approvalRequestId,
      },
    },
  };
}

function getPendingApprovalId(record: CashApplicationRecord) {
  const approvalRequestId = record.payment.metadata.pendingApprovalRequestId;
  return typeof approvalRequestId === "string" && approvalRequestId.length > 0
    ? approvalRequestId
    : undefined;
}

function hasPendingApproval(record: CashApplicationRecord) {
  return Boolean(getPendingApprovalId(record));
}

function humanizeCashQueueStatus(status: CashQueueStatus) {
  return status.replace(/_/g, " ");
}

function formatPhp(amountCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function readNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function readBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "boolean" ? value : undefined;
}

function textMentionsWithholding(value: string | undefined) {
  if (!value) {
    return false;
  }
  return /\b(withholding|withheld|cwt|w\/?tax|expanded withholding)\b/i.test(value);
}

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function recordCashOperatorFeedback(input: {
  principal: Principal;
  payment: Payment;
  account: BillingAccount;
  targetType: OperatorFeedbackTarget;
  targetId: string;
  feedbackType: "override" | "match_rejected" | "match_corrected";
  reasonCode: string;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
}) {
  if (!learningRuntimeStore) {
    return;
  }

  const result = operatorFeedbackCapture.capture({
    id: randomUUID(),
    feedbackType: input.feedbackType,
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: new Date().toISOString(),
    parentAccountId: input.account.parentAccountId,
    billingAccountId: input.account.id,
    reasonCode: input.reasonCode,
    appliesToFutureScoring: true,
    preservesSafetyRules: true,
    ...(input.beforePayload ? { beforePayload: input.beforePayload } : {}),
    ...(input.afterPayload ? { afterPayload: input.afterPayload } : {}),
    actorId: input.principal.id,
    actorRole: "user",
    metadata: {
      paymentId: input.payment.id,
      paymentReference: input.payment.paymentReference,
    },
  });

  learningRuntimeStore.persistCapture(result);
}

export {
  CashApplicationActionNotAllowedError,
  CashApplicationCandidateNotFoundError,
  CashApplicationRecordNotFoundError,
};

function toCashApplicationRecord(row: CashApplicationRecordRow): CashApplicationRecord {
  return {
    payment: row.payment,
    account: row.account,
    invoices: row.invoices,
    method: row.method,
    receivedOn: row.receivedOn,
    reviewLabel: row.reviewLabel,
    severityLabel: row.severityLabel,
    footerTag: row.footerTag,
    status: row.queueStatus,
    matches: row.matches,
    applications: row.applications,
    notes: row.notes,
  };
}
