import type { BillingAccount, Contact } from "../accounts/schema.js";
import type { UploadedDocument } from "../documents/schema.js";
import {
  canAutoChaseInvoice,
  DisputedInvoiceAutoChaseBlockedError,
  getCollectibleAmountCents,
  type CustomerInvoice,
} from "../invoices/index.js";

import type {
  CollectionEscalationStage,
  CollectionReplyAnalysis,
  CollectionReminderDraft,
  CollectionScope,
  CollectionSendWindow,
  CollectionWorkspace,
  CustomerMemoryUpdate,
  RequestedDocumentType,
  ResendBundleDocument,
  ResendDocumentBundle,
} from "./schema.js";
import { UnsupportedCollectionsNegotiationError } from "./errors.js";
import { createEntityMetadata } from "../../shared/types.js";

export function buildCollectionWorkspace(params: {
  account: BillingAccount;
  invoices: CustomerInvoice[];
  scope?: CollectionScope;
  contact?: Contact;
  asOf?: string;
  sendWindow?: CollectionSendWindow;
}): CollectionWorkspace {
  const scope = params.scope ?? "account";
  const asOf = params.asOf ?? new Date().toISOString();
  const invoiceRefs = params.invoices.map((invoice) => toInvoiceRef(invoice, asOf));
  const branchIds = [...new Set(invoiceRefs.map((invoice) => invoice.branchId).filter(isDefined))];
  const sendWindow = params.sendWindow ?? defaultCollectionSendWindow();

  return {
    billingAccount: params.account,
    scope,
    groupingMode: scope === "invoice" ? "invoice" : "billing_account",
    invoices: invoiceRefs,
    openInvoiceCount: invoiceRefs.length,
    branchIds,
    urgentInvoiceCount: invoiceRefs.filter((invoice) => invoice.isUrgent).length,
    sendWindow,
    ...(params.contact
      ? {
          recommendedRecipient: {
            id: params.contact.id,
            fullName: params.contact.fullName,
            allowAutoSend: params.contact.allowAutoSend,
            isVerified: params.contact.isVerified,
            ...(params.contact.email ? { email: params.contact.email } : {}),
          },
        }
      : {}),
  };
}

export function createReminderDraft(params: {
  reminderId: string;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  scope?: CollectionScope;
  contact?: Contact;
  sendStrategy: CollectionReminderDraft["sendStrategy"];
  deliveryState: CollectionReminderDraft["deliveryState"];
  escalationStage: CollectionEscalationStage;
  blockedReason?: CollectionReminderDraft["blockedReason"];
  sendWindow?: CollectionSendWindow;
  subjectLine: string;
  previewLine: string;
  bodySections: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}): CollectionReminderDraft {
  const workspace = buildCollectionWorkspace({
    account: params.account,
    invoices: params.invoices,
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.contact ? { contact: params.contact } : {}),
    asOf: params.createdAt,
    ...(params.sendWindow ? { sendWindow: params.sendWindow } : {})
  });

  return {
    id: params.reminderId,
    ...createEntityMetadata({
      at: params.createdAt,
      actorId: "system_collections",
      actorRole: "system"
    }),
    billingAccountId: params.account.id,
    parentAccountId: params.account.parentAccountId,
    branchIds: workspace.branchIds,
    groupingMode: workspace.groupingMode,
    scope: workspace.scope,
    channel: "email",
    ...(params.contact ? { recipientContactId: params.contact.id } : {}),
    ...(params.contact?.email ? { recipientEmail: params.contact.email } : {}),
    sendStrategy: params.sendStrategy,
    deliveryState: params.deliveryState,
    escalationStage: params.escalationStage,
    ...(params.blockedReason ? { blockedReason: params.blockedReason } : {}),
    sendWindow: workspace.sendWindow,
    urgentInvoiceIds: workspace.invoices
      .filter((invoice) => invoice.isUrgent)
      .map((invoice) => invoice.invoiceId),
    subjectLine: params.subjectLine,
    previewLine: params.previewLine,
    bodySections: [...params.bodySections],
    invoiceRefs: workspace.invoices,
    metadata: {
      defaultGroupingApplied: workspace.groupingMode === "billing_account",
      ...params.metadata,
    },
  };
}

export function assertInvoicesEligibleForReminder(invoices: CustomerInvoice[]): void {
  const blockedInvoice = invoices.find((invoice) => !canAutoChaseInvoice(invoice));
  if (blockedInvoice) {
    throw new DisputedInvoiceAutoChaseBlockedError(blockedInvoice.id);
  }
}

export function defaultCollectionSendWindow(): CollectionSendWindow {
  return {
    timezone: "Asia/Manila",
    startHour: 8,
    endHour: 23,
    allowedWeekdays: [1, 2, 3, 4, 5],
  };
}

export function isWithinCollectionSendWindow(
  asOf: string,
  sendWindow: CollectionSendWindow
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: sendWindow.timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(asOf));
  const weekdayLabel = parts.find((part) => part.type === "weekday")?.value;
  const hourValue = Number(parts.find((part) => part.type === "hour")?.value ?? "99");
  const weekday = toIsoWeekday(weekdayLabel);

  return (
    weekday !== undefined &&
    sendWindow.allowedWeekdays.includes(weekday) &&
    hourValue >= sendWindow.startHour &&
    hourValue <= sendWindow.endHour
  );
}

export function determineCollectionEscalationStage(
  invoices: CustomerInvoice[],
  asOf: string
): CollectionEscalationStage {
  const overdueDays = invoices
    .map((invoice) => getDaysPastDue(invoice.dueDate, asOf))
    .filter((value): value is number => value !== undefined);

  if (overdueDays.length > 0) {
    const mostSevere = Math.max(...overdueDays);
    if (mostSevere >= 45) {
      return "stop_and_mark_exception";
    }
    if (mostSevere >= 30) {
      return "escalate_to_account_owner";
    }
    if (mostSevere >= 21) {
      return "ask_for_remittance_advice";
    }
    if (mostSevere >= 8) {
      return "ask_for_payment_date";
    }
    if (mostSevere >= 1) {
      return "overdue_follow_up";
    }
  }

  const dueSoonDays = invoices
    .map((invoice) => getDaysUntilDue(invoice.dueDate, asOf))
    .filter((value): value is number => value !== undefined);

  if (dueSoonDays.length > 0 && Math.min(...dueSoonDays) <= 2) {
    return "due_date_reminder";
  }

  return "friendly_reminder";
}

export function buildReminderContent(params: {
  account: BillingAccount;
  invoices: CustomerInvoice[];
  scope: CollectionScope;
  escalationStage: CollectionEscalationStage;
  asOf: string;
}): Pick<CollectionReminderDraft, "subjectLine" | "previewLine" | "bodySections"> {
  const invoiceRefs = params.invoices.map((invoice) => toInvoiceRef(invoice, params.asOf));
  const invoiceSummary =
    params.scope === "invoice" && invoiceRefs[0]
      ? `invoice ${invoiceRefs[0].invoiceNumber}`
      : `${invoiceRefs.length} open invoices`;
  const urgentInvoiceRefs = invoiceRefs.filter((invoice) => invoice.isUrgent);
  const urgentSection =
    urgentInvoiceRefs.length > 0
      ? `Urgent invoices: ${urgentInvoiceRefs.map((invoice) => invoice.invoiceNumber).join(", ")}.`
      : "No urgent invoices are currently highlighted.";

  return {
    subjectLine: `${humanizeStage(params.escalationStage)}: ${params.account.displayName} ${invoiceSummary}`,
    previewLine: `${params.account.displayName} has ${invoiceSummary} in ${params.escalationStage.replaceAll("_", " ")} stage.`,
    bodySections: [
      `${humanizeStage(params.escalationStage)} for ${params.account.displayName}.`,
      `This email follows the default billing-account grouping unless an invoice-level reminder is explicitly requested.`,
      urgentSection,
    ],
  };
}

export function classifyCollectionReply(input: {
  subject?: string;
  body: string;
  hasAttachments?: boolean;
  invoices?: CustomerInvoice[];
}): CollectionReplyAnalysis {
  const originalText = `${input.subject ?? ""}\n${input.body}`;
  const text = originalText.toLowerCase();
  const reasons: string[] = [];
  const invoices = identifyInvoices(input.invoices ?? [], originalText);

  const negotiationMatch = findNegotiationRequest(text);
  if (negotiationMatch) {
    throw new UnsupportedCollectionsNegotiationError(negotiationMatch);
  }

  if (/\b(wrong contact|wrong person|not the right contact|i am not handling|no longer handling)\b/.test(text)) {
    reasons.push("wrong_contact_phrase");
    return {
      classification: "wrong_contact",
      confidence: 0.97,
      requiresHumanReview: false,
      reasons,
      invoices,
      requestedDocumentTypes: [],
    };
  }

  if (
    /\b(already paid|payment sent|paid already|payment was made|settled already|funds transferred)\b/.test(
      text
    ) ||
    ((/\b(remittance|proof of payment|deposit slip|bank receipt)\b/.test(text) || input.hasAttachments) &&
      /\b(paid|payment)\b/.test(text))
  ) {
    reasons.push("already_paid_phrase");
    if (input.hasAttachments || /\b(remittance|proof of payment|deposit slip|bank receipt)\b/.test(text)) {
      reasons.push("payment_evidence_detected");
    }
    return {
      classification: "already_paid",
      confidence: 0.95,
      requiresHumanReview: true,
      reasons,
      invoices,
      requestedDocumentTypes: [],
    };
  }

  const requestedDocs = extractRequestedDocumentTypes(text);
  if (
    /\b(did not receive|didn't receive|not received|missing invoice|cannot find the invoice|no invoice received)\b/.test(
      text
    )
  ) {
    reasons.push("invoice_not_received_phrase");
    return {
      classification: "invoice_not_received",
      confidence: 0.94,
      requiresHumanReview: false,
      reasons,
      invoices,
      requestedDocumentTypes: requestedDocs.length > 0 ? requestedDocs : ["invoice"],
    };
  }

  const documentRequestIntent =
    /\b(resend|send again|send|share|provide|forward|need|request|copy of invoice|statement of account|soa|supporting docs|backup documents)\b/.test(
      text
    );

  if (
    (requestedDocs.length > 0 && documentRequestIntent) ||
    /\b(resend|send again|copy of invoice|statement of account|soa|supporting docs|backup documents)\b/.test(
      text
    )
  ) {
    reasons.push("document_request_phrase");
    return {
      classification: "request_for_docs",
      confidence: 0.9,
      requiresHumanReview: false,
      reasons,
      invoices,
      requestedDocumentTypes: requestedDocs.length > 0 ? requestedDocs : ["supporting"],
    };
  }

  const promiseDate = extractPromiseDate(text);
  const amountCents = extractPromisedAmount(text);
  const promiseRiskFlags = extractPromiseRiskFlags(text, promiseDate, amountCents);
  if (/\b(promise|commit|pay on|will pay|pay next|settle on|payment on|can pay by)\b/.test(text) || promiseDate) {
    reasons.push("promise_language_detected");
    return {
      classification: "promise_to_pay",
      confidence: promiseDate ? 0.93 : 0.8,
      requiresHumanReview: promiseRiskFlags.length > 0,
      reasons,
      ...(promiseDate ? { extractedPromiseDate: promiseDate } : {}),
      ...(amountCents !== undefined ? { extractedAmountCents: amountCents } : {}),
      invoices,
      requestedDocumentTypes: [],
      ptp: {
        ...(promiseDate ? { promiseDate } : {}),
        ...(amountCents !== undefined ? { promisedAmountCents: amountCents } : {}),
        confidence: promiseDate ? 0.93 : 0.8,
        riskFlags: promiseRiskFlags,
      },
    };
  }

  if (/\b(partial dispute|short pay|shortpaid|pricing issue|quantity issue|damaged|credit memo for part)\b/.test(text)) {
    reasons.push("partial_dispute_phrase");
    return {
      classification: "partial_dispute",
      confidence: 0.92,
      requiresHumanReview: true,
      reasons,
      invoices,
      requestedDocumentTypes: [],
    };
  }

  if (
    /\b(dispute the invoice|dispute this invoice|reject the invoice|invoice is invalid|not accepting this invoice|full dispute)\b/.test(
      text
    ) ||
    /\b(dispute|incorrect|wrong amount|credit memo|short shipped|not delivered)\b/.test(text)
  ) {
    reasons.push("full_dispute_phrase");
    return {
      classification: "full_dispute",
      confidence: 0.9,
      requiresHumanReview: true,
      reasons,
      invoices,
      requestedDocumentTypes: [],
    };
  }

  if (/\b(follow up|overdue|past due|friendly reminder)\b/.test(text)) {
    reasons.push("reminder_language");
    return {
      classification: "low_risk_reminder",
      confidence: 0.75,
      requiresHumanReview: false,
      reasons,
      invoices,
      requestedDocumentTypes: [],
    };
  }

  return {
    classification: "generic_no_action_reply",
    confidence: 0.55,
    requiresHumanReview: false,
    reasons: ["generic_reply_without_servicing_or_payment_action"],
    invoices,
    requestedDocumentTypes: [],
  };
}

export function createCustomerMemoryUpdate(params: {
  memoryId: string;
  occurredAt: string;
  account: BillingAccount;
  contact?: Contact;
  analysis: CollectionReplyAnalysis;
  note?: string;
  promiseToPayState?: string;
}): CustomerMemoryUpdate {
  return {
    id: params.memoryId,
    ...createEntityMetadata({
      at: params.occurredAt,
      actorId: "system_collections",
      actorRole: "system"
    }),
    parentAccountId: params.account.parentAccountId,
    billingAccountId: params.account.id,
    ...(params.contact ? { contactId: params.contact.id } : {}),
    lastReplyClassification: params.analysis.classification,
    lastReplyAt: params.occurredAt,
    ...(params.promiseToPayState ? { promiseToPayState: params.promiseToPayState } : {}),
    ...(params.analysis.ptp?.promiseDate ? { promiseToPayDate: params.analysis.ptp.promiseDate } : {}),
    wrongContactReported: params.analysis.classification === "wrong_contact",
    servicingIssueOpen:
      params.analysis.classification === "invoice_not_received" ||
      params.analysis.classification === "request_for_docs",
    requestedDocumentTypes: params.analysis.requestedDocumentTypes,
    disputedInvoiceIds:
      params.analysis.classification === "partial_dispute" ||
      params.analysis.classification === "full_dispute"
        ? params.analysis.invoices.map((invoice) => invoice.invoiceId)
        : [],
    notes: [params.note ?? defaultMemoryNote(params.analysis)],
    metadata: {
      replyConfidence: params.analysis.confidence,
      reasons: params.analysis.reasons,
    },
  };
}

export function assembleResendDocumentBundle(params: {
  bundleId: string;
  occurredAt: string;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  analysis: CollectionReplyAnalysis;
  contact?: Contact;
  availableDocuments?: UploadedDocument[];
}): ResendDocumentBundle {
  const requestedDocumentTypes: RequestedDocumentType[] =
    params.analysis.requestedDocumentTypes.length > 0 ? params.analysis.requestedDocumentTypes : ["invoice"];
  const documents = requestedDocumentTypes.flatMap((documentType) =>
    buildBundleDocuments(documentType, params.invoices, params.availableDocuments ?? [])
  );
  const hasMissingDocs = documents.some((document) => !document.available);
  const verifiedRecipient = Boolean(params.contact?.isVerified && params.contact.allowAutoSend);

  return {
    id: params.bundleId,
    ...createEntityMetadata({
      at: params.occurredAt,
      actorId: "system_collections",
      actorRole: "system"
    }),
    parentAccountId: params.account.parentAccountId,
    billingAccountId: params.account.id,
    ...(params.contact ? { recipientContactId: params.contact.id } : {}),
    invoiceIds: params.invoices.map((invoice) => invoice.id),
    requestedDocumentTypes,
    documents,
    sendStrategy: hasMissingDocs
      ? "manual_exception"
      : verifiedRecipient
        ? "auto_send"
        : "awaiting_review",
    servicingClassification:
      params.analysis.classification === "invoice_not_received" ? "invoice_not_received" : "request_for_docs",
    metadata: {
      verifiedRecipient,
      missingDocumentCount: documents.filter((document) => !document.available).length,
    },
  };
}

function toInvoiceRef(invoice: CustomerInvoice, asOf: string) {
  const daysPastDue = getDaysPastDue(invoice.dueDate, asOf);
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    parentAccountId: invoice.parentAccountId,
    billingAccountId: invoice.billingAccountId,
    ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    amountCents: getCollectibleAmountCents(invoice),
    currency: invoice.currency,
    ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
    ...(daysPastDue !== undefined ? { daysPastDue } : {}),
    isUrgent: isUrgentInvoice(invoice, asOf),
    state: invoice.state,
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function findNegotiationRequest(
  text: string
): "discount" | "settlement" | "payment_plan" | undefined {
  if (/\bdiscount\b/.test(text)) {
    return "discount";
  }
  if (/\bsettlement\b/.test(text)) {
    return "settlement";
  }
  if (/\b(payment plan|installment)\b/.test(text)) {
    return "payment_plan";
  }
  return undefined;
}

function isUrgentInvoice(invoice: CustomerInvoice, asOf: string): boolean {
  if (invoice.metadata.urgent === true) {
    return true;
  }

  const daysPastDue = getDaysPastDue(invoice.dueDate, asOf);
  if (daysPastDue !== undefined && daysPastDue >= 1) {
    return true;
  }

  const daysUntilDue = getDaysUntilDue(invoice.dueDate, asOf);
  return daysUntilDue !== undefined && daysUntilDue <= 1;
}

function getDaysPastDue(dueDate: string | undefined, asOf: string): number | undefined {
  if (!dueDate) {
    return undefined;
  }

  const diff = diffDays(`${dueDate}T00:00:00.000Z`, asOf);
  return diff > 0 ? diff : 0;
}

function getDaysUntilDue(dueDate: string | undefined, asOf: string): number | undefined {
  if (!dueDate) {
    return undefined;
  }

  return diffDays(asOf, `${dueDate}T00:00:00.000Z`);
}

function diffDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const utcFrom = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const utcTo = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((utcTo - utcFrom) / 86_400_000);
}

function humanizeStage(stage: CollectionEscalationStage): string {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function toIsoWeekday(label: string | undefined): number | undefined {
  switch (label) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    case "Sun":
      return 7;
    default:
      return undefined;
  }
}

function identifyInvoices(invoices: CustomerInvoice[], text: string) {
  const normalized = text.toLowerCase();
  const matched = invoices.filter((invoice) =>
    normalized.includes(invoice.invoiceNumber.toLowerCase())
  );

  if (matched.length > 0) {
    return matched.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      matchedBy: "invoice_number" as const,
    }));
  }

  return invoices.map((invoice) => ({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    matchedBy: "provided_context" as const,
  }));
}

function extractRequestedDocumentTypes(text: string): RequestedDocumentType[] {
  const documentTypes: RequestedDocumentType[] = [];

  if (/\b(invoice|invoice copy|e-invoice)\b/.test(text)) {
    documentTypes.push("invoice");
  }
  if (/\b(statement of account|soa|statement)\b/.test(text)) {
    documentTypes.push("statement_of_account");
  }
  if (/\b(delivery receipt|dr)\b/.test(text)) {
    documentTypes.push("delivery_receipt");
  }
  if (/\b(proof of delivery|pod)\b/.test(text)) {
    documentTypes.push("proof_of_delivery");
  }
  if (/\b(supporting docs|supporting documents|backup documents|documents)\b/.test(text)) {
    documentTypes.push("supporting");
  }

  return [...new Set(documentTypes)];
}

function extractPromiseRiskFlags(
  text: string,
  promiseDate: string | undefined,
  amountCents: number | undefined
) {
  const riskFlags: string[] = [];

  if (!promiseDate) {
    riskFlags.push("missing_promise_date");
  }
  if (amountCents === undefined) {
    riskFlags.push("missing_promised_amount");
  }
  if (/\b(if cashflow improves|maybe|try|tentative|subject to approval)\b/.test(text)) {
    riskFlags.push("conditional_language");
  }

  return riskFlags;
}

function extractPromiseDate(text: string): string | undefined {
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (isoDate) {
    return isoDate;
  }

  const slashDate = text.match(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/)?.[1];
  if (!slashDate) {
    return undefined;
  }

  const [month, day, year] = slashDate.split("/");
  if (!month || !day || !year) {
    return undefined;
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractPromisedAmount(text: string): number | undefined {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/\b(?:php|₱)\s*(\d+(?:\.\d{1,2})?)\b/i);
  if (!match?.[1]) {
    return undefined;
  }

  return Math.round(Number(match[1]) * 100);
}

function buildBundleDocuments(
  documentType: RequestedDocumentType,
  invoices: CustomerInvoice[],
  availableDocuments: UploadedDocument[]
): ResendBundleDocument[] {
  return invoices.map((invoice) => {
    const matchedDocument = findDocumentForType(invoice, documentType, availableDocuments);

    if (!matchedDocument) {
      return {
        documentType,
        available: false,
        invoiceId: invoice.id,
        missingReason: "document_not_available",
      };
    }

    return {
      documentType,
      sourceDocumentType: matchedDocument.documentType,
      documentId: matchedDocument.id,
      storageKey: matchedDocument.storageKey,
      available: true,
      invoiceId: invoice.id,
    };
  });
}

function findDocumentForType(
  invoice: CustomerInvoice,
  documentType: RequestedDocumentType,
  availableDocuments: UploadedDocument[]
) {
  const metadata = invoice.metadata as Record<string, unknown>;
  const directDocumentId =
    documentType === "invoice"
      ? invoice.uploadedDocumentId
      : typeof metadata[`${documentType}DocumentId`] === "string"
        ? (metadata[`${documentType}DocumentId`] as string)
        : undefined;

  if (directDocumentId) {
    return availableDocuments.find((document) => document.id === directDocumentId);
  }

  const acceptableTypes = mapRequestedDocumentType(documentType);
  return availableDocuments.find((document) => acceptableTypes.includes(document.documentType));
}

function mapRequestedDocumentType(documentType: RequestedDocumentType): UploadedDocument["documentType"][] {
  switch (documentType) {
    case "invoice":
      return ["invoice", "bir_invoice"];
    case "statement_of_account":
      return ["statement_of_account", "supporting", "supporting_other"];
    case "delivery_receipt":
      return ["delivery_receipt", "supporting", "supporting_other"];
    case "proof_of_delivery":
      return ["proof_of_delivery", "delivery_receipt", "supporting", "supporting_other"];
    case "supporting":
      return [
        "supporting",
        "supporting_other",
        "statement_of_account",
        "delivery_receipt",
        "proof_of_delivery",
        "purchase_order",
        "official_receipt",
        "proof_of_payment",
        "bank_statement",
        "invoice",
        "bir_invoice",
      ];
  }
}

function defaultMemoryNote(analysis: CollectionReplyAnalysis): string {
  switch (analysis.classification) {
    case "promise_to_pay":
      return "Customer committed to a payment date that should be monitored.";
    case "already_paid":
      return "Customer reports payment was already made; stop active chase until reconciled.";
    case "wrong_contact":
      return "Customer says the current recipient is not the correct contact.";
    case "invoice_not_received":
      return "Customer reports the invoice was not received and needs servicing support.";
    case "request_for_docs":
      return "Customer asked for supporting documents before further action.";
    case "partial_dispute":
      return "Customer raised a partial invoice dispute that should block auto-chase for the disputed amount.";
    case "full_dispute":
      return "Customer raised a full invoice dispute and should not be auto-chased.";
    case "generic_no_action_reply":
      return "Customer replied without a payment or servicing commitment.";
    default:
      return "Customer reply was captured for collections memory.";
  }
}
