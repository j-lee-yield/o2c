import type {
  OutreachCommunicationHistory,
  OutreachDeductionOrException,
  OutreachMessageSummary,
  OutreachOperatorFeedbackSignal,
  OutreachPaymentActivity,
  OutreachPromiseToPayStatus,
  OutreachRemittanceStatus,
} from "@o2c/contracts";
import type { LearningChannel } from "@o2c/domain";
import type {
  OutreachContextStore,
  OutreachContextSupplement,
  OutreachGenerationInput,
} from "@o2c/workflows";

import { loadPersistedLearningSummary } from "./learning-layer-read-model.js";
import { queryJsonRows, quoteLiteral } from "./postgres.js";

type StoredThreadRow = {
  id: string;
  contactId?: string;
  participantAddresses?: string[];
  subjectLine?: string;
  latestMessageAt?: string;
  providerThreadId?: string;
};

type StoredMessageRow = {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  occurredAt: string;
  subjectLine?: string;
  bodyPreview: string;
};

type StoredPaymentRow = {
  id: string;
  occurredAt: string;
  amountCents: number;
  currency: string;
  state: string;
  settlementStatus?: string;
  reference?: string;
  matchedInvoiceIds?: string[];
};

type StoredRemittanceRow = {
  id: string;
  occurredAt: string;
  state: OutreachRemittanceStatus["state"];
  amountCents?: number;
  linkedInvoiceIds?: string[];
  summary?: string;
};

type StoredDeductionRow = {
  id: string;
  invoiceId?: string;
  amountCents?: number;
  state: string;
  summary: string;
};

type StoredPromiseRow = {
  id: string;
  state: OutreachPromiseToPayStatus["state"];
  promisedDate?: string;
  promisedAmountCents?: number;
  currency?: string;
};

export class PostgresOutreachIntelligenceContextStore implements OutreachContextStore {
  private readonly databaseUrl: string;
  private readonly tenantId: string;

  constructor(databaseUrl: string, tenantId = "default") {
    this.databaseUrl = databaseUrl;
    this.tenantId = tenantId;
  }

  loadContextSupplement(input: OutreachGenerationInput): OutreachContextSupplement {
    const supplement: OutreachContextSupplement = {};

    if (!input.accountMemorySignals?.length) {
      const signals = this.loadAccountMemorySignals(input);
      if (signals.length > 0) {
        supplement.accountMemorySignals = signals;
      }
    }

    if (!input.relatedThreads?.length && !input.broadInboxFallbackThreads?.length) {
      const histories = this.loadCommunicationHistory(input);
      if (histories.relatedThreads.length > 0) {
        supplement.relatedThreads = histories.relatedThreads;
      }
      if (histories.broadInboxFallbackThreads.length > 0) {
        supplement.broadInboxFallbackThreads = histories.broadInboxFallbackThreads;
      }
    }

    if (!input.recentPayments?.length) {
      const payments = this.loadRecentPayments(input);
      if (payments.length > 0) {
        supplement.recentPayments = payments;
      }
    }

    if (!input.remittances?.length) {
      const remittances = this.loadRemittances(input);
      if (remittances.length > 0) {
        supplement.remittances = remittances;
      }
    }

    if (!input.deductions?.length) {
      const deductions = this.loadDeductions(input);
      if (deductions.length > 0) {
        supplement.deductions = deductions;
      }
    }

    if (!input.promiseToPay) {
      const promiseToPay = this.loadPromiseToPay(input);
      if (promiseToPay) {
        supplement.promiseToPay = promiseToPay;
      }
    }

    if (!input.crossEntityAmbiguity) {
      const sellerEntityIds = [
        ...new Set(
          input.invoices
            .map((invoice) => invoice.sellerEntityId)
            .filter((value): value is string => typeof value === "string" && value.length > 0),
        ),
      ];
      if (sellerEntityIds.length > 1) {
        supplement.crossEntityAmbiguity = {
          isAmbiguous: true,
          reason:
            "Multiple seller entities are represented in the invoice set, so the draft must avoid cash-application certainty.",
        };
      }
    }

    return supplement;
  }

  private loadAccountMemorySignals(
    input: OutreachGenerationInput,
  ): OutreachOperatorFeedbackSignal[] {
    const summary = loadPersistedLearningSummary({
      databaseUrl: this.databaseUrl,
      tenantId: this.tenantId,
      billingAccountId: input.account.id,
      accountNumber: input.account.accountNumber,
      ...(input.contact.email ? { contactEmail: input.contact.email } : {}),
    });
    if (!summary) {
      return [];
    }

    const signals: OutreachOperatorFeedbackSignal[] = [];
    const preferredChannel =
      toChannelLabel(summary.contactPreferredChannel) ?? toChannelLabel(summary.accountPreferredChannel);
    if (preferredChannel) {
      signals.push({
        source: "contact_preference",
        label: "Preferred channel",
        summary: `Stored behavior suggests ${preferredChannel} performs best for this account.`,
        value: preferredChannel,
      });
    }
    if (summary.recommendedReasonSummary) {
      signals.push({
        source: "operator_feedback",
        label: "Learning summary",
        summary: summary.recommendedReasonSummary,
      });
    }
    if (summary.accountExplanation?.[0]?.summary) {
      signals.push({
        source: "approved_pattern",
        label: "Account pattern",
        summary: summary.accountExplanation[0].summary,
      });
    }

    return signals.slice(0, 3);
  }

  private loadCommunicationHistory(input: OutreachGenerationInput): {
    relatedThreads: OutreachCommunicationHistory[];
    broadInboxFallbackThreads: OutreachCommunicationHistory[];
  } {
    const threads = queryJsonRows<StoredThreadRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            thread.id::text AS "id",
            thread.contact_id::text AS "contactId",
            thread.participant_addresses AS "participantAddresses",
            thread.subject_line AS "subjectLine",
            thread.latest_message_at AS "latestMessageAt",
            thread.provider_thread_id AS "providerThreadId"
          FROM communication_thread thread
          WHERE thread.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND thread.deleted_at IS NULL
            AND thread.channel = 'email'
            AND thread.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
          ORDER BY thread.latest_message_at DESC NULLS LAST, thread.updated_at DESC
          LIMIT 12
        ) q
      `,
    );
    if (threads.length === 0) {
      return { relatedThreads: [], broadInboxFallbackThreads: [] };
    }

    const messages = queryJsonRows<StoredMessageRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            message.id::text AS "id",
            message.thread_id::text AS "threadId",
            message.direction,
            message.occurred_at AS "occurredAt",
            message.subject_line AS "subjectLine",
            message.body_preview AS "bodyPreview"
          FROM communication_message message
          WHERE message.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND message.deleted_at IS NULL
            AND message.channel = 'email'
            AND message.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
          ORDER BY message.occurred_at DESC
          LIMIT 48
        ) q
      `,
    );

    const currentProviderThreadId = input.currentThread?.providerThreadId;
    const contactEmail = input.contact.email?.toLowerCase();
    const contactId = input.contact.id;

    const histories = threads
      .filter((thread) => thread.providerThreadId !== currentProviderThreadId)
      .map((thread) => {
        const threadMessages = messages
          .filter((message) => message.threadId === thread.id)
          .slice(0, 4)
          .map((message) => toOutreachMessage(message));
        return {
          id: thread.id,
          source: "related_thread" as const,
          channel: "email" as const,
          ...(thread.contactId ? { contactId: thread.contactId } : {}),
          billingAccountId: input.account.id,
          ...(thread.providerThreadId ? { providerThreadId: thread.providerThreadId } : {}),
          ...(thread.subjectLine ? { subjectLine: thread.subjectLine } : {}),
          participants: thread.participantAddresses ?? [],
          ...(thread.latestMessageAt ? { lastMessageAt: thread.latestMessageAt } : {}),
          messages: threadMessages,
        };
      });

    const relatedThreads = histories
      .filter((thread) => {
        const participantMatch = contactEmail
          ? thread.participants.some((participant) => participant.toLowerCase() === contactEmail)
          : false;
        return thread.contactId === contactId || participantMatch;
      })
      .slice(0, 3);

    const broadInboxFallbackThreads =
      relatedThreads.length > 0
        ? []
        : histories
            .map((thread) => ({
              ...thread,
              source: "broad_inbox_fallback" as const,
            }))
            .slice(0, 2);

    return {
      relatedThreads,
      broadInboxFallbackThreads,
    };
  }

  private loadRecentPayments(input: OutreachGenerationInput): OutreachPaymentActivity[] {
    const invoiceIds = input.invoices.map((invoice) => invoice.id);
    const invoicePredicate =
      invoiceIds.length > 0
        ? `OR application.invoice_id = ANY (ARRAY[${invoiceIds
            .map((invoiceId) => `'${quoteLiteral(invoiceId)}'::uuid`)
            .join(", ")}])`
        : "";

    const rows = queryJsonRows<StoredPaymentRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            payment.id::text AS "id",
            payment.received_at AS "occurredAt",
            payment.amount_cents AS "amountCents",
            payment.currency,
            payment.state,
            payment.settlement_status AS "settlementStatus",
            payment.payment_reference AS "reference",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT application.invoice_id::text), NULL) AS "matchedInvoiceIds"
          FROM payment
          LEFT JOIN payment_application application
            ON application.payment_id = payment.id
           AND application.deleted_at IS NULL
          WHERE payment.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND payment.deleted_at IS NULL
            AND (
              payment.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
              ${invoicePredicate}
            )
          GROUP BY payment.id
          ORDER BY payment.received_at DESC
          LIMIT 5
        ) q
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      amountCents: row.amountCents,
      currency: row.currency,
      status: mapPaymentStatus(row.state, row.settlementStatus),
      ...(row.reference ? { reference: row.reference } : {}),
      ...(row.matchedInvoiceIds?.length ? { matchedInvoiceIds: row.matchedInvoiceIds } : {}),
    }));
  }

  private loadRemittances(input: OutreachGenerationInput): OutreachRemittanceStatus[] {
    const invoiceIds = input.invoices.map((invoice) => invoice.id);
    const invoicePredicate =
      invoiceIds.length > 0
        ? `AND (${invoiceIds
            .map(
              (invoiceId) => `
                processing.invoice_candidates::text ILIKE '%${quoteLiteral(invoiceId)}%'
                OR processing.review::text ILIKE '%${quoteLiteral(invoiceId)}%'
              `,
            )
            .join(" OR ")})`
        : "";

    const rows = queryJsonRows<StoredRemittanceRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            remittance.id::text AS "id",
            remittance.created_at AS "occurredAt",
            remittance.state,
            payment.amount_cents AS "amountCents",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT application.invoice_id::text), NULL) AS "linkedInvoiceIds",
            COALESCE(
              processing.review->>'summary',
              processing.parsed->>'summary',
              remittance.raw_payload->>'subject'
            ) AS "summary"
          FROM remittance
          LEFT JOIN remittance_processing_record processing
            ON processing.remittance_id = remittance.id
          LEFT JOIN payment
            ON payment.id = remittance.payment_id
          LEFT JOIN payment_application application
            ON application.payment_id = payment.id
           AND application.deleted_at IS NULL
          WHERE remittance.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND remittance.deleted_at IS NULL
            ${invoicePredicate}
            AND (
              payment.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
              OR remittance.payment_id IS NULL
            )
          GROUP BY remittance.id, payment.amount_cents, processing.review, processing.parsed
          ORDER BY remittance.created_at DESC
          LIMIT 3
        ) q
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      state: row.state,
      ...(row.amountCents !== undefined ? { amountCents: row.amountCents } : {}),
      ...(row.linkedInvoiceIds?.length ? { linkedInvoiceIds: row.linkedInvoiceIds } : {}),
      ...(row.summary ? { summary: row.summary } : {}),
    }));
  }

  private loadDeductions(input: OutreachGenerationInput): OutreachDeductionOrException[] {
    const invoiceIds = input.invoices.map((invoice) => invoice.id);
    const invoicePredicate =
      invoiceIds.length > 0
        ? `AND (deduction.invoice_id = ANY (ARRAY[${invoiceIds
            .map((invoiceId) => `'${quoteLiteral(invoiceId)}'::uuid`)
            .join(", ")}]))`
        : "";

    const rows = queryJsonRows<StoredDeductionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            deduction.id::text AS "id",
            deduction.invoice_id::text AS "invoiceId",
            deduction.target_amount_cents AS "amountCents",
            deduction.state,
            CONCAT_WS(
              ': ',
              NULLIF(deduction.reason_code, ''),
              NULLIF(exception.summary, '')
            ) AS "summary"
          FROM deduction_case deduction
          LEFT JOIN exception
            ON exception.id = deduction.exception_id
           AND exception.deleted_at IS NULL
          WHERE deduction.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND deduction.deleted_at IS NULL
            AND deduction.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
            ${invoicePredicate}
          ORDER BY deduction.updated_at DESC
          LIMIT 5
        ) q
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      ...(row.invoiceId ? { invoiceId: row.invoiceId } : {}),
      ...(row.amountCents !== undefined ? { amountCents: row.amountCents } : {}),
      state: row.state,
      summary: row.summary || "Open deduction or exception remains under review.",
    }));
  }

  private loadPromiseToPay(input: OutreachGenerationInput): OutreachPromiseToPayStatus | undefined {
    const rows = queryJsonRows<StoredPromiseRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            promise.id::text AS "id",
            promise.state,
            promise.promise_date::text AS "promisedDate",
            promise.promised_amount_cents AS "promisedAmountCents",
            promise.currency
          FROM promise_to_pay promise
          WHERE promise.tenant_id = '${quoteLiteral(this.tenantId)}'
            AND promise.deleted_at IS NULL
            AND promise.billing_account_id = '${quoteLiteral(input.account.id)}'::uuid
            AND (
              promise.contact_id = '${quoteLiteral(input.contact.id)}'::uuid
              OR promise.contact_id IS NULL
            )
          ORDER BY promise.promise_date DESC, promise.updated_at DESC
          LIMIT 1
        ) q
      `,
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      state: row.state,
      ...(row.promisedDate ? { promisedDate: row.promisedDate } : {}),
      ...(row.promisedAmountCents !== undefined
        ? { promisedAmountCents: row.promisedAmountCents }
        : {}),
      ...(row.promisedDate || row.promisedAmountCents !== undefined
        ? {
            summary: [
              row.promisedAmountCents !== undefined
                ? `${row.currency ?? input.account.currency} ${row.promisedAmountCents / 100}`
                : undefined,
              row.promisedDate ? `promised for ${row.promisedDate}` : undefined,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" "),
          }
        : {}),
    };
  }
}

function toChannelLabel(channel: LearningChannel | undefined): string | undefined {
  if (!channel) {
    return undefined;
  }
  return channel.replaceAll("_", " ");
}

function toOutreachMessage(row: StoredMessageRow): OutreachMessageSummary {
  return {
    id: row.id,
    direction: row.direction,
    occurredAt: row.occurredAt,
    ...(row.subjectLine ? { subjectLine: row.subjectLine } : {}),
    bodyPreview: row.bodyPreview,
  };
}

function mapPaymentStatus(
  state: string,
  settlementStatus: string | undefined,
): OutreachPaymentActivity["status"] {
  if (state === "review_required" || state === "candidate_match_found") {
    return "review_required";
  }
  if (
    state === "auto_applied" ||
    state === "manually_applied" ||
    state === "partially_applied"
  ) {
    return "applied";
  }
  if (settlementStatus === "settled") {
    return "posted";
  }
  return "pending";
}
