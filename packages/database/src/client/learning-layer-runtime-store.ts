import type {
  AccountBehaviorProfile,
  ContactBehaviorProfile,
  LearningEvent,
  OperatorFeedback,
  OperatorFeedbackTarget,
} from "@o2c/domain";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

export interface LearningLayerHistoryQuery {
  tenantId: string;
  targetType: OperatorFeedbackTarget;
  targetId: string;
  parentAccountId?: string;
  billingAccountId?: string;
  branchId?: string;
  contactId?: string;
}

export interface PersistedLearningLayerHistory {
  events: LearningEvent[];
  feedback: OperatorFeedback[];
}

export interface PersistLearningCaptureInput {
  feedback: OperatorFeedback;
  emittedEvents: LearningEvent[];
  updatedAccountProfile?: AccountBehaviorProfile;
  updatedContactProfile?: ContactBehaviorProfile;
}

type LearningEventRow = Omit<LearningEvent, "invoiceIds" | "explanation" | "payload" | "metadata"> & {
  invoiceIds?: string[];
  explanation?: LearningEvent["explanation"];
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type OperatorFeedbackRow = Omit<
  OperatorFeedback,
  "beforePayload" | "afterPayload" | "metadata"
> & {
  beforePayload?: Record<string, unknown> | null;
  afterPayload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export function buildLearningLayerContextWhereClause(
  input: LearningLayerHistoryQuery,
  tableAlias: string,
): string {
  const predicates: string[] = [];

  if (input.contactId) {
    predicates.push(`${tableAlias}.contact_id = '${quoteLiteral(input.contactId)}'::uuid`);
  }

  if (input.billingAccountId) {
    predicates.push(
      `${tableAlias}.billing_account_id = '${quoteLiteral(input.billingAccountId)}'::uuid`,
    );
  }

  if (input.branchId) {
    predicates.push(`${tableAlias}.branch_id = '${quoteLiteral(input.branchId)}'::uuid`);
  }

  if (input.parentAccountId) {
    predicates.push(
      `${tableAlias}.parent_account_id = '${quoteLiteral(input.parentAccountId)}'::uuid`,
    );
  }

  if (predicates.length === 0) {
    return "TRUE";
  }

  return `(${predicates.join(" OR ")})`;
}

export class PostgresLearningLayerRuntimeStore {
  constructor(private readonly databaseUrl: string) {}

  loadHistory(input: LearningLayerHistoryQuery): PersistedLearningLayerHistory {
    const historyPredicate = buildLearningLayerContextWhereClause(input, "history");
    const eventRows = queryJsonRows<LearningEventRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            history.id::text AS "id",
            history.tenant_id AS "tenantId",
            history.version,
            history.created_at AS "createdAt",
            history.updated_at AS "updatedAt",
            history.created_by_actor_id AS "createdByActorId",
            history.created_by_actor_role AS "createdByActorRole",
            history.updated_by_actor_id AS "updatedByActorId",
            history.updated_by_actor_role AS "updatedByActorRole",
            history.parent_account_id::text AS "parentAccountId",
            history.billing_account_id::text AS "billingAccountId",
            history.branch_id::text AS "branchId",
            history.contact_id::text AS "contactId",
            history.event_type AS "eventType",
            history.source_system AS "sourceSystem",
            history.source_event_id AS "sourceEventId",
            history.occurred_at AS "occurredAt",
            history.channel,
            history.provider,
            history.direction,
            history.intent_type AS "intentType",
            history.communication_status AS "communicationStatus",
            history.related_entity_type AS "relatedEntityType",
            history.related_entity_id AS "relatedEntityId",
            history.invoice_ids AS "invoiceIds",
            history.payment_id::text AS "paymentId",
            history.remittance_id::text AS "remittanceId",
            history.promise_to_pay_id::text AS "promiseToPayId",
            history.exception_id::text AS "exceptionId",
            history.approval_request_id::text AS "approvalRequestId",
            history.explanation,
            history.payload,
            history.reversible,
            history.reversed_at AS "reversedAt",
            history.reversal_reason AS "reversalReason",
            history.metadata
          FROM learning_event history
          WHERE history.tenant_id = '${quoteLiteral(input.tenantId)}'
            AND history.deleted_at IS NULL
            AND ${historyPredicate}
          ORDER BY history.occurred_at ASC
          LIMIT 250
        ) q
      `,
    );

    const feedbackRows = queryJsonRows<OperatorFeedbackRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            feedback.id::text AS "id",
            feedback.tenant_id AS "tenantId",
            feedback.version,
            feedback.created_at AS "createdAt",
            feedback.updated_at AS "updatedAt",
            feedback.created_by_actor_id AS "createdByActorId",
            feedback.created_by_actor_role AS "createdByActorRole",
            feedback.updated_by_actor_id AS "updatedByActorId",
            feedback.updated_by_actor_role AS "updatedByActorRole",
            feedback.feedback_type AS "feedbackType",
            feedback.target_type AS "targetType",
            feedback.target_id AS "targetId",
            feedback.occurred_at AS "occurredAt",
            feedback.parent_account_id::text AS "parentAccountId",
            feedback.billing_account_id::text AS "billingAccountId",
            feedback.branch_id::text AS "branchId",
            feedback.contact_id::text AS "contactId",
            feedback.linked_learning_event_id::text AS "linkedLearningEventId",
            feedback.linked_next_best_action_score_id::text AS "linkedNextBestActionScoreId",
            feedback.reason_code AS "reasonCode",
            feedback.comment,
            feedback.before_payload AS "beforePayload",
            feedback.after_payload AS "afterPayload",
            feedback.applies_to_future_scoring AS "appliesToFutureScoring",
            feedback.preserves_safety_rules AS "preservesSafetyRules",
            feedback.metadata
          FROM operator_feedback feedback
          WHERE feedback.tenant_id = '${quoteLiteral(input.tenantId)}'
            AND feedback.deleted_at IS NULL
            AND (
              (
                feedback.target_type = '${quoteLiteral(input.targetType)}'
                AND feedback.target_id = '${quoteLiteral(input.targetId)}'
              )
              OR ${buildLearningLayerContextWhereClause(input, "feedback")}
            )
          ORDER BY feedback.occurred_at ASC
          LIMIT 250
        ) q
      `,
    );

    return {
      events: eventRows.map(toLearningEvent),
      feedback: feedbackRows.map(toOperatorFeedback),
    };
  }

  persistCapture(input: PersistLearningCaptureInput): void {
    this.saveFeedback(input.feedback);

    for (const event of input.emittedEvents) {
      this.saveLearningEvent(event);
    }

    if (input.updatedAccountProfile) {
      this.saveAccountBehaviorProfile(input.updatedAccountProfile);
    }

    if (input.updatedContactProfile) {
      this.saveContactBehaviorProfile(input.updatedContactProfile);
    }
  }

  persistLearningEvents(events: LearningEvent[]): void {
    for (const event of events) {
      this.saveLearningEvent(event);
    }
  }

  private saveLearningEvent(event: LearningEvent): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO learning_event (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          parent_account_id,
          billing_account_id,
          branch_id,
          contact_id,
          event_type,
          source_system,
          source_event_id,
          occurred_at,
          channel,
          provider,
          direction,
          intent_type,
          communication_status,
          related_entity_type,
          related_entity_id,
          invoice_ids,
          payment_id,
          remittance_id,
          promise_to_pay_id,
          exception_id,
          approval_request_id,
          explanation,
          payload,
          reversible,
          reversed_at,
          reversal_reason,
          metadata
        )
        VALUES (
          '${quoteLiteral(event.id)}'::uuid,
          '${quoteLiteral(event.tenantId ?? "default")}',
          ${event.version ?? 1},
          '${quoteLiteral(event.createdAt)}'::timestamptz,
          '${quoteLiteral(event.updatedAt)}'::timestamptz,
          ${event.createdByActorId ? `'${quoteLiteral(event.createdByActorId)}'` : "NULL"},
          ${event.createdByActorRole ? `'${quoteLiteral(event.createdByActorRole)}'` : "NULL"},
          ${event.updatedByActorId ? `'${quoteLiteral(event.updatedByActorId)}'` : "NULL"},
          ${event.updatedByActorRole ? `'${quoteLiteral(event.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(event.parentAccountId)}'::uuid,
          ${event.billingAccountId ? `'${quoteLiteral(event.billingAccountId)}'::uuid` : "NULL"},
          ${event.branchId ? `'${quoteLiteral(event.branchId)}'::uuid` : "NULL"},
          ${event.contactId ? `'${quoteLiteral(event.contactId)}'::uuid` : "NULL"},
          '${quoteLiteral(event.eventType)}',
          '${quoteLiteral(event.sourceSystem)}',
          ${event.sourceEventId ? `'${quoteLiteral(event.sourceEventId)}'` : "NULL"},
          '${quoteLiteral(event.occurredAt)}'::timestamptz,
          ${event.channel ? `'${quoteLiteral(event.channel)}'` : "NULL"},
          ${event.provider ? `'${quoteLiteral(event.provider)}'` : "NULL"},
          ${event.direction ? `'${quoteLiteral(event.direction)}'` : "NULL"},
          ${event.intentType ? `'${quoteLiteral(event.intentType)}'` : "NULL"},
          ${event.communicationStatus ? `'${quoteLiteral(event.communicationStatus)}'` : "NULL"},
          ${event.relatedEntityType ? `'${quoteLiteral(event.relatedEntityType)}'` : "NULL"},
          ${event.relatedEntityId ? `'${quoteLiteral(event.relatedEntityId)}'` : "NULL"},
          '${jsonLiteral(event.invoiceIds)}'::jsonb,
          ${event.paymentId ? `'${quoteLiteral(event.paymentId)}'::uuid` : "NULL"},
          ${event.remittanceId ? `'${quoteLiteral(event.remittanceId)}'::uuid` : "NULL"},
          ${event.promiseToPayId ? `'${quoteLiteral(event.promiseToPayId)}'::uuid` : "NULL"},
          ${event.exceptionId ? `'${quoteLiteral(event.exceptionId)}'::uuid` : "NULL"},
          ${event.approvalRequestId ? `'${quoteLiteral(event.approvalRequestId)}'::uuid` : "NULL"},
          '${jsonLiteral(event.explanation)}'::jsonb,
          '${jsonLiteral(event.payload)}'::jsonb,
          ${event.reversible ? "TRUE" : "FALSE"},
          ${event.reversedAt ? `'${quoteLiteral(event.reversedAt)}'::timestamptz` : "NULL"},
          ${event.reversalReason ? `'${quoteLiteral(event.reversalReason)}'` : "NULL"},
          '${jsonLiteral(event.metadata)}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET
          updated_at = EXCLUDED.updated_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          event_type = EXCLUDED.event_type,
          source_system = EXCLUDED.source_system,
          source_event_id = EXCLUDED.source_event_id,
          occurred_at = EXCLUDED.occurred_at,
          channel = EXCLUDED.channel,
          provider = EXCLUDED.provider,
          direction = EXCLUDED.direction,
          intent_type = EXCLUDED.intent_type,
          communication_status = EXCLUDED.communication_status,
          related_entity_type = EXCLUDED.related_entity_type,
          related_entity_id = EXCLUDED.related_entity_id,
          invoice_ids = EXCLUDED.invoice_ids,
          payment_id = EXCLUDED.payment_id,
          remittance_id = EXCLUDED.remittance_id,
          promise_to_pay_id = EXCLUDED.promise_to_pay_id,
          exception_id = EXCLUDED.exception_id,
          approval_request_id = EXCLUDED.approval_request_id,
          explanation = EXCLUDED.explanation,
          payload = EXCLUDED.payload,
          reversible = EXCLUDED.reversible,
          reversed_at = EXCLUDED.reversed_at,
          reversal_reason = EXCLUDED.reversal_reason,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  private saveFeedback(feedback: OperatorFeedback): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO operator_feedback (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          feedback_type,
          target_type,
          target_id,
          occurred_at,
          parent_account_id,
          billing_account_id,
          branch_id,
          contact_id,
          linked_learning_event_id,
          linked_next_best_action_score_id,
          reason_code,
          comment,
          before_payload,
          after_payload,
          applies_to_future_scoring,
          preserves_safety_rules,
          metadata
        )
        VALUES (
          '${quoteLiteral(feedback.id)}'::uuid,
          '${quoteLiteral(feedback.tenantId ?? "default")}',
          ${feedback.version ?? 1},
          '${quoteLiteral(feedback.createdAt)}'::timestamptz,
          '${quoteLiteral(feedback.updatedAt)}'::timestamptz,
          ${feedback.createdByActorId ? `'${quoteLiteral(feedback.createdByActorId)}'` : "NULL"},
          ${feedback.createdByActorRole ? `'${quoteLiteral(feedback.createdByActorRole)}'` : "NULL"},
          ${feedback.updatedByActorId ? `'${quoteLiteral(feedback.updatedByActorId)}'` : "NULL"},
          ${feedback.updatedByActorRole ? `'${quoteLiteral(feedback.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(feedback.feedbackType)}',
          '${quoteLiteral(feedback.targetType)}',
          '${quoteLiteral(feedback.targetId)}',
          '${quoteLiteral(feedback.occurredAt)}'::timestamptz,
          ${feedback.parentAccountId ? `'${quoteLiteral(feedback.parentAccountId)}'::uuid` : "NULL"},
          ${feedback.billingAccountId ? `'${quoteLiteral(feedback.billingAccountId)}'::uuid` : "NULL"},
          ${feedback.branchId ? `'${quoteLiteral(feedback.branchId)}'::uuid` : "NULL"},
          ${feedback.contactId ? `'${quoteLiteral(feedback.contactId)}'::uuid` : "NULL"},
          ${
            feedback.linkedLearningEventId
              ? `'${quoteLiteral(feedback.linkedLearningEventId)}'::uuid`
              : "NULL"
          },
          ${
            feedback.linkedNextBestActionScoreId
              ? `'${quoteLiteral(feedback.linkedNextBestActionScoreId)}'::uuid`
              : "NULL"
          },
          '${quoteLiteral(feedback.reasonCode)}',
          ${feedback.comment ? `'${quoteLiteral(feedback.comment)}'` : "NULL"},
          ${
            feedback.beforePayload
              ? `'${jsonLiteral(feedback.beforePayload)}'::jsonb`
              : "NULL"
          },
          ${
            feedback.afterPayload
              ? `'${jsonLiteral(feedback.afterPayload)}'::jsonb`
              : "NULL"
          },
          ${feedback.appliesToFutureScoring ? "TRUE" : "FALSE"},
          ${feedback.preservesSafetyRules ? "TRUE" : "FALSE"},
          '${jsonLiteral(feedback.metadata)}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET
          updated_at = EXCLUDED.updated_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          feedback_type = EXCLUDED.feedback_type,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          occurred_at = EXCLUDED.occurred_at,
          parent_account_id = EXCLUDED.parent_account_id,
          billing_account_id = EXCLUDED.billing_account_id,
          branch_id = EXCLUDED.branch_id,
          contact_id = EXCLUDED.contact_id,
          linked_learning_event_id = EXCLUDED.linked_learning_event_id,
          linked_next_best_action_score_id = EXCLUDED.linked_next_best_action_score_id,
          reason_code = EXCLUDED.reason_code,
          comment = EXCLUDED.comment,
          before_payload = EXCLUDED.before_payload,
          after_payload = EXCLUDED.after_payload,
          applies_to_future_scoring = EXCLUDED.applies_to_future_scoring,
          preserves_safety_rules = EXCLUDED.preserves_safety_rules,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveAccountBehaviorProfile(profile: AccountBehaviorProfile): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO account_behavior_profile (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          scope,
          scope_id,
          parent_account_id,
          billing_account_id,
          branch_id,
          preferred_channel,
          fallback_channel,
          channel_priority_order,
          best_channel_by_intent,
          metrics_by_channel,
          safety_flags,
          evidence_summary,
          explanation,
          policy_snapshot,
          last_computed_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(profile.id)}'::uuid,
          '${quoteLiteral(profile.tenantId ?? "default")}',
          ${profile.version ?? 1},
          '${quoteLiteral(profile.createdAt)}'::timestamptz,
          '${quoteLiteral(profile.updatedAt)}'::timestamptz,
          ${profile.createdByActorId ? `'${quoteLiteral(profile.createdByActorId)}'` : "NULL"},
          ${profile.createdByActorRole ? `'${quoteLiteral(profile.createdByActorRole)}'` : "NULL"},
          ${profile.updatedByActorId ? `'${quoteLiteral(profile.updatedByActorId)}'` : "NULL"},
          ${profile.updatedByActorRole ? `'${quoteLiteral(profile.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(profile.scope)}',
          '${quoteLiteral(profile.scopeId)}',
          '${quoteLiteral(profile.parentAccountId)}'::uuid,
          ${profile.billingAccountId ? `'${quoteLiteral(profile.billingAccountId)}'::uuid` : "NULL"},
          ${profile.branchId ? `'${quoteLiteral(profile.branchId)}'::uuid` : "NULL"},
          ${profile.preferredChannel ? `'${quoteLiteral(profile.preferredChannel)}'` : "NULL"},
          ${profile.fallbackChannel ? `'${quoteLiteral(profile.fallbackChannel)}'` : "NULL"},
          '${jsonLiteral(profile.channelPriorityOrder)}'::jsonb,
          '${jsonLiteral(profile.bestChannelByIntent)}'::jsonb,
          '${jsonLiteral(profile.metricsByChannel)}'::jsonb,
          '${jsonLiteral(profile.safetyFlags)}'::jsonb,
          '${jsonLiteral(profile.evidenceSummary)}'::jsonb,
          '${jsonLiteral(profile.explanation)}'::jsonb,
          '${jsonLiteral(profile.policySnapshot)}'::jsonb,
          '${quoteLiteral(profile.lastComputedAt)}'::timestamptz,
          '${jsonLiteral(profile.metadata)}'::jsonb
        )
        ON CONFLICT (tenant_id, scope, scope_id) DO UPDATE
        SET
          id = EXCLUDED.id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          created_by_actor_id = EXCLUDED.created_by_actor_id,
          created_by_actor_role = EXCLUDED.created_by_actor_role,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          parent_account_id = EXCLUDED.parent_account_id,
          billing_account_id = EXCLUDED.billing_account_id,
          branch_id = EXCLUDED.branch_id,
          preferred_channel = EXCLUDED.preferred_channel,
          fallback_channel = EXCLUDED.fallback_channel,
          channel_priority_order = EXCLUDED.channel_priority_order,
          best_channel_by_intent = EXCLUDED.best_channel_by_intent,
          metrics_by_channel = EXCLUDED.metrics_by_channel,
          safety_flags = EXCLUDED.safety_flags,
          evidence_summary = EXCLUDED.evidence_summary,
          explanation = EXCLUDED.explanation,
          policy_snapshot = EXCLUDED.policy_snapshot,
          last_computed_at = EXCLUDED.last_computed_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveContactBehaviorProfile(profile: ContactBehaviorProfile): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO contact_behavior_profile (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          contact_id,
          parent_account_id,
          billing_account_id,
          branch_id,
          preferred_channel,
          fallback_channel,
          channel_priority_order,
          best_channel_by_intent,
          metrics_by_channel,
          verification_snapshot,
          evidence_summary,
          explanation,
          policy_snapshot,
          last_computed_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(profile.id)}'::uuid,
          '${quoteLiteral(profile.tenantId ?? "default")}',
          ${profile.version ?? 1},
          '${quoteLiteral(profile.createdAt)}'::timestamptz,
          '${quoteLiteral(profile.updatedAt)}'::timestamptz,
          ${profile.createdByActorId ? `'${quoteLiteral(profile.createdByActorId)}'` : "NULL"},
          ${profile.createdByActorRole ? `'${quoteLiteral(profile.createdByActorRole)}'` : "NULL"},
          ${profile.updatedByActorId ? `'${quoteLiteral(profile.updatedByActorId)}'` : "NULL"},
          ${profile.updatedByActorRole ? `'${quoteLiteral(profile.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(profile.contactId)}'::uuid,
          '${quoteLiteral(profile.parentAccountId)}'::uuid,
          ${profile.billingAccountId ? `'${quoteLiteral(profile.billingAccountId)}'::uuid` : "NULL"},
          ${profile.branchId ? `'${quoteLiteral(profile.branchId)}'::uuid` : "NULL"},
          ${profile.preferredChannel ? `'${quoteLiteral(profile.preferredChannel)}'` : "NULL"},
          ${profile.fallbackChannel ? `'${quoteLiteral(profile.fallbackChannel)}'` : "NULL"},
          '${jsonLiteral(profile.channelPriorityOrder)}'::jsonb,
          '${jsonLiteral(profile.bestChannelByIntent)}'::jsonb,
          '${jsonLiteral(profile.metricsByChannel)}'::jsonb,
          '${jsonLiteral(profile.verificationSnapshot)}'::jsonb,
          '${jsonLiteral(profile.evidenceSummary)}'::jsonb,
          '${jsonLiteral(profile.explanation)}'::jsonb,
          '${jsonLiteral(profile.policySnapshot)}'::jsonb,
          '${quoteLiteral(profile.lastComputedAt)}'::timestamptz,
          '${jsonLiteral(profile.metadata)}'::jsonb
        )
        ON CONFLICT (tenant_id, contact_id) DO UPDATE
        SET
          id = EXCLUDED.id,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          created_by_actor_id = EXCLUDED.created_by_actor_id,
          created_by_actor_role = EXCLUDED.created_by_actor_role,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          parent_account_id = EXCLUDED.parent_account_id,
          billing_account_id = EXCLUDED.billing_account_id,
          branch_id = EXCLUDED.branch_id,
          preferred_channel = EXCLUDED.preferred_channel,
          fallback_channel = EXCLUDED.fallback_channel,
          channel_priority_order = EXCLUDED.channel_priority_order,
          best_channel_by_intent = EXCLUDED.best_channel_by_intent,
          metrics_by_channel = EXCLUDED.metrics_by_channel,
          verification_snapshot = EXCLUDED.verification_snapshot,
          evidence_summary = EXCLUDED.evidence_summary,
          explanation = EXCLUDED.explanation,
          policy_snapshot = EXCLUDED.policy_snapshot,
          last_computed_at = EXCLUDED.last_computed_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }
}

function toLearningEvent(row: LearningEventRow): LearningEvent {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    parentAccountId: row.parentAccountId,
    ...(row.version !== undefined ? { version: row.version } : {}),
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.contactId ? { contactId: row.contactId } : {}),
    eventType: row.eventType,
    sourceSystem: row.sourceSystem,
    ...(row.sourceEventId ? { sourceEventId: row.sourceEventId } : {}),
    occurredAt: row.occurredAt,
    ...(row.channel ? { channel: row.channel } : {}),
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.direction ? { direction: row.direction } : {}),
    ...(row.intentType ? { intentType: row.intentType } : {}),
    ...(row.communicationStatus ? { communicationStatus: row.communicationStatus } : {}),
    ...(row.relatedEntityType ? { relatedEntityType: row.relatedEntityType } : {}),
    ...(row.relatedEntityId ? { relatedEntityId: row.relatedEntityId } : {}),
    invoiceIds: row.invoiceIds ?? [],
    ...(row.paymentId ? { paymentId: row.paymentId } : {}),
    ...(row.remittanceId ? { remittanceId: row.remittanceId } : {}),
    ...(row.promiseToPayId ? { promiseToPayId: row.promiseToPayId } : {}),
    ...(row.exceptionId ? { exceptionId: row.exceptionId } : {}),
    ...(row.approvalRequestId ? { approvalRequestId: row.approvalRequestId } : {}),
    explanation: row.explanation ?? [],
    payload: row.payload ?? {},
    reversible: row.reversible,
    ...(row.reversedAt ? { reversedAt: row.reversedAt } : {}),
    ...(row.reversalReason ? { reversalReason: row.reversalReason } : {}),
    metadata: row.metadata ?? {},
  };
}

function toOperatorFeedback(row: OperatorFeedbackRow): OperatorFeedback {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    feedbackType: row.feedbackType,
    targetType: row.targetType,
    targetId: row.targetId,
    occurredAt: row.occurredAt,
    ...(row.version !== undefined ? { version: row.version } : {}),
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole } : {}),
    ...(row.parentAccountId ? { parentAccountId: row.parentAccountId } : {}),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.contactId ? { contactId: row.contactId } : {}),
    ...(row.linkedLearningEventId ? { linkedLearningEventId: row.linkedLearningEventId } : {}),
    ...(row.linkedNextBestActionScoreId
      ? { linkedNextBestActionScoreId: row.linkedNextBestActionScoreId }
      : {}),
    reasonCode: row.reasonCode,
    ...(row.comment ? { comment: row.comment } : {}),
    ...(row.beforePayload ? { beforePayload: row.beforePayload } : {}),
    ...(row.afterPayload ? { afterPayload: row.afterPayload } : {}),
    appliesToFutureScoring: row.appliesToFutureScoring,
    preservesSafetyRules: row.preservesSafetyRules,
    metadata: row.metadata ?? {},
  };
}
