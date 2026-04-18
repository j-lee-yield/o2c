import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type { AuditContext } from "@o2c/contracts";
import {
  ApprovalRequestService,
  deriveCashApplicationLearningBehavior,
  ExceptionTriageService,
  InvoiceTransitionService,
  PaymentTransitionService,
  createPaymentApplication,
  createTypedException,
  evaluateApprovalRequirement,
  type ApprovalRequest,
  type BillingAccount,
  type CashApplicationLearningBehavior,
  type CustomerInvoice,
  type DomainException,
  type LearningEvent,
  type OperatorFeedback,
  type Payment,
  type PaymentApplication,
} from "@o2c/domain";
import { WorkflowLearningEventFactory } from "./learning-events.js";

export interface CashApplicationAllocationInput {
  invoice: CustomerInvoice;
  amountCents: number;
}

export interface CashApplicationLedgerRecord {
  id: string;
  paymentId?: string;
  bankReference?: string;
  payerName?: string;
  payerBankAccount?: string;
  amountCents: number;
  settled: boolean;
  confirmed: boolean;
  metadata?: Record<string, unknown>;
}

export interface CashApplicationBankTransaction {
  id: string;
  bankReference: string;
  amountCents: number;
  payerName?: string;
  payerBankAccount?: string;
  metadata?: Record<string, unknown>;
}

export interface CashApplicationRemittanceEmail {
  id: string;
  subject: string;
  bodyText: string;
  payerName?: string;
  receivedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CashApplicationProofOfPayment {
  id: string;
  fileName: string;
  extractedText?: string;
  payerName?: string;
  bankReference?: string;
  payerBankAccount?: string;
  metadata?: Record<string, unknown>;
}

export interface CashApplicationErpPaymentRecord {
  id: string;
  paymentReference?: string;
  settled: boolean;
  confirmed: boolean;
  writebackPathAvailable: boolean;
  referencedInvoiceNumbers?: string[];
  metadata?: Record<string, unknown>;
}

export interface CashApplicationSettlementWebhook {
  id: string;
  status: "pending" | "settled" | "confirmed" | "failed";
  bankReference?: string;
  payerBankAccount?: string;
  metadata?: Record<string, unknown>;
}

export interface CashApplicationKnownBehavior {
  expectedPayerNames?: string[];
  expectedPayerBankAccounts?: string[];
  parentPaysForChildren?: boolean;
  parentPayerProbability?: number;
  branchReferenceBias?: boolean;
  referenceQualityScore?: number;
  remittanceUsuallyArrivesAfterPayment?: boolean;
  typicalBundleSize?: number;
  commonShortPayRate?: number;
  commonBankChargeVarianceCents?: number;
  allowBankChargeVarianceCents?: number;
  allowShortPayVarianceCents?: number;
  notes?: string;
}

export interface CashApplicationEngineInput {
  principal: Principal;
  auditContext: AuditContext;
  account: BillingAccount;
  payment: Payment;
  invoices: CustomerInvoice[];
  paymentsLedger: CashApplicationLedgerRecord[];
  bankTransactions: CashApplicationBankTransaction[];
  remittanceEmails: CashApplicationRemittanceEmail[];
  uploadedProofsOfPayment: CashApplicationProofOfPayment[];
  erpPaymentRecords: CashApplicationErpPaymentRecord[];
  settlementWebhooks: CashApplicationSettlementWebhook[];
  knownCustomerBehavior?: CashApplicationKnownBehavior;
  learningEvents?: LearningEvent[];
  operatorFeedback?: OperatorFeedback[];
  relatedAccounts?: BillingAccount[];
  autoApplyConfidenceThreshold?: number;
  reviewConfidenceThreshold?: number;
  balanceApprovalThresholdCents?: number;
  manualOverrideErpWritebackConflict?: boolean;
}

export interface CashApplicationInvoiceSignal {
  invoiceId: string;
  confidence: number;
  matchedSignals: string[];
  reasons: string[];
}

export interface CashApplicationAllocationResult {
  invoiceId: string;
  invoiceNumber: string;
  billingAccountId: string;
  branchId?: string;
  appliedAmountCents: number;
  resultingInvoiceState: CustomerInvoice["state"];
}

export interface CashApplicationWritebackStage {
  status: "staged" | "not_available";
  paymentId: string;
  billingAccountId: string;
  totalAppliedAmountCents: number;
  unappliedAmountCents: number;
  payload?: {
    paymentReference: string;
    settlementConfirmed: boolean;
    recognizedWithholdingAmountCents?: number;
    allocations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      appliedAmountCents: number;
      branchId?: string;
    }>;
  };
  reason?: string;
}

export interface CashApplicationCandidate {
  id: string;
  invoiceSignals: CashApplicationInvoiceSignal[];
  allocations: CashApplicationAllocationInput[];
  totalAllocatedCents: number;
  unappliedAmountCents: number;
  settlementConfirmed: boolean;
  invoiceSnapshotVerified: boolean;
  hasDisputeOrHold: boolean;
  accountMappingConfidence: number;
  policyAmountMatch: "exact" | "near_exact" | "partial" | "mismatch";
  crossEntityAmbiguity: boolean;
  conflictingRemittanceData: boolean;
  erpWritebackPathAvailable: boolean;
  confidence: number;
  explanation: string[];
}

export interface CashApplicationScoredCandidate extends CashApplicationCandidate {
  scoreBreakdown: Record<string, number>;
  scoreReasonSummaries: string[];
}

export interface CashApplicationCandidateSet {
  candidates: CashApplicationScoredCandidate[];
  selectedCandidate?: CashApplicationScoredCandidate;
}

export interface CashApplicationEvaluationInput {
  principal: Principal;
  auditContext: AuditContext;
  account: BillingAccount;
  payment: Payment;
  allocations: CashApplicationAllocationInput[];
  payerIdentified: boolean;
  matchConfidence: number;
  noRegretAutoApply: boolean;
  autoApplyConfidenceThreshold?: number;
  balanceApprovalThresholdCents?: number;
  manualOverrideErpWritebackConflict?: boolean;
}

export interface CashApplicationEvaluationResult {
  route: "auto_apply" | "approval_required" | "review_required";
  decision: "auto_apply" | "review_suggestion" | "exception_queue" | "approval_required";
  summary: string;
  payment: Payment;
  applications: PaymentApplication[];
  allocations: CashApplicationAllocationResult[];
  invoices: CustomerInvoice[];
  appliedAmountCents: number;
  unappliedAmountCents: number;
  approvalRequest?: ApprovalRequest;
  exception?: DomainException;
  activityEntries: ImmutableActivityLogEntry[];
  candidateSet?: CashApplicationCandidateSet;
  writebackStage?: CashApplicationWritebackStage;
  learningEvents: LearningEvent[];
}

export class CashApplicationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashApplicationInputError";
  }
}

interface NormalizedEvidence {
  invoiceNumbers: string[];
  poNumbers: string[];
  bankReferences: string[];
  payerNames: string[];
  payerBankAccounts: string[];
  remittanceTexts: string[];
  settlementConfirmed: boolean;
  matchedBankTransaction: boolean;
  erpWritebackPathAvailable: boolean;
  conflictingInvoiceNumbers: boolean;
  withholdingSignals: WithholdingSignals;
}

type ResolvedCashApplicationBehavior = CashApplicationKnownBehavior & {
  learningExplanation?: CashApplicationLearningBehavior["explanation"];
};

type ReviewReasonCode =
  | "pending_check_clearance"
  | "possible_bir_withholding_unconfirmed"
  | "form_2307_missing"
  | "mixed_goods_services_tax_basis_unclear"
  | "short_payment_unexplained"
  | "cross_entity_payer_ambiguity"
  | "conflicting_remittance"
  | "bank_charge_variance_review"
  | "writeback_path_unavailable";

interface WithholdingSignals {
  explicitAmountCents?: number;
  explicitRateBps?: number;
  remittanceStatesWithholding: boolean;
  form2307Linked: boolean;
  operatorConfirmed: boolean;
  buyerKnownWithholdingAgent: boolean;
}

interface ResidualAssessment {
  recognizedWithholdingAmountCents: number;
  residualAmountCents: number;
  residualType:
    | "exact"
    | "withholding_supported"
    | "withholding_under_review"
    | "customer_short_pay"
    | "bank_charge_adjustment"
    | "overpayment_hold";
  reviewReasonCodes: ReviewReasonCode[];
  evidenceStatus: "none" | "remittance_only" | "form_2307_linked" | "operator_confirmed";
}

export class CashApplicationCandidateGenerator {
  generate(input: CashApplicationEngineInput): CashApplicationCandidate[] {
    if (input.invoices.length === 0) {
      return [];
    }

    const evidence = normalizeEvidence(input);
    const invoiceAnalyses = input.invoices
      .map((invoice) => this.analyzeInvoice(input, evidence, invoice))
      .filter((analysis) => analysis.signal.confidence >= 0.2)
      .sort((left, right) => right.signal.confidence - left.signal.confidence);

    if (invoiceAnalyses.length === 0) {
      return [];
    }

    const candidateMap = new Map<string, CashApplicationCandidate>();
    for (const analysis of invoiceAnalyses) {
      this.pushCandidate(candidateMap, input, evidence, [analysis.invoice], [analysis.signal]);
    }

    const directlyReferenced = invoiceAnalyses.filter((analysis) =>
      analysis.signal.matchedSignals.some((signal) =>
        ["invoice_number_exact", "invoice_number_fuzzy", "po_number_match", "remittance_parse_match"].includes(
          signal
        )
      )
    );
    if (directlyReferenced.length > 1) {
      this.pushCandidate(
        candidateMap,
        input,
        evidence,
        directlyReferenced.map((analysis) => analysis.invoice),
        directlyReferenced.map((analysis) => analysis.signal)
      );
    }

    const strongestSameBilling = invoiceAnalyses.filter(
      (analysis) =>
        analysis.invoice.billingAccountId === input.account.id && analysis.signal.confidence >= 0.45
    );
    if (strongestSameBilling.length > 1) {
      const oldestFirst = [...strongestSameBilling]
        .sort(compareInvoicePriority)
        .map((analysis) => analysis.invoice);
      this.pushCandidate(
        candidateMap,
        input,
        evidence,
        oldestFirst,
        strongestSameBilling.map((analysis) => analysis.signal)
      );
    }

    return [...candidateMap.values()].sort((left, right) => right.confidence - left.confidence);
  }

  private analyzeInvoice(
    input: CashApplicationEngineInput,
    evidence: NormalizedEvidence,
    invoice: CustomerInvoice
  ) {
    const invoiceNumber = normalizeToken(invoice.invoiceNumber);
    const poNumber = normalizeToken(readString(invoice.metadata, "poNumber"));
    const customerName = normalizeToken(
      readString(invoice.metadata, "customerName") ?? input.account.displayName
    );
    const invoiceOpenAmount = getInvoiceOpenAmount(invoice);
    const signalHits: string[] = [];
    const reasons: string[] = [];
    let confidence = 0;

    if (evidence.invoiceNumbers.includes(invoiceNumber)) {
      confidence += 0.35;
      signalHits.push("invoice_number_exact");
      reasons.push(`Invoice ${invoice.invoiceNumber} is directly referenced.`);
    } else {
      const fuzzyHit = evidence.invoiceNumbers.find(
        (reference) => similarity(reference, invoiceNumber) >= 0.83
      );
      if (fuzzyHit) {
        confidence += 0.18;
        signalHits.push("invoice_number_fuzzy");
        reasons.push(`Invoice ${invoice.invoiceNumber} matches a typo-tolerant reference.`);
      }
    }

    if (poNumber && evidence.poNumbers.includes(poNumber)) {
      confidence += 0.08;
      signalHits.push("po_number_match");
      reasons.push(`PO number matched for invoice ${invoice.invoiceNumber}.`);
    }

    if (
      customerName &&
      evidence.payerNames.some((payerName) => similarity(payerName, customerName) >= 0.82)
    ) {
      confidence += 0.12;
      signalHits.push("customer_name_match");
      reasons.push(`Customer name matched for invoice ${invoice.invoiceNumber}.`);
    }

    if (
      evidence.bankReferences.some((reference) =>
        similarity(reference, normalizeToken(input.payment.paymentReference)) >= 0.92
      )
    ) {
      confidence += 0.1;
      signalHits.push("bank_reference_match");
      reasons.push("Bank reference aligns with the payment reference.");
    }

    const knownPayerBankAccounts = ensureStringArray(
      readUnknown(invoice.metadata, "knownPayerBankAccounts")
    );
    if (
      knownPayerBankAccounts.length > 0 &&
      evidence.payerBankAccounts.some((account) =>
        knownPayerBankAccounts.some((knownAccount) => normalizeToken(knownAccount) === account)
      )
    ) {
      confidence += 0.08;
      signalHits.push("payer_bank_account_match");
      reasons.push("Payer bank account is recognized for this invoice.");
    }

    if (
      evidence.remittanceTexts.some((text) =>
        text.includes(invoiceNumber) || (poNumber ? text.includes(poNumber) : false)
      )
    ) {
      confidence += 0.12;
      signalHits.push("remittance_parse_match");
      reasons.push("Remittance or proof text points to this invoice.");
    }

    const hierarchyScore = scoreHierarchy(input, invoice);
    confidence += hierarchyScore;
    if (hierarchyScore > 0) {
      signalHits.push("hierarchy_match");
      reasons.push("Hierarchy-aware payer mapping favors this invoice.");
    }

    const behaviorScore = scoreBehavior(resolveKnownCustomerBehavior(input), evidence, invoice);
    confidence += behaviorScore;
    if (behaviorScore > 0) {
      signalHits.push("known_customer_behavior");
      reasons.push("Known customer behavior supports this allocation pattern.");
    }

    const paymentAmount = input.payment.amountCents;
    if (paymentAmount === invoiceOpenAmount) {
      confidence += 0.2;
      signalHits.push("amount_exact");
      reasons.push("Payment amount exactly matches the current open amount.");
    } else if (Math.abs(paymentAmount - invoiceOpenAmount) <= resolveVarianceTolerance(input)) {
      confidence += 0.11;
      signalHits.push("amount_near_exact");
      reasons.push("Payment amount is within policy-allowed variance.");
    } else if (paymentAmount < invoiceOpenAmount) {
      confidence += 0.06;
      signalHits.push("amount_partial");
      reasons.push("Payment amount plausibly represents a partial payment.");
    } else if (Math.abs(paymentAmount - invoiceOpenAmount) <= Math.max(25_000, Math.round(invoiceOpenAmount * 0.15))) {
      confidence += 0.04;
      signalHits.push("amount_close");
      reasons.push("Payment amount is directionally close to the invoice balance.");
    }

    return {
      invoice,
      signal: {
        invoiceId: invoice.id,
        confidence: roundConfidence(confidence),
        matchedSignals: signalHits,
        reasons,
      } satisfies CashApplicationInvoiceSignal,
    };
  }

  private pushCandidate(
    target: Map<string, CashApplicationCandidate>,
    input: CashApplicationEngineInput,
    evidence: NormalizedEvidence,
    invoices: CustomerInvoice[],
    invoiceSignals: CashApplicationInvoiceSignal[]
  ) {
    const uniqueInvoices = uniqueBy(invoices, (invoice) => invoice.id);
    if (uniqueInvoices.length === 0) {
      return;
    }

    const orderedInvoices = [...uniqueInvoices].sort(compareInvoicePriority);
    const allocations = allocatePayment(input.payment.amountCents, orderedInvoices);
    if (allocations.length === 0) {
      return;
    }

    const candidateId = allocations.map((allocation) => allocation.invoice.id).join("|");
    if (target.has(candidateId)) {
      return;
    }

    const totalAllocatedCents = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    const billingAccountIds = uniqueStrings(
      orderedInvoices.map((invoice) => invoice.billingAccountId)
    );
    const bestSignal = invoiceSignals.reduce((sum, signal) => sum + signal.confidence, 0) / invoiceSignals.length;
    const policyAmountMatch = classifyAmountMatch(input, allocations, evidence);
    const candidate: CashApplicationCandidate = {
      id: candidateId,
      invoiceSignals,
      allocations,
      totalAllocatedCents,
      unappliedAmountCents: input.payment.amountCents - totalAllocatedCents,
      settlementConfirmed: evidence.settlementConfirmed,
      invoiceSnapshotVerified: orderedInvoices.every(isInvoiceOpenInVerifiedSnapshot),
      hasDisputeOrHold: orderedInvoices.some(hasDisputeOrHold),
      accountMappingConfidence: scoreAccountMapping(input, orderedInvoices),
      policyAmountMatch,
      crossEntityAmbiguity:
        billingAccountIds.length > 1 || billingAccountIds[0] !== input.account.id,
      conflictingRemittanceData:
        evidence.conflictingInvoiceNumbers &&
        !evidence.invoiceNumbers.every((reference) =>
          orderedInvoices.some((invoice) => similarity(reference, normalizeToken(invoice.invoiceNumber)) >= 0.83)
        ),
      erpWritebackPathAvailable: evidence.erpWritebackPathAvailable,
      confidence: roundConfidence(bestSignal),
      explanation: uniqueStrings(
        invoiceSignals.flatMap((signal) => signal.reasons).concat(
          candidateExplanation(policyAmountMatch, billingAccountIds, evidence)
        )
      ),
    };

    target.set(candidateId, candidate);
  }
}

export class CashApplicationScoringEngine {
  score(
    input: CashApplicationEngineInput,
    candidate: CashApplicationCandidate,
    allCandidates: CashApplicationCandidate[]
  ): CashApplicationScoredCandidate {
    const learnedSignals = scoreLearnedSignals(input, candidate);
    const scoreBreakdown: Record<string, number> = {
      invoiceSignals:
        candidate.invoiceSignals.reduce((sum, signal) => sum + signal.confidence, 0) /
        candidate.invoiceSignals.length,
      settlementConfirmed: candidate.settlementConfirmed ? 0.08 : 0,
      invoiceSnapshotVerified: candidate.invoiceSnapshotVerified ? 0.08 : -0.18,
      accountMapping: candidate.accountMappingConfidence,
      amountFit: amountFitScore(input, candidate),
      remittanceConsistency: candidate.conflictingRemittanceData ? -0.2 : 0.05,
      ambiguityPenalty: candidate.crossEntityAmbiguity ? -0.18 : 0.05,
      disputeHoldPenalty: candidate.hasDisputeOrHold ? -0.35 : 0.04,
      erpWritebackPath: candidate.erpWritebackPathAvailable ? 0.06 : -0.14,
      fullAllocationCoverage:
        candidate.allocations.length > 1 && candidate.unappliedAmountCents === 0 ? 0.08 : 0,
      learnedSignals: learnedSignals.totalAdjustment,
    };

    const competingCandidate = allCandidates
      .filter((item) => item.id !== candidate.id)
      .sort((left, right) => right.confidence - left.confidence)[0];
    if (
      competingCandidate &&
      Math.abs(competingCandidate.confidence - candidate.confidence) <= 0.03 &&
      competingCandidate.id !== candidate.id &&
      !(candidate.allocations.length > 1 && candidate.unappliedAmountCents === 0)
    ) {
      scoreBreakdown.closeAlternativePenalty = -0.08;
    }

    const rawScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
    let confidence = roundConfidence(rawScore / 1.55);

    const isExactSafeCandidate =
      candidate.settlementConfirmed &&
      candidate.invoiceSnapshotVerified &&
      !candidate.hasDisputeOrHold &&
      candidate.accountMappingConfidence >= 0.2 &&
      candidate.policyAmountMatch === "exact" &&
      !candidate.crossEntityAmbiguity &&
      !candidate.conflictingRemittanceData &&
      candidate.erpWritebackPathAvailable;

    if (isExactSafeCandidate) {
      confidence = Math.max(confidence, 0.99);
    }

    return {
      ...candidate,
      confidence,
      scoreBreakdown,
      scoreReasonSummaries: summarizeScoreReasons(scoreBreakdown, learnedSignals.reasonSummaries),
    };
  }
}

export class CashApplicationDecisionService {
  decide(
    input: CashApplicationEngineInput,
    candidates: CashApplicationScoredCandidate[]
  ): {
    route: CashApplicationEvaluationResult["route"];
    decision: CashApplicationEvaluationResult["decision"];
    summary: string;
    candidate?: CashApplicationScoredCandidate;
    noRegretAutoApply: boolean;
    payerIdentified: boolean;
    matchConfidence: number;
    exception?: DomainException;
  } {
    const selectedCandidate = candidates[0];
    if (!selectedCandidate) {
      return {
        route: "review_required",
        decision: "exception_queue",
        summary: "Cash application exception created because no viable invoice candidate was generated.",
        noRegretAutoApply: false,
        payerIdentified: false,
        matchConfidence: 0,
        exception: this.createDecisionException(input, undefined, {
          kind: "unidentified_payer_unapplied_cash",
          summary: "Cash application exception created because the payment could not be matched to an invoice.",
          details: "No invoice candidate met the minimum evidence threshold.",
        }),
      };
    }

    const noRegretAutoApply = this.isNoRegretAutoApply(selectedCandidate);
    const reviewThreshold = input.reviewConfidenceThreshold ?? 0.85;
    const autoApplyThreshold = input.autoApplyConfidenceThreshold ?? 0.99;
    const payerIdentified = selectedCandidate.accountMappingConfidence >= 0.2;

    if (selectedCandidate.confidence < reviewThreshold) {
      if (
        selectedCandidate.conflictingRemittanceData ||
        selectedCandidate.crossEntityAmbiguity ||
        !selectedCandidate.erpWritebackPathAvailable
      ) {
        return {
          route: "review_required",
          decision: "exception_queue",
          summary: "Cash application exception created because the best candidate confidence is below the review threshold.",
          candidate: selectedCandidate,
          noRegretAutoApply,
          payerIdentified,
          matchConfidence: selectedCandidate.confidence,
          exception: this.createDecisionException(input, selectedCandidate, selectExceptionDefinition(selectedCandidate)),
        };
      }

      return {
        route: "review_required",
        decision: "review_suggestion",
        summary:
          "Cash application suggestion prepared for review because confidence is below the review threshold but no conflict signal requires immediate exceptioning.",
        candidate: selectedCandidate,
        noRegretAutoApply,
        payerIdentified,
        matchConfidence: selectedCandidate.confidence,
      };
    }

    if (
      selectedCandidate.conflictingRemittanceData ||
      selectedCandidate.crossEntityAmbiguity
    ) {
      return {
        route: "review_required",
        decision: "exception_queue",
        summary:
          "Cash application exception created because conflicting evidence or entity ambiguity makes review insufficient.",
        candidate: selectedCandidate,
        noRegretAutoApply,
        payerIdentified,
        matchConfidence: selectedCandidate.confidence,
        exception: this.createDecisionException(input, selectedCandidate, selectExceptionDefinition(selectedCandidate)),
      };
    }

    if (!noRegretAutoApply || selectedCandidate.confidence < autoApplyThreshold) {
      return {
        route: "review_required",
        decision: "review_suggestion",
        summary:
          selectedCandidate.confidence < autoApplyThreshold
            ? "Cash application suggestion prepared for review because confidence is below the auto-apply threshold."
            : "Cash application suggestion prepared for review because a no-regret safeguard blocked auto-apply.",
        candidate: selectedCandidate,
        noRegretAutoApply,
        payerIdentified,
        matchConfidence: selectedCandidate.confidence,
      };
    }

    return {
      route: "auto_apply",
      decision: "auto_apply",
      summary: "Cash application may auto-execute under no-regret rules.",
      candidate: selectedCandidate,
      noRegretAutoApply,
      payerIdentified,
      matchConfidence: selectedCandidate.confidence,
    };
  }

  private isNoRegretAutoApply(candidate: CashApplicationScoredCandidate) {
    return (
      candidate.settlementConfirmed &&
      candidate.invoiceSnapshotVerified &&
      !candidate.hasDisputeOrHold &&
      candidate.accountMappingConfidence >= 0.2 &&
      (candidate.policyAmountMatch === "exact" || candidate.policyAmountMatch === "near_exact") &&
      !candidate.crossEntityAmbiguity &&
      !candidate.conflictingRemittanceData &&
      candidate.erpWritebackPathAvailable
    );
  }

  private createDecisionException(
    input: CashApplicationEngineInput,
    candidate: CashApplicationScoredCandidate | undefined,
    definition: {
      kind: Parameters<typeof createTypedException>[0]["kind"];
      summary: string;
      details: string;
    }
  ) {
    const exception = createTypedException({
      id: `exception_${input.payment.id}`,
      entityType: "payment",
      entityId: input.payment.id,
      kind: definition.kind,
      createdAt: input.auditContext.occurredAt,
      summary: definition.summary,
      details: definition.details,
      metadata: {
        billingAccountId: input.account.id,
        candidateId: candidate?.id,
        candidateConfidence: candidate?.confidence,
        invoiceIds: candidate?.allocations.map((allocation) => allocation.invoice.id) ?? [],
      },
    });

    return new ExceptionTriageService().triage(exception, {
      actorId: input.auditContext.actorId,
      actorRole: "system",
      routeToCashApplicationReview: true,
      hasPaymentEvidence: true,
      paymentEvidenceType: "bank_reference",
      likelyMatches:
        candidate?.allocations.map((allocation) => ({
          paymentId: input.payment.id,
          invoiceId: allocation.invoice.id,
          confidence: candidate.confidence,
          rationale: candidate.explanation[0] ?? "Generated by cash application scoring.",
        })) ?? [],
      notes: "Escalated from cash application decision service.",
    });
  }
}

export class CashApplicationWorkflowEngine {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly paymentTransitions = new PaymentTransitionService();
  private readonly invoiceTransitions = new InvoiceTransitionService();
  private readonly exceptionTriageService = new ExceptionTriageService();
  private readonly approvalService: ApprovalRequestService;
  private readonly candidateGenerator = new CashApplicationCandidateGenerator();
  private readonly scoringEngine = new CashApplicationScoringEngine();
  private readonly decisionService = new CashApplicationDecisionService();
  private readonly learningEventsFactory = new WorkflowLearningEventFactory();

  constructor(
    private readonly deps: {
      activityStore: ImmutableActivityLogStore;
      now?: () => string;
      idGenerator?: (prefix: string) => string;
    }
  ) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      now: this.now,
      idGenerator: () => this.idGenerator("activity"),
    });
    this.approvalService = new ApprovalRequestService({
      audit: this.audit,
      now: this.now,
      idGenerator: () => this.idGenerator("approval"),
    });
  }

  process(input: CashApplicationEngineInput): CashApplicationEvaluationResult {
    const evidence = normalizeEvidence(input);
    const generatedCandidates = this.candidateGenerator.generate(input);
    const scoredCandidates = generatedCandidates
      .map((candidate) => this.scoringEngine.score(input, candidate, generatedCandidates))
      .sort((left, right) => right.confidence - left.confidence);
    const candidateSet: CashApplicationCandidateSet = {
      candidates: scoredCandidates,
      ...(scoredCandidates[0] ? { selectedCandidate: scoredCandidates[0] } : {}),
    };

    this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_manager",
      action: "cash_application.candidates_generated",
      entityType: "payment",
      entityId: input.payment.id,
      metadata: {
        correlationId: input.auditContext.correlationId,
        candidateCount: scoredCandidates.length,
        bestConfidence: scoredCandidates[0]?.confidence ?? 0,
      },
    });
    const learningEvents: LearningEvent[] =
      scoredCandidates[0]
        ? this.learningEventsFactory.buildCashApplicationEvents({
            payment: input.payment,
            account: input.account,
            occurredAt: input.auditContext.occurredAt,
            phase: "candidate_match_found",
            invoiceIds: scoredCandidates[0].allocations.map(
              (allocation) => allocation.invoice.id,
            ),
            metadata: {
              candidateCount: scoredCandidates.length,
              bestConfidence: scoredCandidates[0].confidence,
            },
          })
        : [];

    const decision = this.decisionService.decide(input, scoredCandidates);
    if (!decision.candidate) {
      this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_manager",
        action: "cash_application.exception_queued",
        entityType: "payment",
        entityId: input.payment.id,
        metadata: {
          correlationId: input.auditContext.correlationId,
          reason: "no_candidate_generated",
        },
      });

      return {
        route: decision.route,
        decision: decision.decision,
        summary: decision.summary,
        payment: {
          ...input.payment,
          updatedAt: this.now(),
          state: "review_required",
        },
        applications: [],
        allocations: [],
        invoices: [],
        appliedAmountCents: 0,
        unappliedAmountCents: input.payment.amountCents,
        ...(decision.exception ? { exception: decision.exception } : {}),
        activityEntries: this.readActivityEntries(),
        ...(candidateSet.candidates.length > 0 ? { candidateSet } : {}),
        learningEvents,
      };
    }

    return this.evaluate({
      principal: input.principal,
      auditContext: input.auditContext,
      account: input.account,
      payment: input.payment,
      allocations: decision.candidate.allocations,
      payerIdentified: decision.payerIdentified,
      matchConfidence: decision.matchConfidence,
      noRegretAutoApply: decision.noRegretAutoApply,
      ...(input.autoApplyConfidenceThreshold !== undefined
        ? { autoApplyConfidenceThreshold: input.autoApplyConfidenceThreshold }
        : {}),
      ...(input.balanceApprovalThresholdCents !== undefined
        ? { balanceApprovalThresholdCents: input.balanceApprovalThresholdCents }
        : {}),
      ...(input.manualOverrideErpWritebackConflict !== undefined
        ? { manualOverrideErpWritebackConflict: input.manualOverrideErpWritebackConflict }
        : {}),
      candidateSet,
      summaryOverride: decision.summary,
      ...(decision.exception ? { exceptionOverride: decision.exception } : {}),
      decisionOverride: decision.decision,
      writebackAvailableOverride: decision.candidate.erpWritebackPathAvailable,
      evidence,
      learningEvents,
    });
  }

  evaluate(
    input: CashApplicationEvaluationInput & {
      candidateSet?: CashApplicationCandidateSet;
      summaryOverride?: string;
      exceptionOverride?: DomainException;
      decisionOverride?: CashApplicationEvaluationResult["decision"];
      writebackAvailableOverride?: boolean;
      evidence?: NormalizedEvidence;
      learningEvents?: LearningEvent[];
    }
  ): CashApplicationEvaluationResult {
    if (input.allocations.length === 0) {
      throw new CashApplicationInputError("Cash application requires at least one allocation.");
    }

    const duplicateInvoiceIds = findDuplicateInvoiceIds(
      input.allocations.map((allocation) => allocation.invoice.id)
    );
    if (duplicateInvoiceIds.length > 0) {
      throw new CashApplicationInputError(
        `Cash application contains duplicate invoice allocations for: ${duplicateInvoiceIds.join(", ")}.`
      );
    }

    const invalidAllocation = input.allocations.find(
      (allocation) => !Number.isInteger(allocation.amountCents) || allocation.amountCents <= 0
    );
    if (invalidAllocation) {
      throw new CashApplicationInputError(
        `Cash application allocation for invoice ${invalidAllocation.invoice.invoiceNumber} must be a positive integer cent amount.`
      );
    }

    const currencyMismatch = input.allocations.find(
      (allocation) => allocation.invoice.currency !== input.payment.currency
    );
    if (currencyMismatch) {
      throw new CashApplicationInputError(
        `Cash application currency mismatch: payment ${input.payment.currency} cannot be applied to invoice ${currencyMismatch.invoice.invoiceNumber} in ${currencyMismatch.invoice.currency}.`
      );
    }

    const evaluationTime = this.now();
    const totalAllocated = input.allocations.reduce((sum, item) => sum + item.amountCents, 0);
    const evaluationEvidence = input.evidence ?? normalizeEvidenceForEvaluation(input);
    const residualAssessment = assessResidualHandling(
      input,
      input.allocations,
      evaluationEvidence
    );
    const allocationResults = input.allocations.map((allocation) => ({
      invoiceId: allocation.invoice.id,
      invoiceNumber: allocation.invoice.invoiceNumber,
      billingAccountId: allocation.invoice.billingAccountId,
      ...(allocation.invoice.branchId ? { branchId: allocation.invoice.branchId } : {}),
      appliedAmountCents: allocation.amountCents,
      resultingInvoiceState: allocation.invoice.state,
    })) satisfies CashApplicationAllocationResult[];
    const proposedApplications = buildPaymentApplications({
      payment: input.payment,
      allocations: input.allocations,
      account: input.account,
      occurredAt: evaluationTime,
      correlationId: input.auditContext.correlationId,
      idGenerator: this.idGenerator,
      state: "proposed",
      residualAssessment,
    });

    this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_manager",
      action: "cash_application.evaluated",
      entityType: "payment",
      entityId: input.payment.id,
      metadata: {
        correlationId: input.auditContext.correlationId,
        billingAccountId: input.account.id,
        allocationCount: input.allocations.length,
        appliedAmountCents: totalAllocated,
        matchConfidence: input.matchConfidence,
      },
    });

    const reviewException =
      input.exceptionOverride ??
      this.evaluateHardStops(input, evaluationTime, totalAllocated, residualAssessment);
    if (reviewException) {
      const learningEvents = [
        ...(input.learningEvents ?? []),
        ...this.learningEventsFactory.buildCashApplicationEvents({
          payment: input.payment,
          account: input.account,
          occurredAt: evaluationTime,
          phase: "review_required",
          invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
          metadata: {
            reason: reviewException.kind,
            decision: "exception_queue",
          },
        }),
      ];
      return {
        route: "review_required",
        decision: "exception_queue",
        summary: input.summaryOverride ?? reviewException.summary,
        payment: {
          ...input.payment,
          updatedAt: evaluationTime,
          state: "review_required",
        },
        applications: proposedApplications,
        allocations: allocationResults,
        invoices: input.allocations.map((allocation) => allocation.invoice),
        appliedAmountCents: 0,
        unappliedAmountCents: input.payment.amountCents,
        exception: reviewException,
        activityEntries: this.readActivityEntries(),
        ...(input.candidateSet ? { candidateSet: input.candidateSet } : {}),
        learningEvents,
      };
    }

    if (input.decisionOverride === "review_suggestion") {
      this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_manager",
        action: "cash_application.review_suggested",
        entityType: "payment",
        entityId: input.payment.id,
        metadata: {
          correlationId: input.auditContext.correlationId,
          appliedAmountCents: totalAllocated,
          confidence: input.matchConfidence,
        },
      });

      const learningEvents = [
        ...(input.learningEvents ?? []),
        ...this.learningEventsFactory.buildCashApplicationEvents({
          payment: input.payment,
          account: input.account,
          occurredAt: evaluationTime,
          phase: "review_required",
          invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
          metadata: {
            decision: "review_suggestion",
            confidence: input.matchConfidence,
          },
        }),
      ];
      return {
        route: "review_required",
        decision: "review_suggestion",
        summary:
          input.summaryOverride ??
          "Cash application suggestion prepared for review because operator confirmation is still required.",
        payment: {
          ...input.payment,
          updatedAt: evaluationTime,
          state: "review_required",
        },
        applications: proposedApplications,
        allocations: allocationResults,
        invoices: input.allocations.map((allocation) => allocation.invoice),
        appliedAmountCents: 0,
        unappliedAmountCents: input.payment.amountCents,
        activityEntries: this.readActivityEntries(),
        ...(input.candidateSet ? { candidateSet: input.candidateSet } : {}),
        learningEvents,
      };
    }

    const approvalDecision = evaluateApprovalRequirement({
      subject: "cash_application",
      action: "cash_auto_apply",
      billingAccountId: input.account.id,
      parentAccountId: input.account.parentAccountId,
      branchIds: uniqueStrings(
        input.allocations
          .map((allocation) => allocation.invoice.branchId)
          .filter((branchId): branchId is string => typeof branchId === "string")
      ),
      accountTier: input.account.accountTier,
      balanceCents: input.payment.amountCents,
      balanceApprovalThresholdCents: input.balanceApprovalThresholdCents ?? 2_000_000,
      autoApplyConfidence: input.matchConfidence,
      autoApplyConfidenceThreshold: input.autoApplyConfidenceThreshold ?? 0.99,
      noRegretAutoApply: input.noRegretAutoApply,
      highConfidence: input.matchConfidence >= (input.autoApplyConfidenceThreshold ?? 0.99),
      ...(input.manualOverrideErpWritebackConflict !== undefined
        ? { manualOverrideErpWritebackConflict: input.manualOverrideErpWritebackConflict }
        : {}),
    });

    if (approvalDecision.requiresApproval || !approvalDecision.autoExecute) {
      const approval = this.approvalService.submit(
        input.principal,
        this.approvalService.create(input.principal, {
          requestType: approvalDecision.requestType,
          ...(approvalDecision.assigneeRole ? { assigneeRole: approvalDecision.assigneeRole } : {}),
          currentStep: "cash_application_review",
          payload: {
            paymentId: input.payment.id,
            billingAccountId: input.account.id,
            invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
            allocations: allocationResults,
            unappliedAmountCents: input.payment.amountCents - totalAllocated,
          },
          ...(approvalDecision.policyContext ? { policyContext: approvalDecision.policyContext } : {}),
        })
      );
      const learningEvents = [
        ...(input.learningEvents ?? []),
        ...this.learningEventsFactory.buildCashApplicationEvents({
          payment: input.payment,
          account: input.account,
          occurredAt: evaluationTime,
          phase: "review_required",
          invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
          approvalRequestId: approval.id,
          metadata: {
            decision: "approval_required",
            reasonCodes: approvalDecision.reasonCodes,
          },
        }),
      ];

      return {
        route: "approval_required",
        decision: "approval_required",
        summary: input.summaryOverride ?? approvalDecision.summary,
        payment: {
          ...input.payment,
          updatedAt: evaluationTime,
          state: "review_required",
        },
        applications: proposedApplications,
        allocations: allocationResults,
        invoices: input.allocations.map((allocation) => allocation.invoice),
        appliedAmountCents: 0,
        unappliedAmountCents: input.payment.amountCents,
        approvalRequest: approval,
        activityEntries: this.readActivityEntries(),
        ...(input.candidateSet ? { candidateSet: input.candidateSet } : {}),
        learningEvents,
      };
    }

    const paymentWithCandidate = transitionPaymentForApplication(input.payment, this.paymentTransitions);
    const appliedPaymentState =
      totalAllocated === input.payment.amountCents ? "auto_applied" : "partially_applied";
    const appliedPayment = this.paymentTransitions.transition(paymentWithCandidate, appliedPaymentState, {
      actorId: input.auditContext.actorId,
      actorRole: "system",
      occurredAt: evaluationTime,
      reason: "cash_application_auto_apply",
      metadata: {
        matchEvidence: true,
      },
    });

    const updatedInvoices = input.allocations.map((allocation, index) =>
      applyToInvoice(
        allocation.invoice,
        allocation.amountCents,
        residualAssessment.recognizedWithholdingAmountCents > 0 && index === 0
          ? residualAssessment.recognizedWithholdingAmountCents
          : 0,
        residualAssessment,
        evaluationEvidence.matchedBankTransaction,
        evaluationTime,
        this.invoiceTransitions
      )
    );
    const updatedAllocations = updatedInvoices.map((invoice, index) => ({
      ...allocationResults[index]!,
      resultingInvoiceState: invoice.state,
    }));
    const appliedApplications = buildPaymentApplications({
      payment: appliedPayment,
      allocations: input.allocations,
      account: input.account,
      occurredAt: evaluationTime,
      correlationId: input.auditContext.correlationId,
      idGenerator: this.idGenerator,
      state: "applied",
      residualAssessment,
    });
    const writebackStage = stageWriteback(input, updatedAllocations, totalAllocated, residualAssessment);

    this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_manager",
      action: "cash_application.auto_applied",
      entityType: "payment",
      entityId: input.payment.id,
      metadata: {
        correlationId: input.auditContext.correlationId,
        paymentState: appliedPayment.state,
        appliedAmountCents: totalAllocated,
        unappliedAmountCents: input.payment.amountCents - totalAllocated,
        writebackStatus: writebackStage.status,
      },
    });
    const learningEvents = [
      ...(input.learningEvents ?? []),
      ...this.learningEventsFactory.buildCashApplicationEvents({
        payment: input.payment,
        account: input.account,
        occurredAt: evaluationTime,
        phase: "auto_applied",
        invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
        metadata: {
          appliedAmountCents: totalAllocated,
          unappliedAmountCents: input.payment.amountCents - totalAllocated,
          writebackStatus: writebackStage.status,
        },
      }),
    ];

    return {
      route: "auto_apply",
      decision: "auto_apply",
      summary:
        input.summaryOverride ??
        (totalAllocated === input.payment.amountCents
          ? "Cash was auto-applied with no unapplied remainder."
          : "Cash was auto-applied conservatively with a remaining unapplied balance."),
      payment: appliedPayment,
      applications: appliedApplications,
      allocations: updatedAllocations,
      invoices: updatedInvoices,
      appliedAmountCents: totalAllocated,
      unappliedAmountCents: input.payment.amountCents - totalAllocated,
      activityEntries: this.readActivityEntries(),
      ...(input.candidateSet ? { candidateSet: input.candidateSet } : {}),
      writebackStage:
        input.writebackAvailableOverride === false
          ? { ...writebackStage, status: "not_available", reason: "ERP writeback path is unavailable." }
          : writebackStage,
      learningEvents,
    };
  }

  private evaluateHardStops(
    input: CashApplicationEvaluationInput,
    occurredAt: string,
    totalAllocated: number,
    residualAssessment: ResidualAssessment
  ): DomainException | undefined {
    if (!input.payerIdentified) {
      return this.createReviewException(input, occurredAt, {
        kind: "unidentified_payer_unapplied_cash",
        summary: "Cash application review required because the payer is not confidently identified.",
        details: "Pilot policy blocks automatic money movement when payer identification is unresolved.",
        reviewReasonCodes: [],
      });
    }

    const billingAccountIds = uniqueStrings(
      input.allocations.map((allocation) => allocation.invoice.billingAccountId)
    );
    if (billingAccountIds.length !== 1 || billingAccountIds[0] !== input.account.id) {
      return this.createReviewException(input, occurredAt, {
        kind: "proof_remittance_received_not_matched",
        summary: "Cash application review required because allocations span conflicting billing accounts.",
        details:
          "Parent account visibility cannot replace billing-account routing for cash application.",
        reviewReasonCodes: [],
      });
    }

    if (input.payment.billingAccountId && input.payment.billingAccountId !== input.account.id) {
      return this.createReviewException(input, occurredAt, {
        kind: "erp_sync_inconsistency",
        summary:
          "Cash application review required because the payment billing account conflicts with the target invoices.",
        details: "Automatic application is blocked until the payment routing discrepancy is resolved.",
        reviewReasonCodes: [],
      });
    }

    if (totalAllocated > input.payment.amountCents) {
      return this.createReviewException(input, occurredAt, {
        kind: "overpayment",
        summary: "Cash application review required because allocations exceed the received payment amount.",
        details: "Pilot policy prevents over-allocation and ledger imbalance.",
        reviewReasonCodes: [],
      });
    }

    const disputedInvoice = input.allocations.find((allocation) => hasDisputeOrHold(allocation.invoice))?.invoice;
    if (disputedInvoice) {
      return this.createReviewException(input, occurredAt, {
        kind:
          disputedInvoice.state === "disputed_full" ? "full_dispute" : "partial_dispute",
        summary: `Cash application review required because invoice ${disputedInvoice.invoiceNumber} is disputed or on hold.`,
        details: "Disputed or held receivables stay out of auto-cash-application flows.",
        reviewReasonCodes: [],
      });
    }

    if (residualAssessment.residualType === "withholding_under_review") {
      return this.createReviewException(input, occurredAt, {
        kind: "short_payment",
        summary:
          "Cash application review required because the shortfall looks like withholding but evidence is incomplete.",
        details:
          "Philippine withholding cannot close the invoice until documentary evidence is sufficient.",
        reviewReasonCodes: residualAssessment.reviewReasonCodes,
      });
    }

    return undefined;
  }

  private createReviewException(
    input: CashApplicationEvaluationInput,
    occurredAt: string,
    definition: {
      kind: Parameters<typeof createTypedException>[0]["kind"];
      summary: string;
      details: string;
      reviewReasonCodes: ReviewReasonCode[];
    }
  ) {
    const exception = createTypedException({
      id: this.idGenerator("exception"),
      entityType: "payment",
      entityId: input.payment.id,
      kind: definition.kind,
      createdAt: occurredAt,
      summary: definition.summary,
      details: definition.details,
      metadata: {
        billingAccountId: input.account.id,
        invoiceIds: input.allocations.map((allocation) => allocation.invoice.id),
        reviewReasonCodes: definition.reviewReasonCodes,
      },
    });
    const triaged = this.exceptionTriageService.triage(exception, {
      actorId: input.auditContext.actorId,
      actorRole: "system",
      routeToCashApplicationReview: true,
      hasPaymentEvidence: true,
      paymentEvidenceType: "bank_reference",
      notes: "Escalated from conservative cash-application evaluation.",
    });

    this.audit.append({
      actorId: input.principal.id,
      actorRole: input.principal.roles[0] ?? "ar_manager",
      action: "cash_application.review_required",
      entityType: "payment",
      entityId: input.payment.id,
      metadata: {
        correlationId: input.auditContext.correlationId,
        exceptionKind: triaged.kind,
        queue: triaged.owner.queue,
      },
    });

    return triaged;
  }

  private readActivityEntries() {
    const store = this.deps.activityStore as { entries?: ImmutableActivityLogEntry[] };
    return [...(store.entries ?? [])];
  }
}

function buildPaymentApplications(params: {
  payment: Payment;
  allocations: CashApplicationAllocationInput[];
  account: BillingAccount;
  occurredAt: string;
  correlationId: string;
  idGenerator: (prefix: string) => string;
  state: PaymentApplication["state"];
  residualAssessment: ResidualAssessment;
}): PaymentApplication[] {
  return params.allocations.map((allocation, index) =>
    createPaymentApplication({
      id: `${params.idGenerator("payment_application")}_${index + 1}`,
      createdAt: params.occurredAt,
      paymentId: params.payment.id,
      invoiceId: allocation.invoice.id,
      parentAccountId: params.account.parentAccountId,
      billingAccountId: allocation.invoice.billingAccountId,
      ...(allocation.invoice.branchId ? { branchId: allocation.invoice.branchId } : {}),
      currency: params.payment.currency,
      appliedAmountCents: allocation.amountCents,
      state: params.state,
      correlationId: params.correlationId,
      rationale:
        params.state === "applied"
          ? "Cash application executed under workflow rules."
          : "Cash application proposed pending review or approval.",
      metadata: {
        applicationType:
          params.residualAssessment.recognizedWithholdingAmountCents > 0
            ? "withholding_supported"
            : params.residualAssessment.residualAmountCents > 0
              ? "partial"
              : "auto",
        invoiceNumber: allocation.invoice.invoiceNumber,
        paymentReference: params.payment.paymentReference,
        recognizedWithholdingAmountCents:
          params.residualAssessment.recognizedWithholdingAmountCents > 0 && index === 0
            ? params.residualAssessment.recognizedWithholdingAmountCents
            : 0,
        residualAmountCents: params.residualAssessment.residualAmountCents,
        residualType: params.residualAssessment.residualType,
        reviewReasonCodes: params.residualAssessment.reviewReasonCodes,
        withholdingEvidenceStatus: params.residualAssessment.evidenceStatus,
      }
    })
  );
}

function resolveKnownCustomerBehavior(
  input: Pick<
    CashApplicationEngineInput,
    "knownCustomerBehavior" | "learningEvents" | "operatorFeedback"
  >,
): ResolvedCashApplicationBehavior {
  const learned = deriveCashApplicationLearningBehavior({
    events: input.learningEvents,
    feedback: input.operatorFeedback,
  });
  const configured = input.knownCustomerBehavior;

  const configuredBankChargeVariance = Math.max(
    configured?.commonBankChargeVarianceCents ?? 0,
    configured?.allowBankChargeVarianceCents ?? 0,
  );
  const learnedBankChargeVariance = Math.max(
    learned.commonBankChargeVarianceCents ?? 0,
    learned.allowBankChargeVarianceCents ?? 0,
  );

  return {
    expectedPayerNames: uniqueStrings([
      ...(configured?.expectedPayerNames ?? []),
      ...learned.expectedPayerNames,
    ]),
    expectedPayerBankAccounts: uniqueStrings([
      ...(configured?.expectedPayerBankAccounts ?? []),
      ...learned.expectedPayerBankAccounts,
    ]),
    ...(configured?.parentPaysForChildren !== undefined
      ? { parentPaysForChildren: configured.parentPaysForChildren }
      : learned.parentPaysForChildren !== undefined
        ? { parentPaysForChildren: learned.parentPaysForChildren }
        : {}),
    ...(configured?.parentPayerProbability !== undefined
      ? { parentPayerProbability: configured.parentPayerProbability }
      : learned.parentPayerProbability !== undefined
        ? { parentPayerProbability: learned.parentPayerProbability }
        : {}),
    ...(configured?.branchReferenceBias !== undefined
      ? { branchReferenceBias: configured.branchReferenceBias }
      : {}),
    ...(configured?.referenceQualityScore !== undefined
      ? { referenceQualityScore: configured.referenceQualityScore }
      : learned.referenceQualityScore !== undefined
        ? { referenceQualityScore: learned.referenceQualityScore }
        : {}),
    ...(configured?.remittanceUsuallyArrivesAfterPayment !== undefined
      ? { remittanceUsuallyArrivesAfterPayment: configured.remittanceUsuallyArrivesAfterPayment }
      : learned.remittanceUsuallyArrivesAfterPayment !== undefined
        ? { remittanceUsuallyArrivesAfterPayment: learned.remittanceUsuallyArrivesAfterPayment }
        : {}),
    ...(configured?.typicalBundleSize !== undefined
      ? { typicalBundleSize: configured.typicalBundleSize }
      : learned.typicalBundleSize !== undefined
        ? { typicalBundleSize: learned.typicalBundleSize }
        : {}),
    ...(configured?.commonShortPayRate !== undefined
      ? { commonShortPayRate: configured.commonShortPayRate }
      : learned.commonShortPayRate !== undefined
        ? { commonShortPayRate: learned.commonShortPayRate }
        : {}),
    ...(configuredBankChargeVariance > 0 || learnedBankChargeVariance > 0
      ? {
          commonBankChargeVarianceCents: Math.max(
            configured?.commonBankChargeVarianceCents ?? 0,
            learned.commonBankChargeVarianceCents ?? 0,
          ),
          allowBankChargeVarianceCents: Math.max(
            configured?.allowBankChargeVarianceCents ?? 0,
            learned.allowBankChargeVarianceCents ?? 0,
          ),
        }
      : {}),
    ...(configured?.allowShortPayVarianceCents !== undefined
      ? { allowShortPayVarianceCents: configured.allowShortPayVarianceCents }
      : learned.allowShortPayVarianceCents !== undefined
        ? { allowShortPayVarianceCents: learned.allowShortPayVarianceCents }
        : {}),
    ...(configured?.notes ? { notes: configured.notes } : {}),
    ...(learned.explanation.length > 0 ? { learningExplanation: learned.explanation } : {}),
  };
}

function normalizeEvidence(input: CashApplicationEngineInput): NormalizedEvidence {
  const behavior = resolveKnownCustomerBehavior(input);
  const remittanceTexts = [
    ...input.remittanceEmails.map((email) => `${email.subject} ${email.bodyText}`),
    ...input.uploadedProofsOfPayment.map((proof) => proof.extractedText ?? ""),
    ...input.paymentsLedger.map((record) => stringifyMetadata(record.metadata)),
      ...input.bankTransactions.map((transaction) => stringifyMetadata(transaction.metadata)),
  ]
    .map((text) => normalizeToken(text))
    .filter(Boolean);

  const invoiceNumbers = uniqueStrings(
    [
      ...extractInvoiceNumbers(input.payment.paymentReference),
      ...input.remittanceEmails.flatMap((email) => extractInvoiceNumbers(`${email.subject} ${email.bodyText}`)),
      ...input.uploadedProofsOfPayment.flatMap((proof) => extractInvoiceNumbers(proof.extractedText)),
      ...input.erpPaymentRecords.flatMap((record) => record.referencedInvoiceNumbers ?? []),
    ]
      .map(normalizeToken)
      .filter(Boolean)
  );

  const poNumbers = uniqueStrings(
    [
      ...input.remittanceEmails.flatMap((email) => extractPoNumbers(`${email.subject} ${email.bodyText}`)),
      ...input.uploadedProofsOfPayment.flatMap((proof) => extractPoNumbers(proof.extractedText)),
    ]
      .map(normalizeToken)
      .filter(Boolean)
  );

  const bankReferences = uniqueStrings(
    [
      input.payment.paymentReference,
      ...input.paymentsLedger.map((record) => record.bankReference),
      ...input.bankTransactions.map((transaction) => transaction.bankReference),
      ...input.uploadedProofsOfPayment.map((proof) => proof.bankReference),
      ...input.settlementWebhooks.map((webhook) => webhook.bankReference),
    ]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeToken)
  );

  const payerNames = uniqueStrings(
    [
      input.account.displayName,
      readString(input.payment.metadata, "payerName"),
      ...input.paymentsLedger.map((record) => record.payerName),
      ...input.bankTransactions.map((transaction) => transaction.payerName),
      ...input.remittanceEmails.map((email) => email.payerName),
      ...input.uploadedProofsOfPayment.map((proof) => proof.payerName),
      ...(behavior.expectedPayerNames ?? []),
    ]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeToken)
  );

  const payerBankAccounts = uniqueStrings(
    [
      readString(input.payment.metadata, "payerBankAccount"),
      ...input.paymentsLedger.map((record) => record.payerBankAccount),
      ...input.bankTransactions.map((transaction) => transaction.payerBankAccount),
      ...input.uploadedProofsOfPayment.map((proof) => proof.payerBankAccount),
      ...input.settlementWebhooks.map((webhook) => webhook.payerBankAccount),
      ...(behavior.expectedPayerBankAccounts ?? []),
    ]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeToken)
  );

  const settlementConfirmed =
    input.paymentsLedger.some((record) => record.settled || record.confirmed) ||
    input.erpPaymentRecords.some((record) => record.settled || record.confirmed) ||
    input.settlementWebhooks.some((webhook) =>
      webhook.status === "settled" || webhook.status === "confirmed"
    );

  const evidenceTexts = [
    ...input.remittanceEmails.map((email) => `${email.subject} ${email.bodyText}`),
    ...input.uploadedProofsOfPayment.map((proof) => proof.extractedText ?? proof.fileName),
    stringifyMetadata(input.payment.metadata),
    stringifyMetadata(input.account.metadata),
    ...input.invoices.map((invoice) => stringifyMetadata(invoice.metadata)),
    ...input.paymentsLedger.map((record) => stringifyMetadata(record.metadata)),
    ...input.bankTransactions.map((transaction) => stringifyMetadata(transaction.metadata)),
  ];
  const explicitWithholdingAmountCents = firstDefinedNumber([
    readNumber(input.payment.metadata, "withholdingAmountCents"),
    readNumber(input.payment.metadata, "withheldAmountCents"),
    readNumber(input.account.metadata, "withholdingAmountCents"),
    ...input.remittanceEmails.flatMap((email) => [
      readNumber(email.metadata, "withholdingAmountCents"),
      readNumber(email.metadata, "withheldAmountCents"),
    ]),
    ...input.uploadedProofsOfPayment.flatMap((proof) => [
      readNumber(proof.metadata, "withholdingAmountCents"),
      readNumber(proof.metadata, "withheldAmountCents"),
    ]),
    parseWithholdingAmountFromTexts(evidenceTexts),
  ]);
  const explicitWithholdingRateBps = firstDefinedNumber([
    readNumber(input.payment.metadata, "withholdingRateBps"),
    readNumber(input.account.metadata, "withholdingRateBps"),
    ...input.remittanceEmails.map((email) => readNumber(email.metadata, "withholdingRateBps")),
    ...input.uploadedProofsOfPayment.map((proof) => readNumber(proof.metadata, "withholdingRateBps")),
    parseWithholdingRateBpsFromTexts(evidenceTexts),
  ]);
  const remittanceStatesWithholding =
    input.remittanceEmails.some(
      (email) =>
        readBoolean(email.metadata, "statesWithholding") === true ||
        textMentionsWithholding(`${email.subject} ${email.bodyText}`),
    ) ||
    input.uploadedProofsOfPayment.some(
      (proof) =>
        readBoolean(proof.metadata, "statesWithholding") === true ||
        textMentionsWithholding(proof.extractedText),
    );
  const form2307Linked =
    readBoolean(input.payment.metadata, "form2307Linked") === true ||
    readBoolean(input.account.metadata, "form2307Linked") === true ||
    input.uploadedProofsOfPayment.some(
      (proof) =>
        readBoolean(proof.metadata, "form2307Linked") === true ||
        (proof.fileName ?? "").toLowerCase().includes("2307") ||
        (proof.extractedText ?? "").toLowerCase().includes("2307"),
    );
  const operatorConfirmed =
    readBoolean(input.payment.metadata, "operatorConfirmedWithholding") === true ||
    readBoolean(input.account.metadata, "operatorConfirmedWithholding") === true;
  const buyerKnownWithholdingAgent =
    readBoolean(input.account.metadata, "isTopWithholdingAgent") === true ||
    readBoolean(input.account.metadata, "buyerKnownWithholdingAgent") === true ||
    readBoolean(input.payment.metadata, "buyerKnownWithholdingAgent") === true;

  return {
    invoiceNumbers,
    poNumbers,
    bankReferences,
    payerNames,
    payerBankAccounts,
    remittanceTexts,
    settlementConfirmed,
    matchedBankTransaction: input.bankTransactions.length > 0,
    erpWritebackPathAvailable: input.erpPaymentRecords.some((record) => record.writebackPathAvailable),
    conflictingInvoiceNumbers: invoiceNumbers.length > 1 && !allReferencesCoherent(invoiceNumbers),
    withholdingSignals: {
      ...(explicitWithholdingAmountCents !== undefined
        ? { explicitAmountCents: explicitWithholdingAmountCents }
        : {}),
      ...(explicitWithholdingRateBps !== undefined
        ? { explicitRateBps: explicitWithholdingRateBps }
        : {}),
      remittanceStatesWithholding,
      form2307Linked,
      operatorConfirmed,
      buyerKnownWithholdingAgent,
    },
  };
}

function normalizeEvidenceForEvaluation(
  input: Pick<CashApplicationEvaluationInput, "account" | "payment" | "allocations">
): NormalizedEvidence {
  const evidenceTexts = [
    stringifyMetadata(input.payment.metadata),
    stringifyMetadata(input.account.metadata),
    ...input.allocations.map((allocation) => stringifyMetadata(allocation.invoice.metadata)),
  ];

  return {
    invoiceNumbers: uniqueStrings(
      input.allocations.map((allocation) => normalizeToken(allocation.invoice.invoiceNumber)).filter(Boolean)
    ),
    poNumbers: uniqueStrings(
      input.allocations
        .map((allocation) => readString(allocation.invoice.metadata, "poNumber"))
        .filter((value): value is string => typeof value === "string")
        .map(normalizeToken)
    ),
    bankReferences: uniqueStrings([normalizeToken(input.payment.paymentReference)].filter(Boolean)),
    payerNames: uniqueStrings(
      [input.account.displayName, readString(input.payment.metadata, "payerName")]
        .filter((value): value is string => typeof value === "string")
        .map(normalizeToken)
    ),
    payerBankAccounts: uniqueStrings(
      [readString(input.payment.metadata, "payerBankAccount")]
        .filter((value): value is string => typeof value === "string")
        .map(normalizeToken)
    ),
    remittanceTexts: evidenceTexts.map(normalizeToken).filter(Boolean),
    settlementConfirmed: input.payment.settlementStatus === "settled",
    matchedBankTransaction:
      Array.isArray(readUnknown(input.payment.metadata, "sourceBankTransactionIds")) &&
      (readUnknown(input.payment.metadata, "sourceBankTransactionIds") as unknown[]).length > 0,
    erpWritebackPathAvailable: true,
    conflictingInvoiceNumbers: false,
    withholdingSignals: {
      ...(firstDefinedNumber([
        readNumber(input.payment.metadata, "withholdingAmountCents"),
        readNumber(input.payment.metadata, "withheldAmountCents"),
        parseWithholdingAmountFromTexts(evidenceTexts),
      ]) !== undefined
        ? {
            explicitAmountCents: firstDefinedNumber([
              readNumber(input.payment.metadata, "withholdingAmountCents"),
              readNumber(input.payment.metadata, "withheldAmountCents"),
              parseWithholdingAmountFromTexts(evidenceTexts),
            ]),
          }
        : {}),
      remittanceStatesWithholding: evidenceTexts.some(textMentionsWithholding),
      form2307Linked:
        readBoolean(input.payment.metadata, "form2307Linked") === true ||
        evidenceTexts.some((text) => text.toLowerCase().includes("2307")),
      operatorConfirmed: readBoolean(input.payment.metadata, "operatorConfirmedWithholding") === true,
      buyerKnownWithholdingAgent:
        readBoolean(input.account.metadata, "isTopWithholdingAgent") === true ||
        readBoolean(input.account.metadata, "buyerKnownWithholdingAgent") === true,
    },
  };
}

function assessResidualHandling(
  input: Pick<CashApplicationEvaluationInput, "payment" | "allocations">,
  allocations: CashApplicationAllocationInput[],
  evidence: NormalizedEvidence
): ResidualAssessment {
  const totalOpenAmountCents = allocations.reduce(
    (sum, allocation) => sum + getInvoiceOpenAmount(allocation.invoice),
    0
  );
  if (input.payment.amountCents > totalOpenAmountCents) {
    return {
      recognizedWithholdingAmountCents: 0,
      residualAmountCents: input.payment.amountCents - totalOpenAmountCents,
      residualType: "overpayment_hold",
      reviewReasonCodes: [],
      evidenceStatus: "none",
    };
  }
  const residualAmountCents = Math.max(0, totalOpenAmountCents - input.payment.amountCents);
  if (residualAmountCents === 0) {
    return {
      recognizedWithholdingAmountCents: 0,
      residualAmountCents: 0,
      residualType: "exact",
      reviewReasonCodes: [],
      evidenceStatus: "none",
    };
  }

  const singleInvoice = allocations.length === 1;
  const invoice = allocations[0]?.invoice;
  const explicitAmountMatches =
    evidence.withholdingSignals.explicitAmountCents !== undefined &&
    evidence.withholdingSignals.explicitAmountCents === residualAmountCents;
  const bankChargeVarianceTolerance = 500;
  const remittanceMentionsBankCharge = evidence.remittanceTexts.some((text) =>
    text.includes(normalizeToken("bank charge"))
  );
  const invoiceTaxBasisExplicit =
    readBoolean(invoice?.metadata, "invoiceTaxBasisExplicit") === true ||
    readBoolean(invoice?.metadata, "taxBasisExplicit") === true;
  const mixedGoodsServices =
    readBoolean(invoice?.metadata, "mixedGoodsServices") === true ||
    readBoolean(invoice?.metadata, "mixedTaxBasis") === true;

  if (
    singleInvoice &&
    explicitAmountMatches &&
    evidence.matchedBankTransaction &&
    (evidence.withholdingSignals.form2307Linked ||
      evidence.withholdingSignals.remittanceStatesWithholding ||
      evidence.withholdingSignals.operatorConfirmed) &&
    invoiceTaxBasisExplicit &&
    !mixedGoodsServices
  ) {
    return {
      recognizedWithholdingAmountCents: residualAmountCents,
      residualAmountCents,
      residualType: "withholding_supported",
      reviewReasonCodes: [],
      evidenceStatus: evidence.withholdingSignals.form2307Linked
        ? "form_2307_linked"
        : evidence.withholdingSignals.operatorConfirmed
          ? "operator_confirmed"
          : "remittance_only",
    };
  }

  if (
    explicitAmountMatches &&
    (evidence.withholdingSignals.remittanceStatesWithholding ||
      evidence.withholdingSignals.form2307Linked ||
      evidence.withholdingSignals.operatorConfirmed ||
      evidence.withholdingSignals.buyerKnownWithholdingAgent)
  ) {
    const reviewReasonCodes: ReviewReasonCode[] = ["possible_bir_withholding_unconfirmed"];
    if (!evidence.withholdingSignals.form2307Linked) {
      reviewReasonCodes.push("form_2307_missing");
    }
    if (mixedGoodsServices) {
      reviewReasonCodes.push("mixed_goods_services_tax_basis_unclear");
    }
    return {
      recognizedWithholdingAmountCents: 0,
      residualAmountCents,
      residualType: "withholding_under_review",
      reviewReasonCodes: uniqueStrings(reviewReasonCodes) as ReviewReasonCode[],
      evidenceStatus: evidence.withholdingSignals.remittanceStatesWithholding
        ? "remittance_only"
        : evidence.withholdingSignals.operatorConfirmed
          ? "operator_confirmed"
          : "none",
      };
  }

  if (residualAmountCents <= bankChargeVarianceTolerance || remittanceMentionsBankCharge) {
    return {
      recognizedWithholdingAmountCents: 0,
      residualAmountCents,
      residualType: "bank_charge_adjustment",
      reviewReasonCodes: remittanceMentionsBankCharge ? ["bank_charge_variance_review"] : [],
      evidenceStatus: "none",
    };
  }

  return {
    recognizedWithholdingAmountCents: 0,
    residualAmountCents,
    residualType: "customer_short_pay",
    reviewReasonCodes: ["short_payment_unexplained"],
    evidenceStatus: "none",
  };
}

function stageWriteback(
  input: CashApplicationEvaluationInput,
  allocations: CashApplicationAllocationResult[],
  totalAllocated: number,
  residualAssessment: ResidualAssessment
): CashApplicationWritebackStage {
  return {
    status: "staged",
    paymentId: input.payment.id,
    billingAccountId: input.account.id,
    totalAppliedAmountCents: totalAllocated,
    unappliedAmountCents: input.payment.amountCents - totalAllocated,
    payload: {
      paymentReference: input.payment.paymentReference,
      settlementConfirmed: true,
      allocations: allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        invoiceNumber: allocation.invoiceNumber,
        appliedAmountCents: allocation.appliedAmountCents,
        ...(allocation.branchId ? { branchId: allocation.branchId } : {}),
      })),
      ...(residualAssessment.recognizedWithholdingAmountCents > 0
        ? {
            recognizedWithholdingAmountCents:
              residualAssessment.recognizedWithholdingAmountCents,
          }
        : {}),
    },
  };
}

function transitionPaymentForApplication(
  payment: Payment,
  transitions: PaymentTransitionService
) {
  if (payment.state === "candidate_match_found") {
    return payment;
  }

  return transitions.transition(payment, "candidate_match_found", {
    actorId: "system",
    actorRole: "system",
    reason: "cash_application_candidate_confirmed",
  });
}

function applyToInvoice(
  invoice: CustomerInvoice,
  appliedAmountCents: number,
  recognizedWithholdingAmountCents: number,
  residualAssessment: ResidualAssessment,
  matchedBankTransaction: boolean,
  occurredAt: string,
  transitions: InvoiceTransitionService
) {
  const currentOpenAmount = getInvoiceOpenAmount(invoice);
  const writeableInvoice =
    invoice.state === "matched_to_erp" || invoice.state === "partially_paid"
      ? invoice
      : transitions.transition(invoice, "matched_to_erp", {
          actorId: "system",
          actorRole: "system",
          occurredAt,
          reason: "cash_application_ready",
        });

  const targetState =
    matchedBankTransaction && appliedAmountCents + recognizedWithholdingAmountCents >= currentOpenAmount
      ? "paid"
      : "partially_paid";
  if (writeableInvoice.state === targetState) {
    return {
      ...writeableInvoice,
      updatedAt: occurredAt,
      metadata: {
        ...writeableInvoice.metadata,
        cashAppliedAmountCents: appliedAmountCents,
        recognizedWithholdingAmountCents,
        residualReviewReasonCodes: residualAssessment.reviewReasonCodes,
        withholdingEvidenceStatus: residualAssessment.evidenceStatus,
        residualType: residualAssessment.residualType,
        openAmountCents: Math.max(0, currentOpenAmount - appliedAmountCents - recognizedWithholdingAmountCents),
      },
    };
  }

  const transitioned = transitions.transition(writeableInvoice, targetState, {
    actorId: "system",
    actorRole: "system",
    occurredAt,
    reason: "cash_application_applied",
  });

  return {
    ...transitioned,
    metadata: {
      ...transitioned.metadata,
      cashAppliedAmountCents: appliedAmountCents,
      recognizedWithholdingAmountCents,
      residualReviewReasonCodes: residualAssessment.reviewReasonCodes,
      withholdingEvidenceStatus: residualAssessment.evidenceStatus,
      residualType: residualAssessment.residualType,
      openAmountCents: Math.max(0, currentOpenAmount - appliedAmountCents - recognizedWithholdingAmountCents),
    },
  };
}

function allocatePayment(paymentAmountCents: number, invoices: CustomerInvoice[]) {
  let remaining = paymentAmountCents;
  const allocations: CashApplicationAllocationInput[] = [];
  for (const invoice of invoices) {
    if (remaining <= 0) {
      break;
    }
    const openAmount = getInvoiceOpenAmount(invoice);
    const amountCents = Math.min(openAmount, remaining);
    if (amountCents <= 0) {
      continue;
    }
    allocations.push({ invoice, amountCents });
    remaining -= amountCents;
  }
  return allocations;
}

function amountFitScore(input: CashApplicationEngineInput, candidate: CashApplicationCandidate) {
  switch (candidate.policyAmountMatch) {
    case "exact":
      return 0.22;
    case "near_exact":
      return 0.14;
    case "partial":
      return 0.07;
    case "mismatch":
    default:
      return candidate.totalAllocatedCents > input.payment.amountCents ? -0.3 : -0.08;
  }
}

function scoreLearnedSignals(
  input: CashApplicationEngineInput,
  candidate: CashApplicationCandidate,
): {
  totalAdjustment: number;
  reasonSummaries: string[];
} {
  const behavior = resolveKnownCustomerBehavior(input);
  const expectedPayerNames = behavior.expectedPayerNames ?? [];
  const expectedPayerBankAccounts = behavior.expectedPayerBankAccounts ?? [];
  if (
    expectedPayerNames.length === 0 &&
    expectedPayerBankAccounts.length === 0 &&
    behavior.parentPaysForChildren !== true &&
    behavior.referenceQualityScore === undefined &&
    behavior.remittanceUsuallyArrivesAfterPayment !== true &&
    behavior.typicalBundleSize === undefined &&
    behavior.commonShortPayRate === undefined &&
    behavior.commonBankChargeVarianceCents === undefined &&
    behavior.allowBankChargeVarianceCents === undefined &&
    behavior.allowShortPayVarianceCents === undefined
  ) {
    return {
      totalAdjustment: 0,
      reasonSummaries: [],
    };
  }

  const reasonSummaries: string[] = [];
  let totalAdjustment = 0;
  const positiveCap =
    candidate.crossEntityAmbiguity || candidate.conflictingRemittanceData ? 0 : 0.12;
  let positiveAdjustment = 0;

  const addPositive = (value: number, reason: string) => {
    if (value <= 0 || positiveAdjustment >= positiveCap) {
      return;
    }
    const applied = Math.min(value, positiveCap - positiveAdjustment);
    if (applied <= 0) {
      return;
    }
    positiveAdjustment += applied;
    totalAdjustment += applied;
    reasonSummaries.push(reason);
  };

  const addNegative = (value: number, reason: string) => {
    if (value <= 0) {
      return;
    }
    totalAdjustment -= value;
    reasonSummaries.push(reason);
  };

  const normalizedPayerName = normalizeToken(readString(input.payment.metadata, "payerName"));
  const expectedPayerNameMatch =
    normalizedPayerName.length > 0 &&
    expectedPayerNames.some(
      (expectedName) => similarity(normalizedPayerName, normalizeToken(expectedName)) >= 0.9,
    );
  const expectedBankAccountMatch =
    normalizeToken(readString(input.payment.metadata, "payerBankAccount")).length > 0 &&
    expectedPayerBankAccounts.some(
      (account) =>
        normalizeToken(account) === normalizeToken(readString(input.payment.metadata, "payerBankAccount")),
    );

  if (
    candidate.allocations.every((allocation) => allocation.invoice.parentAccountId === input.account.parentAccountId) &&
    (behavior.parentPaysForChildren || (behavior.parentPayerProbability ?? 0) >= 0.7) &&
    (expectedPayerNameMatch || expectedBankAccountMatch || input.account.centrallyPaid)
  ) {
    addPositive(0.08, "Score increased because historical parent-payer behavior matches this payment.");
  }

  const referenceQuality = behavior.referenceQualityScore ?? deriveReferenceQuality(input.payment.paymentReference);
  if (referenceQuality < 0.45) {
    if (expectedPayerNameMatch || expectedBankAccountMatch) {
      addPositive(
        0.04,
        "Score increased because weak payment references are offset by strong historical payer identity.",
      );
    } else {
      addNegative(0.04, "Score decreased because payment references are weak and historical identity support is limited.");
    }
  }

  if (behavior.remittanceUsuallyArrivesAfterPayment && hasRemittanceArrivingAfterPayment(input)) {
    addPositive(0.03, "Score increased because remittance usually trails payment for this customer.");
  }

  if (
    behavior.typicalBundleSize &&
    behavior.typicalBundleSize > 1 &&
    candidate.allocations.length === behavior.typicalBundleSize
  ) {
    addPositive(0.03, "Score increased because the invoice bundle size matches historical payment bundling.");
  }

  if (
    candidate.policyAmountMatch === "partial" &&
    (behavior.commonShortPayRate ?? 0) >= 0.5
  ) {
    addPositive(0.04, "Score increased because short-pay behavior is common for this customer.");
  }

  const commonBankChargeVariance =
    behavior.commonBankChargeVarianceCents ?? behavior.allowBankChargeVarianceCents ?? 0;
  if (
    candidate.policyAmountMatch === "near_exact" &&
    commonBankChargeVariance > 0 &&
    Math.abs(input.payment.amountCents - candidate.totalAllocatedCents) <= commonBankChargeVariance
  ) {
    addPositive(
      0.05,
      "Score increased because the payment delta matches a common bank-charge variance pattern.",
    );
  }

  if (candidate.crossEntityAmbiguity) {
    addNegative(
      0.03,
      "Score decreased because cross-entity ambiguity blocks learning signals from overconfident matching.",
    );
  }

  return {
    totalAdjustment: Number(totalAdjustment.toFixed(3)),
    reasonSummaries: uniqueStrings(reasonSummaries),
  };
}

function scoreHierarchy(input: CashApplicationEngineInput, invoice: CustomerInvoice) {
  const behavior = resolveKnownCustomerBehavior(input);
  if (invoice.billingAccountId === input.account.id) {
    return 0.12;
  }
  if (
    invoice.parentAccountId === input.account.parentAccountId &&
    behavior.parentPaysForChildren
  ) {
    return 0.06;
  }
  if (invoice.branchId && input.account.branchId && invoice.branchId === input.account.branchId) {
    return 0.08;
  }
  return 0;
}

function scoreBehavior(
  behavior: CashApplicationKnownBehavior | undefined,
  evidence: NormalizedEvidence,
  invoice: CustomerInvoice
) {
  if (!behavior) {
    return 0;
  }

  let score = 0;
  if (behavior.remittanceUsuallyArrivesAfterPayment && evidence.remittanceTexts.length > 0) {
    score += 0.03;
  }
  if (behavior.branchReferenceBias && invoice.branchId) {
    const branchHit = evidence.remittanceTexts.some((text) =>
      text.includes(normalizeToken(invoice.branchId))
    );
    if (branchHit) {
      score += 0.04;
    }
  }
  return score;
}

function scoreAccountMapping(input: CashApplicationEngineInput, invoices: CustomerInvoice[]) {
  const behavior = resolveKnownCustomerBehavior(input);
  if (invoices.every((invoice) => invoice.billingAccountId === input.account.id)) {
    return 0.24;
  }
  if (
    invoices.every((invoice) => invoice.parentAccountId === input.account.parentAccountId) &&
    behavior.parentPaysForChildren
  ) {
    return 0.18;
  }
  return 0.08;
}

function classifyAmountMatch(
  input: CashApplicationEngineInput,
  allocations: CashApplicationAllocationInput[],
  evidence: NormalizedEvidence
) {
  const totalAllocatedCents = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const delta = Math.abs(input.payment.amountCents - totalAllocatedCents);
  const maxResidualCents = allocations.reduce((largestResidual, allocation) => {
    const residual = Math.max(0, getInvoiceOpenAmount(allocation.invoice) - allocation.amountCents);
    return Math.max(largestResidual, residual);
  }, 0);
  const leavesInvoiceBalance = allocations.some(
    (allocation) => allocation.amountCents < getInvoiceOpenAmount(allocation.invoice)
  );
  if (delta === 0 && !leavesInvoiceBalance) {
    return "exact";
  }
  const residualAssessment = assessResidualHandling(
    {
      payment: input.payment,
      allocations,
    },
    allocations,
    evidence
  );
  if (residualAssessment.recognizedWithholdingAmountCents > 0 && residualAssessment.residualAmountCents > 0) {
    return "near_exact";
  }
  if (
    delta <= resolveVarianceTolerance(input) &&
    (!leavesInvoiceBalance || maxResidualCents <= resolveVarianceTolerance(input))
  ) {
    return "near_exact";
  }
  if (leavesInvoiceBalance) {
    return "partial";
  }
  if (totalAllocatedCents < input.payment.amountCents) {
    return "partial";
  }
  return "mismatch";
}

function resolveVarianceTolerance(input: CashApplicationEngineInput) {
  const behavior = resolveKnownCustomerBehavior(input);
  return Math.max(
    behavior.commonBankChargeVarianceCents ?? 0,
    behavior.allowBankChargeVarianceCents ?? 0,
    behavior.allowShortPayVarianceCents ?? 0,
    500
  );
}

function hasRemittanceArrivingAfterPayment(input: CashApplicationEngineInput) {
  return input.remittanceEmails.some((email) => email.receivedAt > input.payment.receivedAt);
}

function deriveReferenceQuality(reference: string) {
  const normalized = normalizeToken(reference);
  if (normalized.length >= 8 && /\d/.test(normalized) && /[a-z]/.test(normalized)) {
    return 0.85;
  }
  if (normalized.length >= 5) {
    return 0.55;
  }
  return 0.25;
}

function summarizeScoreReasons(
  scoreBreakdown: Record<string, number>,
  learnedReasonSummaries: string[],
) {
  const reasons: string[] = [...learnedReasonSummaries];

  if ((scoreBreakdown.invoiceSignals ?? 0) >= 0.5) {
    reasons.push("Score increased because invoice references and remittance signals strongly align.");
  }
  if ((scoreBreakdown.amountFit ?? 0) >= 0.14) {
    reasons.push("Score increased because the payment amount fits policy tolerances.");
  }
  if ((scoreBreakdown.accountMapping ?? 0) >= 0.18) {
    reasons.push("Score increased because payer-to-account mapping is historically consistent.");
  }
  if ((scoreBreakdown.ambiguityPenalty ?? 0) < 0) {
    reasons.push("Score decreased because entity ambiguity remains unresolved.");
  }
  if ((scoreBreakdown.remittanceConsistency ?? 0) < 0) {
    reasons.push("Score decreased because remittance evidence conflicts with the candidate.");
  }
  if ((scoreBreakdown.erpWritebackPath ?? 0) < 0) {
    reasons.push("Score decreased because ERP writeback is not safely available.");
  }

  return uniqueStrings(reasons);
}

function selectExceptionDefinition(candidate: CashApplicationScoredCandidate): {
  kind: Parameters<typeof createTypedException>[0]["kind"];
  summary: string;
  details: string;
} {
  if (candidate.hasDisputeOrHold) {
    return {
      kind: "partial_dispute",
      summary: "Cash application exception created because at least one invoice is disputed or held.",
      details: "Held or disputed receivables cannot be auto-applied.",
    };
  }
  if (!candidate.erpWritebackPathAvailable) {
    return {
      kind: "erp_sync_inconsistency",
      summary: "Cash application exception created because ERP writeback is unavailable.",
      details: "Writeback staging could not be guaranteed for this payment.",
    };
  }
  if (candidate.conflictingRemittanceData || candidate.crossEntityAmbiguity) {
    return {
      kind: "proof_remittance_received_not_matched",
      summary: "Cash application exception created because remittance evidence is conflicting or cross-entity.",
      details: "The payment references multiple entities or conflicting remittance signals.",
    };
  }
  if (candidate.policyAmountMatch === "partial") {
    return {
      kind: "short_payment",
      summary: "Cash application exception created because only a short-pay candidate was found.",
      details: "The strongest candidate leaves a material residual balance.",
    };
  }
  return {
    kind: "unidentified_payer_unapplied_cash",
    summary: "Cash application exception created because payer mapping stayed below threshold.",
    details: "The evidence was insufficient to identify a no-regret invoice match.",
  };
}

function isInvoiceOpenInVerifiedSnapshot(invoice: CustomerInvoice) {
  const verifiedFlag =
    readBoolean(invoice.metadata, "latestVerifiedSnapshot") === true ||
    readBoolean(invoice.metadata, "snapshotVerified") === true;
  return (
    verifiedFlag ||
    invoice.state === "synced_open" ||
    invoice.state === "matched_to_erp" ||
    invoice.state === "partially_paid"
  );
}

function hasDisputeOrHold(invoice: CustomerInvoice) {
  return (
    invoice.state === "disputed_partial" ||
    invoice.state === "disputed_full" ||
    readBoolean(invoice.metadata, "holdFlag") === true
  );
}

function getInvoiceOpenAmount(invoice: CustomerInvoice) {
  const openAmount = readNumber(invoice.metadata, "openAmountCents");
  return typeof openAmount === "number" ? openAmount : invoice.amountCents;
}

function candidateExplanation(
  amountMatch: CashApplicationCandidate["policyAmountMatch"],
  billingAccountIds: string[],
  evidence: NormalizedEvidence
) {
  const explanation = [`Amount policy classification: ${amountMatch}.`];
  if (billingAccountIds.length > 1) {
    explanation.push("Candidate spans more than one billing account.");
  }
  if (!evidence.erpWritebackPathAvailable) {
    explanation.push("ERP writeback path is currently unavailable.");
  }
  if (evidence.withholdingSignals.form2307Linked && evidence.withholdingSignals.explicitAmountCents) {
    explanation.push("Withholding evidence includes a linked 2307 and explicit shortfall amount.");
  }
  if (
    evidence.withholdingSignals.remittanceStatesWithholding &&
    !evidence.withholdingSignals.form2307Linked
  ) {
    explanation.push("Remittance mentions withholding, but documentary closure evidence is still incomplete.");
  }
  return explanation;
}

function compareInvoicePriority(
  left: CustomerInvoice | { invoice: CustomerInvoice },
  right: CustomerInvoice | { invoice: CustomerInvoice }
) {
  const leftInvoice = "invoice" in left ? left.invoice : left;
  const rightInvoice = "invoice" in right ? right.invoice : right;
  const leftDate = leftInvoice.invoiceDate ?? leftInvoice.createdAt;
  const rightDate = rightInvoice.invoiceDate ?? rightInvoice.createdAt;
  return leftDate.localeCompare(rightDate) || leftInvoice.invoiceNumber.localeCompare(rightInvoice.invoiceNumber);
}

function extractInvoiceNumbers(value: string | undefined) {
  if (!value) {
    return [];
  }
  const matches = value.match(/\b(?:INV|SI|SOA)(?:[-\s]?[A-Z0-9]*\d[A-Z0-9]*)\b/gi) ?? [];
  return matches;
}

function extractPoNumbers(value: string | undefined) {
  if (!value) {
    return [];
  }
  const matches = value.match(/PO[-\s]?\d{3,}/gi) ?? [];
  return matches;
}

function textMentionsWithholding(value: string | undefined) {
  if (!value) {
    return false;
  }
  return /\b(withholding|withheld|cwt|w\/?tax|expanded withholding)\b/i.test(value);
}

function parseWithholdingAmountFromTexts(values: string[]) {
  for (const value of values) {
    const match =
      value.match(/\b(?:withholding|withheld|cwt|w\/?tax)[^0-9]{0,20}(?:php|₱)?\s*([\d,]+(?:\.\d{1,2})?)/i) ??
      value.match(/(?:php|₱)\s*([\d,]+(?:\.\d{1,2})?).{0,30}\b(?:withholding|withheld|cwt|w\/?tax)\b/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = parseCurrencyAmountToCents(match[1]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function parseWithholdingRateBpsFromTexts(values: string[]) {
  for (const value of values) {
    const match = value.match(/\b(?:withholding|withheld|cwt|w\/?tax).{0,20}(\d+(?:\.\d+)?)\s*%/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }
  return undefined;
}

function parseCurrencyAmountToCents(value: string) {
  const normalized = value.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.round(parsed * 100);
}

function normalizeToken(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function similarity(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string) {
  const matrix = Array.from({ length: right.length + 1 }, (_, row) =>
    Array.from({ length: left.length + 1 }, (_, column) =>
      row === 0 ? column : column === 0 ? row : 0
    )
  );

  for (let row = 1; row <= right.length; row += 1) {
    for (let column = 1; column <= left.length; column += 1) {
      const cost = right[row - 1] === left[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost
      );
    }
  }

  return matrix[right.length]![left.length]!;
}

function stringifyMetadata(metadata: Record<string, unknown> | undefined) {
  return metadata ? JSON.stringify(metadata) : "";
}

function allReferencesCoherent(invoiceNumbers: string[]) {
  const canonicalSuffixes = uniqueStrings(
    invoiceNumbers.map((value) =>
      normalizeToken(value).replace(/^(inv|si|soa)/, "")
    )
  );
  return canonicalSuffixes.length <= 1;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function findDuplicateInvoiceIds(invoiceIds: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const invoiceId of invoiceIds) {
    if (seen.has(invoiceId)) {
      duplicates.add(invoiceId);
      continue;
    }

    seen.add(invoiceId);
  }

  return [...duplicates];
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function roundConfidence(value: number) {
  return Number(Math.max(0, Math.min(0.999, value)).toFixed(3));
}

function firstDefinedNumber(values: Array<number | undefined>) {
  return values.find((value): value is number => typeof value === "number");
}

function ensureStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function readBoolean(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function readUnknown(metadata: Record<string, unknown> | undefined, key: string) {
  return metadata?.[key];
}
