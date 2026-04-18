import type {
  CustomerProfileReadModel,
  LearningReason,
  LearningChannel,
} from "@o2c/domain";
import { buildCustomerProfileReadModel } from "@o2c/domain";
import { queryJsonRows, quoteLiteral } from "./postgres.js";

export interface PersistedLearningSummaryRow {
  billingAccountId: string;
  accountNumber?: string;
  accountName?: string;
  contactName?: string;
  contactEmail?: string;
  accountPreferredChannel?: LearningChannel;
  accountFallbackChannel?: LearningChannel;
  accountMetricsByChannel?: Record<string, unknown>;
  accountEvidenceSummary?: { eventCount?: number; feedbackCount?: number; lookbackWindowDays?: number };
  accountExplanation?: LearningReason[];
  contactPreferredChannel?: LearningChannel;
  contactEvidenceSummary?: { eventCount?: number; feedbackCount?: number; lookbackWindowDays?: number };
  contactExplanation?: LearningReason[];
  verificationSnapshot?: { emailVerified?: boolean; smsNumberVerified?: boolean; phoneNumberVerified?: boolean };
  recommendedAction?: string;
  recommendedChannel?: LearningChannel;
  score?: number;
  recommendedReasonSummary?: string;
  candidateScores?: Array<{
    action?: string;
    score?: number;
    channel?: LearningChannel;
    blockedBySafety?: boolean;
    reasonSummary?: string;
  }>;
  avgDaysToPay?: number;
  avgDaysLate?: number;
  resendBeforePayRate?: number;
  promiseKeptRate?: number;
  wrongContactRate?: number;
  parentPayerProbability?: number;
  remittanceQualityLabel?: "high" | "medium" | "low" | "unknown";
  remittanceQualityReasonSummary?: string;
}

export interface LoadPersistedLearningSummaryInput {
  databaseUrl: string;
  tenantId: string;
  billingAccountId?: string;
  accountNumber?: string;
  contactEmail?: string;
}

export interface LoadPersistedCustomerProfileInput
  extends LoadPersistedLearningSummaryInput {}

export type LearningSummaryQueryExecutor = (databaseUrl: string, sql: string) => unknown[];

interface PersistedCustomerProfileRow {
  billingAccountId: string;
  accountNumber?: string;
  accountName?: string;
  parentAccountId?: string;
  parentAccountName?: string;
  accountPreferredChannel?: LearningChannel;
  accountFallbackChannel?: LearningChannel;
  accountMetricsByChannel?: Record<string, unknown>;
  accountEvidenceSummary?: { eventCount?: number; feedbackCount?: number; lookbackWindowDays?: number };
  accountExplanation?: LearningReason[];
  contactPreferredChannel?: LearningChannel;
  contactExplanation?: LearningReason[];
  contactEvidenceSummary?: { eventCount?: number; feedbackCount?: number; lookbackWindowDays?: number };
  verificationSnapshot?: { emailVerified?: boolean; smsNumberVerified?: boolean; phoneNumberVerified?: boolean };
  preferredContactId?: string;
  preferredContactName?: string;
  preferredContactEmail?: string;
  preferredContactPhone?: string;
  preferredContactVerified?: boolean;
  recommendedAction?: string;
  recommendedChannel?: LearningChannel;
  score?: number;
  recommendedReasonSummary?: string;
  candidateScores?: Array<{
    action?: string;
    score?: number;
    channel?: LearningChannel;
    blockedBySafety?: boolean;
    reasonSummary?: string;
  }>;
  avgDaysToPay?: number;
  avgDaysLate?: number;
  groupedReminderAttempts?: number;
  groupedReminderPayments?: number;
  resendAttempts?: number;
  resendPayments?: number;
  remittanceTotalCount?: number;
  remittanceStructuredCount?: number;
  remittanceLinkedCount?: number;
  promiseObservedCount?: number;
  promiseKeptCount?: number;
  communicationAttemptCount?: number;
  wrongContactCount?: number;
  parentPayerObservations?: number;
  parentPayerSignals?: number;
}

export function loadPersistedLearningSummary(
  input: LoadPersistedLearningSummaryInput,
  executor: LearningSummaryQueryExecutor = queryJsonRows,
): PersistedLearningSummaryRow | undefined {
  if (!input.billingAccountId && !input.accountNumber) {
    return undefined;
  }

  try {
    const [rawRow] = executor(input.databaseUrl, buildPersistedCustomerProfileQuery(input));
    if (!rawRow) {
      return undefined;
    }
    const row = rawRow as PersistedCustomerProfileRow;
    const profile = toCustomerProfileReadModel(row);

    return {
    billingAccountId: profile.billingAccountId,
    ...(profile.accountNumber ? { accountNumber: profile.accountNumber } : {}),
    ...(profile.accountName ? { accountName: profile.accountName } : {}),
    ...(profile.preferredContact.contactName ? { contactName: profile.preferredContact.contactName } : {}),
    ...(profile.preferredContact.contactEmail ? { contactEmail: profile.preferredContact.contactEmail } : {}),
    ...(profile.preferredChannel ? { accountPreferredChannel: profile.preferredChannel } : {}),
    ...(profile.fallbackChannel ? { accountFallbackChannel: profile.fallbackChannel } : {}),
    ...(profile.paymentBehaviorSnapshot.groupedReminderEffectiveness ||
    profile.paymentBehaviorSnapshot.remittanceQuality ||
    profile.paymentBehaviorSnapshot.promiseKeptRate !== undefined ||
    profile.paymentBehaviorSnapshot.wrongContactRate !== undefined ||
    profile.paymentBehaviorSnapshot.parentPayerProbability !== undefined ||
    profile.paymentBehaviorSnapshot.avgDaysToPay !== undefined ||
    profile.paymentBehaviorSnapshot.avgDaysLate !== undefined ||
    profile.paymentBehaviorSnapshot.resendBeforePayRate !== undefined
      ? {
          avgDaysToPay: profile.paymentBehaviorSnapshot.avgDaysToPay,
          avgDaysLate: profile.paymentBehaviorSnapshot.avgDaysLate,
          resendBeforePayRate: profile.paymentBehaviorSnapshot.resendBeforePayRate,
          promiseKeptRate: profile.paymentBehaviorSnapshot.promiseKeptRate,
          wrongContactRate: profile.paymentBehaviorSnapshot.wrongContactRate,
          parentPayerProbability: profile.paymentBehaviorSnapshot.parentPayerProbability,
          ...(profile.paymentBehaviorSnapshot.remittanceQuality
            ? {
                remittanceQualityLabel: profile.paymentBehaviorSnapshot.remittanceQuality.label,
                remittanceQualityReasonSummary:
                  profile.paymentBehaviorSnapshot.remittanceQuality.reasonSummary,
              }
            : {}),
        }
      : {}),
    ...(row.accountMetricsByChannel ? { accountMetricsByChannel: row.accountMetricsByChannel } : {}),
    ...(row.accountEvidenceSummary ? { accountEvidenceSummary: row.accountEvidenceSummary } : {}),
    ...(row.accountExplanation ? { accountExplanation: row.accountExplanation } : {}),
    ...(row.contactPreferredChannel ? { contactPreferredChannel: row.contactPreferredChannel } : {}),
    ...(row.contactEvidenceSummary ? { contactEvidenceSummary: row.contactEvidenceSummary } : {}),
    ...(row.contactExplanation ? { contactExplanation: row.contactExplanation } : {}),
    ...(row.verificationSnapshot ? { verificationSnapshot: row.verificationSnapshot } : {}),
    ...(profile.nextBestAction
      ? {
          recommendedAction: profile.nextBestAction.action,
          ...(profile.nextBestAction.channel
            ? { recommendedChannel: profile.nextBestAction.channel }
            : {}),
          ...(profile.nextBestAction.score !== undefined
            ? { score: profile.nextBestAction.score }
            : {}),
          recommendedReasonSummary: profile.nextBestAction.reasonSummary,
        }
      : {}),
    };
  } catch {
    return undefined;
  }
}

export function loadPersistedCustomerProfile(
  input: LoadPersistedCustomerProfileInput,
  executor: LearningSummaryQueryExecutor = queryJsonRows,
): CustomerProfileReadModel | undefined {
  if (!input.billingAccountId && !input.accountNumber) {
    return undefined;
  }

  try {
    const [row] = executor(input.databaseUrl, buildPersistedCustomerProfileQuery(input));
    return row ? toCustomerProfileReadModel(row as PersistedCustomerProfileRow) : undefined;
  } catch {
    return undefined;
  }
}

export function buildPersistedLearningSummaryQuery(
  input: LoadPersistedLearningSummaryInput,
): string {
  return buildPersistedCustomerProfileQuery(input);
}

export function buildPersistedCustomerProfileQuery(
  input: LoadPersistedCustomerProfileInput,
): string {
  const accountPredicates = [
    input.billingAccountId
      ? `billing_account.id = '${quoteLiteral(input.billingAccountId)}'::uuid`
      : undefined,
    input.accountNumber
      ? `billing_account.account_number = '${quoteLiteral(input.accountNumber)}'`
      : undefined,
  ].filter((predicate): predicate is string => Boolean(predicate));

  return `
    SELECT row_to_json(q)
    FROM (
      SELECT
        billing_account.id::text AS "billingAccountId",
        billing_account.account_number AS "accountNumber",
        billing_account.display_name AS "accountName",
        parent_account.id::text AS "parentAccountId",
        parent_account.name AS "parentAccountName",
        account_profile.preferred_channel AS "accountPreferredChannel",
        account_profile.fallback_channel AS "accountFallbackChannel",
        account_profile.metrics_by_channel AS "accountMetricsByChannel",
        account_profile.evidence_summary AS "accountEvidenceSummary",
        account_profile.explanation AS "accountExplanation",
        preferred_contact.contact_id AS "preferredContactId",
        preferred_contact.full_name AS "preferredContactName",
        preferred_contact.email AS "preferredContactEmail",
        preferred_contact.phone AS "preferredContactPhone",
        preferred_contact.is_verified AS "preferredContactVerified",
        preferred_contact.profile_preferred_channel AS "contactPreferredChannel",
        preferred_contact.profile_explanation AS "contactExplanation",
        preferred_contact.profile_evidence_summary AS "contactEvidenceSummary",
        preferred_contact.verification_snapshot AS "verificationSnapshot",
        next_action.recommended_action AS "recommendedAction",
        next_action.recommended_channel AS "recommendedChannel",
        next_action.score,
        next_action.recommended_reason_summary AS "recommendedReasonSummary",
        next_action.candidate_scores AS "candidateScores",
        payment_stats.avg_days_to_pay AS "avgDaysToPay",
        payment_stats.avg_days_late AS "avgDaysLate",
        event_stats.grouped_reminder_attempts AS "groupedReminderAttempts",
        event_stats.grouped_reminder_payments AS "groupedReminderPayments",
        event_stats.resend_attempts AS "resendAttempts",
        event_stats.resend_payments AS "resendPayments",
        remittance_stats.remittance_total_count AS "remittanceTotalCount",
        remittance_stats.remittance_structured_count AS "remittanceStructuredCount",
        remittance_stats.remittance_linked_count AS "remittanceLinkedCount",
        promise_stats.promise_observed_count AS "promiseObservedCount",
        promise_stats.promise_kept_count AS "promiseKeptCount",
        communication_stats.communication_attempt_count AS "communicationAttemptCount",
        communication_stats.wrong_contact_count AS "wrongContactCount",
        parent_payer_stats.parent_payer_observations AS "parentPayerObservations",
        parent_payer_stats.parent_payer_signals AS "parentPayerSignals"
      FROM billing_account
      JOIN parent_account
        ON parent_account.id = billing_account.parent_account_id
       AND parent_account.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT *
        FROM account_behavior_profile
        WHERE tenant_id = '${quoteLiteral(input.tenantId)}'
          AND billing_account_id = billing_account.id
          AND deleted_at IS NULL
        ORDER BY last_computed_at DESC
        LIMIT 1
      ) account_profile ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          contact.id::text AS contact_id,
          contact.full_name,
          contact.email,
          contact.phone,
          contact.is_verified,
          profile.preferred_channel AS profile_preferred_channel,
          profile.explanation AS profile_explanation,
          profile.evidence_summary AS profile_evidence_summary,
          profile.verification_snapshot
        FROM contact
        LEFT JOIN LATERAL (
          SELECT *
          FROM contact_behavior_profile
          WHERE tenant_id = '${quoteLiteral(input.tenantId)}'
            AND contact_id = contact.id
            AND deleted_at IS NULL
          ORDER BY last_computed_at DESC
          LIMIT 1
        ) profile ON TRUE
        WHERE contact.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND contact.billing_account_id = billing_account.id
          AND contact.deleted_at IS NULL
          ${
            input.contactEmail
              ? `AND COALESCE(contact.email, '') = '${quoteLiteral(input.contactEmail)}'`
              : ""
          }
        ORDER BY
          contact.allow_auto_send DESC,
          contact.is_verified DESC,
          contact.recent_successful_responses DESC,
          contact.is_primary DESC,
          contact.updated_at DESC
        LIMIT 1
      ) preferred_contact ON TRUE
      LEFT JOIN LATERAL (
        SELECT *
        FROM next_best_action_score
        WHERE tenant_id = '${quoteLiteral(input.tenantId)}'
          AND billing_account_id = billing_account.id
          AND domain = 'collections'
          AND deleted_at IS NULL
        ORDER BY scored_at DESC
        LIMIT 1
      ) next_action ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ROUND(
            AVG(
              EXTRACT(
                EPOCH FROM (
                  last_payment.received_at
                  - COALESCE(invoice.invoice_date::timestamp, invoice.created_at)
                )
              ) / 86400.0
            )::numeric,
            2
          ) AS avg_days_to_pay,
          ROUND(
            AVG(
              GREATEST(
                (last_payment.received_at::date - invoice.due_date)::numeric,
                0
              )
            )::numeric,
            2
          ) FILTER (
            WHERE invoice.due_date IS NOT NULL
          ) AS avg_days_late
        FROM invoice
        LEFT JOIN LATERAL (
          SELECT MAX(payment.received_at) AS received_at
          FROM payment_application
          JOIN payment
            ON payment.id = payment_application.payment_id
           AND payment.deleted_at IS NULL
          WHERE payment_application.tenant_id = '${quoteLiteral(input.tenantId)}'
            AND payment_application.invoice_id = invoice.id
            AND payment_application.deleted_at IS NULL
            AND payment_application.state = 'applied'
        ) last_payment ON TRUE
        WHERE invoice.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND invoice.billing_account_id = billing_account.id
          AND invoice.deleted_at IS NULL
          AND last_payment.received_at IS NOT NULL
      ) payment_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE history.deleted_at IS NULL
              AND history.channel = 'email'
              AND history.intent_type = 'reminder'
              AND COALESCE((history.payload ->> 'grouped')::boolean, false)
          ) AS grouped_reminder_attempts,
          COUNT(*) FILTER (
            WHERE history.deleted_at IS NULL
              AND history.event_type = 'payment_outcome_after_communication'
              AND COALESCE((history.payload ->> 'paymentReceived')::boolean, false)
              AND COALESCE((history.payload ->> 'grouped')::boolean, false)
          ) AS grouped_reminder_payments,
          COUNT(*) FILTER (
            WHERE history.deleted_at IS NULL
              AND (
                history.event_type = 'invoice_bundle_resent'
                OR history.intent_type = 'resend_documents'
              )
          ) AS resend_attempts,
          COUNT(*) FILTER (
            WHERE history.deleted_at IS NULL
              AND history.event_type = 'payment_outcome_after_communication'
              AND COALESCE((history.payload ->> 'paymentReceived')::boolean, false)
              AND COALESCE(
                (history.payload ->> 'afterResend')::boolean,
                (history.payload ->> 'resendTriggered')::boolean,
                false
              )
          ) AS resend_payments
        FROM learning_event history
        WHERE history.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND history.billing_account_id = billing_account.id
      ) event_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS remittance_total_count,
          COUNT(*) FILTER (
            WHERE remittance.state IN (
              'parsed_structured',
              'linked_to_payment',
              'linked_to_invoice_candidate',
              'resolved'
            )
          ) AS remittance_structured_count,
          COUNT(*) FILTER (
            WHERE remittance.state IN ('linked_to_payment', 'resolved')
              OR remittance_processing_record.linked_payment_id IS NOT NULL
          ) AS remittance_linked_count
        FROM remittance
        LEFT JOIN remittance_processing_record
          ON remittance_processing_record.remittance_id = remittance.id
        LEFT JOIN payment
          ON payment.id = remittance.payment_id
        WHERE remittance.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND remittance.deleted_at IS NULL
          AND (
            payment.billing_account_id = billing_account.id
            OR EXISTS (
              SELECT 1
              FROM learning_event
              WHERE learning_event.tenant_id = '${quoteLiteral(input.tenantId)}'
                AND learning_event.remittance_id = remittance.id
                AND learning_event.billing_account_id = billing_account.id
                AND learning_event.deleted_at IS NULL
            )
          )
      ) remittance_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE promise_to_pay.state IN ('kept', 'broken')) AS promise_observed_count,
          COUNT(*) FILTER (WHERE promise_to_pay.state = 'kept') AS promise_kept_count
        FROM promise_to_pay
        WHERE promise_to_pay.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND promise_to_pay.billing_account_id = billing_account.id
          AND promise_to_pay.deleted_at IS NULL
      ) promise_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE history.channel IS NOT NULL
              AND history.deleted_at IS NULL
          ) AS communication_attempt_count,
          COUNT(*) FILTER (
            WHERE history.deleted_at IS NULL
              AND (
                history.event_type = 'call_wrong_contact'
                OR COALESCE((history.payload ->> 'wrongContact')::boolean, false)
              )
          ) AS wrong_contact_count
        FROM learning_event history
        WHERE history.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND history.billing_account_id = billing_account.id
      ) communication_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE payment_application.deleted_at IS NULL
          ) AS parent_payer_observations,
          COUNT(*) FILTER (
            WHERE payment.billing_account_id IS NOT NULL
              AND payment.billing_account_id <> invoice.billing_account_id
              AND payment.parent_account_id = invoice.parent_account_id
          ) AS parent_payer_signals
        FROM payment_application
        JOIN invoice
          ON invoice.id = payment_application.invoice_id
         AND invoice.deleted_at IS NULL
        JOIN payment
          ON payment.id = payment_application.payment_id
         AND payment.deleted_at IS NULL
        WHERE payment_application.tenant_id = '${quoteLiteral(input.tenantId)}'
          AND payment_application.billing_account_id = billing_account.id
          AND payment_application.deleted_at IS NULL
      ) parent_payer_stats ON TRUE
      WHERE billing_account.tenant_id = '${quoteLiteral(input.tenantId)}'
        AND billing_account.deleted_at IS NULL
        AND (${accountPredicates.join(" OR ")})
      LIMIT 1
    ) q;
  `;
}

function toCustomerProfileReadModel(row: PersistedCustomerProfileRow): CustomerProfileReadModel {
  const preferredChannel =
    row.contactPreferredChannel ?? row.accountPreferredChannel ?? row.recommendedChannel;
  const preferredContactReason =
    row.contactExplanation?.[0]?.summary ??
    (row.preferredContactVerified
      ? "Preferred contact is the strongest verified contact with recent successful responses."
      : "Preferred contact falls back to the best available billing-account contact.");

  return buildCustomerProfileReadModel({
    billingAccountId: row.billingAccountId,
    ...(row.accountNumber ? { accountNumber: row.accountNumber } : {}),
    ...(row.accountName ? { accountName: row.accountName } : {}),
    ...(row.parentAccountId ? { parentAccountId: row.parentAccountId } : {}),
    ...(row.parentAccountName ? { parentAccountName: row.parentAccountName } : {}),
    generatedAt: new Date().toISOString(),
    ...(preferredChannel ? { preferredChannel } : {}),
    ...(row.accountFallbackChannel ? { fallbackChannel: row.accountFallbackChannel } : {}),
    preferredContact: {
      contactName: row.preferredContactName ?? "Stored collections contact",
      reasonSummary: preferredContactReason,
      ...(row.preferredContactId ? { contactId: row.preferredContactId } : {}),
      ...(row.preferredContactEmail ? { contactEmail: row.preferredContactEmail } : {}),
      ...(row.preferredContactPhone ? { contactPhone: row.preferredContactPhone } : {}),
      ...(row.contactPreferredChannel ? { preferredChannel: row.contactPreferredChannel } : {}),
    },
    ...(row.recommendedAction
      ? {
          nextBestAction: {
            action: row.recommendedAction,
            reasonSummary:
              row.recommendedReasonSummary ??
              "Stored next-best-action guidance is available for this account.",
            ...(row.recommendedChannel ? { channel: row.recommendedChannel } : {}),
            ...(typeof row.score === "number" ? { score: row.score } : {}),
          },
        }
      : {}),
    ...(row.avgDaysToPay !== undefined ? { avgDaysToPay: row.avgDaysToPay } : {}),
    ...(row.avgDaysLate !== undefined ? { avgDaysLate: row.avgDaysLate } : {}),
    groupedReminderAttempts: row.groupedReminderAttempts ?? 0,
    groupedReminderPayments: row.groupedReminderPayments ?? 0,
    resendAttempts: row.resendAttempts ?? 0,
    resendPayments: row.resendPayments ?? 0,
    remittanceTotalCount: row.remittanceTotalCount ?? 0,
    remittanceStructuredCount: row.remittanceStructuredCount ?? 0,
    remittanceLinkedCount: row.remittanceLinkedCount ?? 0,
    promiseObservedCount: row.promiseObservedCount ?? 0,
    promiseKeptCount: row.promiseKeptCount ?? 0,
    communicationAttemptCount: row.communicationAttemptCount ?? 0,
    wrongContactCount: row.wrongContactCount ?? 0,
    parentPayerObservations: row.parentPayerObservations ?? 0,
    parentPayerSignals: row.parentPayerSignals ?? 0,
    ...(row.accountExplanation ? { accountExplanation: row.accountExplanation } : {}),
    ...(row.contactExplanation ? { contactExplanation: row.contactExplanation } : {}),
  });
}
