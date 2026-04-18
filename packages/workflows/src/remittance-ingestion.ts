import type { AuditLogger } from "@o2c/audit";
import type {
  AuditContext,
  DuplicateSignalInput,
  InvoiceMatchCandidate,
  InvoiceRemittanceLinker,
  ParsedField,
  ParsedMoneyField,
  ParsedRemittanceResult,
  PaymentMatchCandidate,
  PaymentRemittanceLinker,
  RemittanceIngestionOutcome,
  RemittanceParser,
  RemittanceRecordView,
  RemittanceSourceInput,
  ReviewDecision
} from "@o2c/contracts";
import { evaluateRemittanceIngestion, type IngestionPolicyConfig } from "./ingestion-foundation.js";
import {
  RemittanceTransitionService,
  type LearningEvent,
  type Payment,
  type Invoice,
  type Remittance
} from "@o2c/domain";
import { WorkflowLearningEventFactory } from "./learning-events.js";

export interface RemittanceIngestionDependencies {
  auditLogger: AuditLogger;
  parser: RemittanceParser;
  paymentLinker: PaymentRemittanceLinker;
  invoiceLinker: InvoiceRemittanceLinker;
  repository: RemittanceRepository;
  idGenerator?: () => string;
  now?: () => string;
}

export interface RemittanceIngestionServicePolicy {
  ingestion?: IngestionPolicyConfig;
  orphanAfterHours: number;
}

export const defaultRemittanceIngestionServicePolicy: RemittanceIngestionServicePolicy = {
  orphanAfterHours: 72
};

export interface StoredRemittanceRecord {
  remittance: Remittance;
  source: RemittanceSourceInput;
  parsed?: ParsedRemittanceResult;
  paymentCandidates: PaymentMatchCandidate[];
  invoiceCandidates: InvoiceMatchCandidate[];
  linkedPaymentId?: string;
  review?: ReviewDecision;
}

export interface RemittanceRepository {
  save(record: StoredRemittanceRecord): Promise<void>;
  get(remittanceId: string): Promise<StoredRemittanceRecord | undefined>;
}

export class RemittanceRecordNotFoundError extends Error {
  readonly remittanceId: string;

  constructor(remittanceId: string) {
    super(`Remittance "${remittanceId}" was not found.`);
    this.name = "RemittanceRecordNotFoundError";
    this.remittanceId = remittanceId;
  }
}

export class RemittanceIngestionProcessingError extends Error {
  readonly remittanceId: string;

  constructor(remittanceId: string, cause: unknown) {
    super(
      `Remittance "${remittanceId}" could not be processed${cause instanceof Error ? `: ${cause.message}` : "."}`
    );
    this.name = "RemittanceIngestionProcessingError";
    this.remittanceId = remittanceId;
  }
}

export class NativeRemittanceParser implements RemittanceParser {
  async parse(input: RemittanceSourceInput): Promise<ParsedRemittanceResult> {
    const text = buildSourceText(input);
    const referencedInvoices = extractInvoiceReferences(text);
    const totalAmount = extractAmount(text);
    const paymentReference = extractPaymentReference(text, input);
    const payerName = extractPayerName(text, input);
    const payerEmail =
      input.channel === "email_inbox"
        ? {
            value: input.fromEmail.toLowerCase(),
            confidence: 0.99,
            rawText: input.fromEmail
          }
        : undefined;
    const attachmentLinks = input.attachments.map((attachment, index) => ({
      documentId: attachment.documentId,
      role: index === 0 ? "primary" : "supporting",
      confidence: 0.99,
      ...(attachment.fileName ? { fileName: attachment.fileName } : {})
    })) satisfies ParsedRemittanceResult["attachmentLinks"];
    const signalConfidences = [
      payerName?.confidence ?? 0,
      paymentReference?.confidence ?? 0,
      totalAmount?.confidence ?? 0,
      ...referencedInvoices.map((reference) => reference.confidence)
    ].filter((value) => value > 0);
    const overallConfidence =
      signalConfidences.length > 0
        ? Number(
            (signalConfidences.reduce((sum, value) => sum + value, 0) / signalConfidences.length).toFixed(2)
          )
        : 0.4;

    return {
      parser: "native_heuristic",
      overallConfidence,
      ...(payerName ? { payerName } : {}),
      ...(payerEmail ? { payerEmail } : {}),
      ...(paymentReference ? { paymentReference } : {}),
      ...(totalAmount ? { totalAmount } : {}),
      referencedInvoices,
      attachmentLinks,
      rawPayload: {
        channel: input.channel,
        sourceId: input.sourceId,
        text,
        attachmentCount: input.attachments.length
      },
      metadata: {
        attachmentCount: input.attachments.length
      }
    };
  }
}

export class InMemoryPaymentRemittanceLinker implements PaymentRemittanceLinker {
  constructor(private readonly payments: Payment[]) {}

  async findCandidates(context: {
    remittanceId: string;
    source: RemittanceSourceInput;
    parsed: ParsedRemittanceResult;
  }): Promise<PaymentMatchCandidate[]> {
    const candidates = this.payments
      .map((payment) => scorePaymentCandidate(payment, context.source, context.parsed))
      .filter((candidate): candidate is PaymentMatchCandidate => candidate !== undefined)
      .sort((left, right) => right.confidence - left.confidence);

    return candidates;
  }
}

export class InMemoryInvoiceRemittanceLinker implements InvoiceRemittanceLinker {
  constructor(private readonly invoices: Invoice[]) {}

  async findCandidates(context: {
    remittanceId: string;
    source: RemittanceSourceInput;
    parsed: ParsedRemittanceResult;
  }): Promise<InvoiceMatchCandidate[]> {
    const referencedByNumber = new Map(
      context.parsed.referencedInvoices
        .filter((reference) => reference.invoiceNumber)
        .map((reference) => [reference.invoiceNumber!.toLowerCase(), reference])
    );

    const candidates: InvoiceMatchCandidate[] = [];

    for (const invoice of this.invoices) {
        const invoiceReference = referencedByNumber.get(invoice.invoiceNumber.toLowerCase());
        if (!invoiceReference) {
          continue;
        }

        let confidence = invoiceReference.confidence;
        const reasons = ["invoice_reference_exact"];

        if (
          invoiceReference.amountCents !== undefined &&
          invoiceReference.amountCents === invoice.amountCents
        ) {
          confidence += 0.08;
          reasons.push("invoice_amount_match");
        }

        if (
          invoiceReference.currency !== undefined &&
          invoiceReference.currency.toUpperCase() === invoice.currency.toUpperCase()
        ) {
          confidence += 0.05;
          reasons.push("invoice_currency_match");
        }

        candidates.push({
          invoiceId: invoice.id,
          parentAccountId: invoice.parentAccountId,
          billingAccountId: invoice.billingAccountId,
          ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
          invoiceNumber: invoice.invoiceNumber,
          currency: invoice.currency,
          amountCents: invoice.amountCents,
          confidence: Number(Math.min(confidence, 0.99).toFixed(2)),
          reasons,
          metadata: invoice.metadata
        } satisfies InvoiceMatchCandidate);
    }

    candidates.sort((left, right) => right.confidence - left.confidence);

    return candidates;
  }
}

export class InMemoryRemittanceRepository implements RemittanceRepository {
  private readonly records = new Map<string, StoredRemittanceRecord>();

  async save(record: StoredRemittanceRecord): Promise<void> {
    this.records.set(record.remittance.id, structuredClone(record));
  }

  async get(remittanceId: string): Promise<StoredRemittanceRecord | undefined> {
    const record = this.records.get(remittanceId);
    return record ? structuredClone(record) : undefined;
  }
}

export class RemittanceIngestionService {
  private readonly transitionService = new RemittanceTransitionService();
  private readonly learningEvents = new WorkflowLearningEventFactory();
  private readonly idGenerator: () => string;
  private readonly now: () => string;
  private readonly policy: RemittanceIngestionServicePolicy;

  constructor(
    private readonly deps: RemittanceIngestionDependencies,
    policy: Partial<RemittanceIngestionServicePolicy> = {}
  ) {
    this.idGenerator = deps.idGenerator ?? createCounterIdGenerator("remit");
    this.now = deps.now ?? (() => new Date().toISOString());
    this.policy = {
      ...defaultRemittanceIngestionServicePolicy,
      ...policy
    };
  }

  async ingest(params: {
    source: RemittanceSourceInput;
    auditContext: AuditContext;
    duplicateSignals?: DuplicateSignalInput;
  }): Promise<{
    outcome: RemittanceIngestionOutcome;
    record: RemittanceRecordView;
    learningEvents: LearningEvent[];
  }> {
    const timestamp = this.now();
    const remittanceId = this.idGenerator();
    const actor = toActorContext(params.auditContext);

    let remittance: Remittance = {
      id: remittanceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: "received_unparsed",
      ...(params.source.attachments[0] ? { uploadedDocumentId: params.source.attachments[0].documentId } : {}),
      sourceChannel: mapSourceChannel(params.source.channel),
      metadata: {
        inputChannel: params.source.channel,
        sourceId: params.source.sourceId,
        attachmentCount: params.source.attachments.length
      }
    };

    await this.deps.auditLogger.log(params.auditContext, {
      action: "remittance.received",
      entityId: remittanceId,
      entityType: "remittance",
      metadata: {
        sourceChannel: params.source.channel,
        sourceId: params.source.sourceId,
        attachmentCount: params.source.attachments.length
      }
    });
    const learningEvents: LearningEvent[] = this.learningEvents.buildRemittanceLifecycleEvents({
      remittance,
      occurredAt: timestamp,
      phase: "received",
    });

    try {
      const parsed = await this.deps.parser.parse(params.source);
      remittance = {
        ...remittance,
        rawPayload: parsed.rawPayload,
        metadata: {
          ...remittance.metadata,
          parser: parsed.parser
        }
      };
      remittance = this.transitionService.transition(remittance, "parsed_structured", {
        ...actor,
        occurredAt: timestamp,
        reason: "parser_completed"
      });
      learningEvents.push(
        ...this.learningEvents.buildRemittanceLifecycleEvents({
          remittance,
          occurredAt: timestamp,
          phase: "parsed",
        })
      );

      const linkContext = {
        remittanceId,
        source: params.source,
        parsed
      };

      const [paymentCandidates, invoiceCandidates] = await Promise.all([
        this.deps.paymentLinker.findCandidates(linkContext),
        this.deps.invoiceLinker.findCandidates(linkContext)
      ]);

      const decision = await evaluateRemittanceIngestion({
        extraction: {
          provider: parsed.parser === "yield" ? "yield" : "native_heuristic",
          document: {
            documentId: params.source.attachments[0]?.documentId ?? remittanceId,
            checksum: params.source.attachments[0]?.checksum ?? `synthetic-${remittanceId}`,
            source: mapDocumentSource(params.source.channel),
            ...(params.source.attachments[0]?.fileName
              ? { fileName: params.source.attachments[0].fileName }
              : {}),
            ...(params.source.attachments[0]?.mimeType
              ? { mimeType: params.source.attachments[0].mimeType }
              : {}),
            uploadedAt: deriveSourceTimestamp(params.source)
          },
          overallConfidence: parsed.overallConfidence,
          ...(parsed.payerName ? { remitterName: parsed.payerName } : {}),
          ...(parsed.paymentReference ? { paymentReference: parsed.paymentReference } : {}),
          referencedInvoices: parsed.referencedInvoices,
          ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
          rawPayloadReference: params.source.sourceId
        },
        ...(params.duplicateSignals ? { duplicateSignals: params.duplicateSignals } : {}),
        matchedPaymentCount: paymentCandidates.length,
        matchedInvoiceCount: invoiceCandidates.length,
        auditContext: params.auditContext,
        deps: { auditLogger: this.deps.auditLogger },
        ...(this.policy.ingestion ? { policy: this.policy.ingestion } : {})
      });

      let linkedPaymentId: string | undefined;
      if (decision.route === "link_payment_candidate" && paymentCandidates[0]) {
        linkedPaymentId = paymentCandidates[0].paymentId;
        const linkedPayment = paymentCandidates[0];
        remittance = {
          ...this.transitionService.transition(remittance, "linked_to_payment", {
            ...actor,
            occurredAt: timestamp,
            reason: "payment_candidate_linked",
            metadata: {
              paymentLinked: true
            }
          }),
          paymentId: linkedPaymentId
        };
        learningEvents.push(
          ...this.learningEvents.buildRemittanceLifecycleEvents({
            remittance,
            occurredAt: timestamp,
            phase: "linked",
            parentAccountId: linkedPayment.parentAccountId,
            billingAccountId: linkedPayment.billingAccountId,
            paymentId: linkedPaymentId,
          })
        );
      } else if (decision.route === "link_invoice_candidate" && invoiceCandidates.length > 0) {
        const linkedInvoice = invoiceCandidates[0];
        if (!linkedInvoice) {
          throw new Error("Expected an invoice candidate when linking remittance to invoice.");
        }
        remittance = this.transitionService.transition(remittance, "linked_to_invoice_candidate", {
          ...actor,
          occurredAt: timestamp,
          reason: "invoice_candidate_linked"
        });
        learningEvents.push(
          ...this.learningEvents.buildRemittanceLifecycleEvents({
            remittance,
            occurredAt: timestamp,
            phase: "linked",
            parentAccountId: linkedInvoice.parentAccountId,
            billingAccountId: linkedInvoice.billingAccountId,
            branchId: linkedInvoice.branchId,
            invoiceIds: invoiceCandidates.map((candidate) => candidate.invoiceId),
          })
        );
      } else if (decision.review) {
        remittance = this.transitionService.transition(remittance, "review_required", {
          ...actor,
          occurredAt: timestamp,
          reason: decision.review.reasons.join(",")
        });
        const reviewContext = invoiceCandidates[0] ?? paymentCandidates[0];
        learningEvents.push(
          ...this.learningEvents.buildRemittanceLifecycleEvents({
            remittance,
            occurredAt: timestamp,
            phase: "review_required",
            parentAccountId: reviewContext?.parentAccountId,
            billingAccountId: reviewContext?.billingAccountId,
            branchId: invoiceCandidates[0]?.branchId,
            paymentId: paymentCandidates[0]?.paymentId,
            invoiceIds: invoiceCandidates.map((candidate) => candidate.invoiceId),
          })
        );
      }

      await this.deps.auditLogger.log(params.auditContext, {
        action: "remittance.routed",
        entityId: remittanceId,
        entityType: "remittance",
        metadata: {
          state: remittance.state,
          route: decision.route,
          paymentCandidateCount: paymentCandidates.length,
          invoiceCandidateCount: invoiceCandidates.length
        }
      });

      const storedRecord: StoredRemittanceRecord = {
        remittance,
        source: params.source,
        parsed,
        paymentCandidates,
        invoiceCandidates,
        ...(linkedPaymentId ? { linkedPaymentId } : {}),
        ...(decision.review ? { review: decision.review } : {})
      };
      await this.deps.repository.save(storedRecord);

      return {
        outcome: {
          remittanceId,
          state: remittance.state,
          route: decision.route,
          ...(linkedPaymentId ? { linkedPaymentId } : {}),
          candidatePaymentIds: paymentCandidates.map((candidate) => candidate.paymentId),
          candidateInvoiceIds: invoiceCandidates.map((candidate) => candidate.invoiceId),
          attachmentDocumentIds: parsed.attachmentLinks.map((attachment) => attachment.documentId),
          duplicateCheck: decision.duplicateCheck,
          ...(decision.review ? { review: decision.review } : {})
        },
        record: toRemittanceRecordView(storedRecord),
        learningEvents,
      };
    } catch (error) {
      await this.deps.auditLogger.log(params.auditContext, {
        action: "remittance.processing_failed",
        entityId: remittanceId,
        entityType: "remittance",
        metadata: {
          sourceChannel: params.source.channel,
          reason: error instanceof Error ? error.name : "unknown_error"
        }
      });
      throw new RemittanceIngestionProcessingError(remittanceId, error);
    }
  }

  async getRecord(remittanceId: string): Promise<RemittanceRecordView> {
    const record = await this.getStoredRecord(remittanceId);
    return toRemittanceRecordView(record);
  }

  async resolve(params: {
    remittanceId: string;
    auditContext: AuditContext;
    reason?: string;
  }): Promise<{ record: RemittanceRecordView; learningEvents: LearningEvent[] }> {
    const record = await this.getStoredRecord(params.remittanceId);
    const learningEvents: LearningEvent[] = [];
    if (record.remittance.state !== "resolved") {
      record.remittance = this.transitionService.transition(record.remittance, "resolved", {
        ...toActorContext(params.auditContext),
        occurredAt: this.now(),
        reason: params.reason ?? "manual_resolution"
      });
      await this.deps.auditLogger.log(params.auditContext, {
        action: "remittance.resolved",
        entityId: record.remittance.id,
        entityType: "remittance",
        metadata: {
          state: record.remittance.state
        }
      });
      await this.deps.repository.save(record);
      learningEvents.push(
        ...this.learningEvents.buildRemittanceLifecycleEvents({
          remittance: record.remittance,
          occurredAt: this.now(),
          phase: "resolved",
          paymentId: record.linkedPaymentId,
          invoiceIds: record.invoiceCandidates.map((candidate) => candidate.invoiceId),
        })
      );
    }

    return { record: toRemittanceRecordView(record), learningEvents };
  }

  async markOrphanedIfExpired(params: {
    remittanceId: string;
    auditContext: AuditContext;
    asOf?: string;
  }): Promise<{ orphaned: boolean; record: RemittanceRecordView; learningEvents: LearningEvent[] }> {
    const record = await this.getStoredRecord(params.remittanceId);
    const asOf = params.asOf ?? this.now();
    const learningEvents: LearningEvent[] = [];
    const ageInHours =
      (Date.parse(asOf) - Date.parse(deriveSourceTimestamp(record.source))) / (1000 * 60 * 60);

    if (
      ageInHours < this.policy.orphanAfterHours ||
      record.remittance.state === "resolved" ||
      record.remittance.state === "orphaned"
    ) {
      return {
        orphaned: record.remittance.state === "orphaned",
        record: toRemittanceRecordView(record),
        learningEvents,
      };
    }

    const transitionContext = {
      ...toActorContext(params.auditContext),
      occurredAt: asOf,
      reason: "policy_window_elapsed"
    };
    record.remittance =
      record.remittance.state === "linked_to_payment" ||
      record.remittance.state === "linked_to_invoice_candidate"
        ? this.transitionService.transition(
            this.transitionService.transition(record.remittance, "review_required", transitionContext),
            "orphaned",
            transitionContext
          )
        : this.transitionService.transition(record.remittance, "orphaned", transitionContext);
    await this.deps.auditLogger.log(params.auditContext, {
      action: "remittance.orphaned",
      entityId: record.remittance.id,
      entityType: "remittance",
      metadata: {
        orphanAfterHours: this.policy.orphanAfterHours,
        ageInHours: Number(ageInHours.toFixed(2))
      }
    });
    await this.deps.repository.save(record);
    learningEvents.push(
      ...this.learningEvents.buildRemittanceLifecycleEvents({
        remittance: record.remittance,
        occurredAt: asOf,
        phase: "orphaned",
        paymentId: record.linkedPaymentId,
        invoiceIds: record.invoiceCandidates.map((candidate) => candidate.invoiceId),
      })
    );

    return {
      orphaned: true,
      record: toRemittanceRecordView(record),
      learningEvents,
    };
  }

  private async getStoredRecord(remittanceId: string): Promise<StoredRemittanceRecord> {
    const record = await this.deps.repository.get(remittanceId);
    if (!record) {
      throw new RemittanceRecordNotFoundError(remittanceId);
    }

    return record;
  }
}

function toRemittanceRecordView(record: StoredRemittanceRecord): RemittanceRecordView {
  return {
    remittanceId: record.remittance.id,
    sourceChannel: record.source.channel,
    state: record.remittance.state,
    ...(record.parsed?.payerName?.value ? { payerName: record.parsed.payerName.value } : {}),
    ...(record.parsed?.paymentReference?.value
      ? { paymentReference: record.parsed.paymentReference.value }
      : {}),
    ...(record.parsed?.totalAmount?.value !== undefined
      ? { totalAmountCents: record.parsed.totalAmount.value }
      : {}),
    ...(record.parsed?.totalAmount?.currency ? { currency: record.parsed.totalAmount.currency } : {}),
    candidatePaymentIds: record.paymentCandidates.map((candidate) => candidate.paymentId),
    candidateInvoiceIds: record.invoiceCandidates.map((candidate) => candidate.invoiceId),
    attachmentDocumentIds: (record.parsed?.attachmentLinks ?? []).map((attachment) => attachment.documentId),
    ...(record.review ? { review: record.review } : {})
  };
}

function buildSourceText(input: RemittanceSourceInput): string {
  const attachmentNames = input.attachments.map((attachment) => attachment.fileName).filter(Boolean);

  switch (input.channel) {
    case "email_inbox":
      return [input.subject, input.bodyText, attachmentNames.join(" ")].filter(Boolean).join("\n");
    case "upload":
      return [input.fileName, input.bodyText, attachmentNames.join(" ")].filter(Boolean).join("\n");
    case "linked_payment_workflow":
      return [input.paymentReference, input.bodyText, attachmentNames.join(" ")]
        .filter(Boolean)
        .join("\n");
  }
}

function extractInvoiceReferences(text: string) {
  const matches = new Map<string, { invoiceNumber: string; amountCents?: number; currency?: string; confidence: number }>();
  for (const match of text.matchAll(/\b(?:INV|SI|SOA|AR)[- ]?\d{3,}\b/gi)) {
    const invoiceNumber = match[0].replace(/\s+/g, "-").toUpperCase();
    matches.set(invoiceNumber, {
      invoiceNumber,
      confidence: 0.94
    });
  }

  for (const match of text.matchAll(/invoice\s*(?:no\.?|#|number)?\s*[:\-]?\s*([A-Z0-9-]+)/gi)) {
    const capturedInvoiceNumber = match[1];
    if (!capturedInvoiceNumber) {
      continue;
    }
    const invoiceNumber = capturedInvoiceNumber.toUpperCase();
    if (!matches.has(invoiceNumber)) {
      matches.set(invoiceNumber, {
        invoiceNumber,
        confidence: 0.88
      });
    }
  }

  const amount = extractAmount(text);
  return Array.from(matches.values()).map((reference) => ({
    ...reference,
    ...(amount?.value !== undefined ? { amountCents: amount.value } : {}),
    ...(amount?.currency ? { currency: amount.currency } : {})
  }));
}

function extractAmount(text: string): ParsedMoneyField | undefined {
  const amountMatch =
    text.match(/(?:PHP|USD|₱|\$)\s*([0-9][0-9,]*(?:\.\d{2})?)/i) ??
    text.match(/amount\s*(?:paid|received)?\s*[:\-]?\s*([0-9][0-9,]*(?:\.\d{2})?)/i);
  if (!amountMatch) {
    return undefined;
  }

  const rawText = amountMatch[0];
  const rawAmount = amountMatch[1];
  if (!rawText || !rawAmount) {
    return undefined;
  }
  const value = Number.parseFloat(rawAmount.replace(/,/g, ""));
  const currency =
    rawText.includes("USD") || rawText.includes("$")
      ? "USD"
      : "PHP";

  return {
    value: Math.round(value * 100),
    currency,
    confidence: rawText.toLowerCase().includes("amount") ? 0.9 : 0.86,
    rawText
  };
}

function extractPaymentReference(
  text: string,
  input: RemittanceSourceInput
): ParsedField<string> | undefined {
  const workflowReference =
    input.channel === "linked_payment_workflow" ? input.paymentReference : undefined;
  if (workflowReference) {
    return {
      value: workflowReference,
      confidence: 0.99,
      rawText: workflowReference
    };
  }

  const match =
    text.match(
      /(?:payment\s+reference|payment\s+ref|reference|ref|trace|txn)\s*(?:no\.?|#|number)?\s*[:\-]?\s*([A-Z0-9-]+)/i
    ) ??
    text.match(/payment\s+([A-Z0-9-]{4,})/i);
  if (!match) {
    return undefined;
  }

  const referenceValue = match[1];
  const rawText = match[0];
  if (!referenceValue || !rawText) {
    return undefined;
  }

  return {
    value: referenceValue.toUpperCase(),
    confidence: 0.91,
    rawText
  };
}

function extractPayerName(text: string, input: RemittanceSourceInput): ParsedField<string> | undefined {
  if (input.channel === "email_inbox" && input.fromName) {
    return {
      value: input.fromName,
      confidence: 0.95,
      rawText: input.fromName
    };
  }

  const match = text.match(/(?:payer|remitter|from)\s*[:\-]?\s*([A-Z][A-Za-z0-9 &,.-]{3,})/i);
  if (!match) {
    return undefined;
  }

  const payerName = match[1];
  const rawText = match[0];
  if (!payerName || !rawText) {
    return undefined;
  }

  return {
    value: payerName.trim(),
    confidence: 0.86,
    rawText
  };
}

function scorePaymentCandidate(
  payment: Payment,
  source: RemittanceSourceInput,
  parsed: ParsedRemittanceResult
): PaymentMatchCandidate | undefined {
  let confidence = 0;
  const reasons: string[] = [];

  if (source.channel === "linked_payment_workflow" && source.paymentId === payment.id) {
    confidence += 0.7;
    reasons.push("linked_payment_workflow");
  }

  if (
    parsed.paymentReference?.value &&
    parsed.paymentReference.value.toLowerCase() === payment.paymentReference.toLowerCase()
  ) {
    confidence += 0.2;
    reasons.push("payment_reference_exact");
  }

  if (
    parsed.totalAmount?.value !== undefined &&
    parsed.totalAmount.value === payment.amountCents &&
    (!parsed.totalAmount.currency ||
      parsed.totalAmount.currency.toUpperCase() === payment.currency.toUpperCase())
  ) {
    confidence += 0.12;
    reasons.push("payment_amount_match");
  }

  if (reasons.includes("payment_reference_exact") && reasons.includes("payment_amount_match")) {
    confidence = Math.max(confidence, 0.9);
  }

  if (confidence < 0.2) {
    return undefined;
  }

  return {
    paymentId: payment.id,
    parentAccountId: payment.parentAccountId,
    ...(payment.billingAccountId ? { billingAccountId: payment.billingAccountId } : {}),
    paymentReference: payment.paymentReference,
    currency: payment.currency,
    amountCents: payment.amountCents,
    receivedAt: payment.receivedAt,
    confidence: Number(Math.min(confidence, 0.99).toFixed(2)),
    reasons,
    metadata: payment.metadata
  };
}

function mapSourceChannel(channel: RemittanceSourceInput["channel"]): Remittance["sourceChannel"] {
  switch (channel) {
    case "email_inbox":
      return "email";
    case "upload":
      return "portal";
    case "linked_payment_workflow":
      return "api";
  }
}

function mapDocumentSource(channel: RemittanceSourceInput["channel"]): "email" | "portal" | "api" | "manual" {
  switch (channel) {
    case "email_inbox":
      return "email";
    case "upload":
      return "manual";
    case "linked_payment_workflow":
      return "api";
  }
}

function deriveSourceTimestamp(source: RemittanceSourceInput): string {
  switch (source.channel) {
    case "email_inbox":
      return source.receivedAt;
    case "upload":
      return source.uploadedAt;
    case "linked_payment_workflow":
      return source.linkedAt;
  }
}

function toActorContext(auditContext: AuditContext): {
  actorId: string;
  actorRole: "system" | "user" | "admin";
} {
  return {
    actorId: auditContext.actorId,
    actorRole: auditContext.actorType === "user" ? "user" : "system"
  };
}

function createCounterIdGenerator(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}_${++counter}`;
}
