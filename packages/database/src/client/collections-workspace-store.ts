import type {
  CallSession,
  CommunicationMessage,
  CommunicationThread,
  ContactDeliveryStatus,
  OutreachDraft,
} from "@o2c/domain";
import {
  executeSqlCommand,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "./postgres.js";

type ThreadRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  channel: CommunicationThread["channel"];
  parentAccountId: string;
  billingAccountId: string;
  branchIds?: string[];
  contactId?: string;
  senderIdentityId?: string;
  status: CommunicationThread["status"];
  inboxState: CommunicationThread["inboxState"];
  subjectLine?: string;
  participantAddresses?: string[];
  invoiceIds?: string[];
  promiseToPayIds?: string[];
  latestMessageId?: string;
  latestMessageAt?: string;
  unreadCount: number;
  providerThreadId?: string;
  providerConversationId?: string;
  metadata?: Record<string, unknown>;
};

type MessageRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  threadId: string;
  channel: CommunicationMessage["channel"];
  kind: CommunicationMessage["kind"];
  status: CommunicationMessage["status"];
  direction: CommunicationMessage["direction"];
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  contactId?: string;
  senderIdentityId?: string;
  subjectLine?: string;
  bodyPreview: string;
  bodyText?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  providerConversationId?: string;
  inReplyToProviderMessageId?: string;
  fromAddress?: string;
  toAddress?: string;
  occurredAt: string;
  replyAnalysis?: CommunicationMessage["replyAnalysis"];
  metadata?: Record<string, unknown>;
};

type CallSessionRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  threadId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  contactId?: string;
  senderIdentityId?: string;
  provider: CallSession["provider"];
  providerCallId?: string;
  direction: CallSession["direction"];
  disposition: CallSession["disposition"];
  answered: boolean;
  startedAt: string;
  endedAt?: string;
  transcriptSummary?: string;
  transcriptSegments?: CallSession["transcriptSegments"];
  sentimentLabel?: CallSession["sentimentLabel"];
  operatorReviewRequired: boolean;
  promiseToPayId?: string;
  metadata?: Record<string, unknown>;
};

type DraftRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  channel: OutreachDraft["channel"];
  threadId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchIds?: string[];
  contactId?: string;
  senderIdentityId?: string;
  invoiceIds?: string[];
  status: OutreachDraft["status"];
  subjectLine?: string;
  bodyPreview: string;
  bodyText?: string;
  approvalRequestId?: string;
  replyToMessageId?: string;
  emailFirstProductionBehavior: boolean;
  metadata?: Record<string, unknown>;
};

type DeliveryStatusRow = {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  channel: ContactDeliveryStatus["channel"];
  destination: string;
  state: ContactDeliveryStatus["state"];
  lastAttemptAt?: string;
  lastDeliveredAt?: string;
  lastBouncedAt?: string;
  lastBounceReason?: string;
  relatedMessageId?: string;
  metadata?: Record<string, unknown>;
};

export class PostgresCollectionsWorkspaceStore {
  private readonly databaseUrl: string;
  private readonly tenantId: string;

  constructor(databaseUrl: string, tenantId = "default") {
    this.databaseUrl = databaseUrl;
    this.tenantId = tenantId;
  }

  saveThread(thread: CommunicationThread): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO communication_thread (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          channel, parent_account_id, billing_account_id, branch_ids, contact_id, sender_identity_id,
          status, inbox_state, subject_line, participant_addresses, invoice_ids, promise_to_pay_ids,
          latest_message_id, latest_message_at, unread_count, provider_thread_id, provider_conversation_id, metadata
        )
        VALUES (
          '${quoteLiteral(thread.id)}'::uuid,
          '${quoteLiteral(thread.tenantId ?? this.tenantId)}',
          ${thread.version ?? 1},
          '${quoteLiteral(thread.createdAt)}'::timestamptz,
          '${quoteLiteral(thread.updatedAt)}'::timestamptz,
          ${thread.deletedAt ? `'${quoteLiteral(thread.deletedAt)}'::timestamptz` : "NULL"},
          ${thread.createdByActorId ? `'${quoteLiteral(thread.createdByActorId)}'` : "NULL"},
          ${thread.createdByActorRole ? `'${quoteLiteral(thread.createdByActorRole)}'` : "NULL"},
          ${thread.updatedByActorId ? `'${quoteLiteral(thread.updatedByActorId)}'` : "NULL"},
          ${thread.updatedByActorRole ? `'${quoteLiteral(thread.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(thread.channel)}',
          '${quoteLiteral(thread.parentAccountId)}'::uuid,
          '${quoteLiteral(thread.billingAccountId)}'::uuid,
          '${jsonLiteral(thread.branchIds)}'::jsonb,
          ${thread.contactId ? `'${quoteLiteral(thread.contactId)}'::uuid` : "NULL"},
          ${thread.senderIdentityHook?.senderIdentityId ? `'${quoteLiteral(thread.senderIdentityHook.senderIdentityId)}'::uuid` : "NULL"},
          '${quoteLiteral(thread.status)}',
          '${quoteLiteral(thread.inboxState)}',
          ${thread.subjectLine ? `'${quoteLiteral(thread.subjectLine)}'` : "NULL"},
          '${jsonLiteral(thread.participantAddresses)}'::jsonb,
          '${jsonLiteral(thread.invoiceIds)}'::jsonb,
          '${jsonLiteral(thread.promiseToPayIds)}'::jsonb,
          ${thread.latestMessageId ? `'${quoteLiteral(thread.latestMessageId)}'::uuid` : "NULL"},
          ${thread.latestMessageAt ? `'${quoteLiteral(thread.latestMessageAt)}'::timestamptz` : "NULL"},
          ${thread.unreadCount},
          ${thread.providerThreadId ? `'${quoteLiteral(thread.providerThreadId)}'` : "NULL"},
          ${thread.providerConversationId ? `'${quoteLiteral(thread.providerConversationId)}'` : "NULL"},
          '${jsonLiteral(thread.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          branch_ids = EXCLUDED.branch_ids,
          contact_id = EXCLUDED.contact_id,
          sender_identity_id = EXCLUDED.sender_identity_id,
          status = EXCLUDED.status,
          inbox_state = EXCLUDED.inbox_state,
          subject_line = EXCLUDED.subject_line,
          participant_addresses = EXCLUDED.participant_addresses,
          invoice_ids = EXCLUDED.invoice_ids,
          promise_to_pay_ids = EXCLUDED.promise_to_pay_ids,
          latest_message_id = EXCLUDED.latest_message_id,
          latest_message_at = EXCLUDED.latest_message_at,
          unread_count = EXCLUDED.unread_count,
          provider_thread_id = EXCLUDED.provider_thread_id,
          provider_conversation_id = EXCLUDED.provider_conversation_id,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveMessage(message: CommunicationMessage): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO communication_message (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          thread_id, channel, kind, status, direction, parent_account_id, billing_account_id, branch_id, contact_id,
          sender_identity_id, subject_line, body_preview, body_text, provider_message_id, provider_thread_id,
          provider_conversation_id, in_reply_to_provider_message_id, from_address, to_address, occurred_at, reply_analysis, metadata
        )
        VALUES (
          '${quoteLiteral(message.id)}'::uuid,
          '${quoteLiteral(message.tenantId ?? this.tenantId)}',
          ${message.version ?? 1},
          '${quoteLiteral(message.createdAt)}'::timestamptz,
          '${quoteLiteral(message.updatedAt)}'::timestamptz,
          ${message.deletedAt ? `'${quoteLiteral(message.deletedAt)}'::timestamptz` : "NULL"},
          ${message.createdByActorId ? `'${quoteLiteral(message.createdByActorId)}'` : "NULL"},
          ${message.createdByActorRole ? `'${quoteLiteral(message.createdByActorRole)}'` : "NULL"},
          ${message.updatedByActorId ? `'${quoteLiteral(message.updatedByActorId)}'` : "NULL"},
          ${message.updatedByActorRole ? `'${quoteLiteral(message.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(message.threadId)}'::uuid,
          '${quoteLiteral(message.channel)}',
          '${quoteLiteral(message.kind)}',
          '${quoteLiteral(message.status)}',
          '${quoteLiteral(message.direction)}',
          '${quoteLiteral(message.parentAccountId)}'::uuid,
          '${quoteLiteral(message.billingAccountId)}'::uuid,
          ${message.branchId ? `'${quoteLiteral(message.branchId)}'::uuid` : "NULL"},
          ${message.contactId ? `'${quoteLiteral(message.contactId)}'::uuid` : "NULL"},
          ${message.senderIdentityHook?.senderIdentityId ? `'${quoteLiteral(message.senderIdentityHook.senderIdentityId)}'::uuid` : "NULL"},
          ${message.subjectLine ? `'${quoteLiteral(message.subjectLine)}'` : "NULL"},
          '${quoteLiteral(message.bodyPreview)}',
          ${message.bodyText ? `'${quoteLiteral(message.bodyText)}'` : "NULL"},
          ${message.providerMessageId ? `'${quoteLiteral(message.providerMessageId)}'` : "NULL"},
          ${message.providerThreadId ? `'${quoteLiteral(message.providerThreadId)}'` : "NULL"},
          ${message.providerConversationId ? `'${quoteLiteral(message.providerConversationId)}'` : "NULL"},
          ${message.inReplyToProviderMessageId ? `'${quoteLiteral(message.inReplyToProviderMessageId)}'` : "NULL"},
          ${message.fromAddress ? `'${quoteLiteral(message.fromAddress)}'` : "NULL"},
          ${message.toAddress ? `'${quoteLiteral(message.toAddress)}'` : "NULL"},
          '${quoteLiteral(message.occurredAt)}'::timestamptz,
          ${message.replyAnalysis ? `'${jsonLiteral(message.replyAnalysis)}'::jsonb` : "NULL"},
          '${jsonLiteral(message.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          status = EXCLUDED.status,
          body_preview = EXCLUDED.body_preview,
          body_text = EXCLUDED.body_text,
          reply_analysis = EXCLUDED.reply_analysis,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveCallSession(callSession: CallSession): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO call_session (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          thread_id, parent_account_id, billing_account_id, branch_id, contact_id, sender_identity_id,
          provider, provider_call_id, direction, disposition, answered, started_at, ended_at, transcript_summary,
          transcript_segments, sentiment_label, operator_review_required, promise_to_pay_id, metadata
        )
        VALUES (
          '${quoteLiteral(callSession.id)}'::uuid,
          '${quoteLiteral(callSession.tenantId ?? this.tenantId)}',
          ${callSession.version ?? 1},
          '${quoteLiteral(callSession.createdAt)}'::timestamptz,
          '${quoteLiteral(callSession.updatedAt)}'::timestamptz,
          ${callSession.deletedAt ? `'${quoteLiteral(callSession.deletedAt)}'::timestamptz` : "NULL"},
          ${callSession.createdByActorId ? `'${quoteLiteral(callSession.createdByActorId)}'` : "NULL"},
          ${callSession.createdByActorRole ? `'${quoteLiteral(callSession.createdByActorRole)}'` : "NULL"},
          ${callSession.updatedByActorId ? `'${quoteLiteral(callSession.updatedByActorId)}'` : "NULL"},
          ${callSession.updatedByActorRole ? `'${quoteLiteral(callSession.updatedByActorRole)}'` : "NULL"},
          ${callSession.threadId ? `'${quoteLiteral(callSession.threadId)}'::uuid` : "NULL"},
          '${quoteLiteral(callSession.parentAccountId)}'::uuid,
          '${quoteLiteral(callSession.billingAccountId)}'::uuid,
          ${callSession.branchId ? `'${quoteLiteral(callSession.branchId)}'::uuid` : "NULL"},
          ${callSession.contactId ? `'${quoteLiteral(callSession.contactId)}'::uuid` : "NULL"},
          ${callSession.senderIdentityHook?.senderIdentityId ? `'${quoteLiteral(callSession.senderIdentityHook.senderIdentityId)}'::uuid` : "NULL"},
          '${quoteLiteral(callSession.provider)}',
          ${callSession.providerCallId ? `'${quoteLiteral(callSession.providerCallId)}'` : "NULL"},
          '${quoteLiteral(callSession.direction)}',
          '${quoteLiteral(callSession.disposition)}',
          ${callSession.answered ? "TRUE" : "FALSE"},
          '${quoteLiteral(callSession.startedAt)}'::timestamptz,
          ${callSession.endedAt ? `'${quoteLiteral(callSession.endedAt)}'::timestamptz` : "NULL"},
          ${callSession.transcriptSummary ? `'${quoteLiteral(callSession.transcriptSummary)}'` : "NULL"},
          '${jsonLiteral(callSession.transcriptSegments)}'::jsonb,
          ${callSession.sentimentLabel ? `'${quoteLiteral(callSession.sentimentLabel)}'` : "NULL"},
          ${callSession.operatorReviewRequired ? "TRUE" : "FALSE"},
          ${callSession.promiseToPayId ? `'${quoteLiteral(callSession.promiseToPayId)}'::uuid` : "NULL"},
          '${jsonLiteral(callSession.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          disposition = EXCLUDED.disposition,
          answered = EXCLUDED.answered,
          ended_at = EXCLUDED.ended_at,
          transcript_summary = EXCLUDED.transcript_summary,
          transcript_segments = EXCLUDED.transcript_segments,
          sentiment_label = EXCLUDED.sentiment_label,
          operator_review_required = EXCLUDED.operator_review_required,
          promise_to_pay_id = EXCLUDED.promise_to_pay_id,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveOutreachDraft(draft: OutreachDraft): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO outreach_draft (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          channel, thread_id, parent_account_id, billing_account_id, branch_ids, contact_id,
          sender_identity_id, invoice_ids, status, subject_line, body_preview, body_text,
          approval_request_id, reply_to_message_id, email_first_production_behavior, metadata
        )
        VALUES (
          '${quoteLiteral(draft.id)}'::uuid,
          '${quoteLiteral(draft.tenantId ?? this.tenantId)}',
          ${draft.version ?? 1},
          '${quoteLiteral(draft.createdAt)}'::timestamptz,
          '${quoteLiteral(draft.updatedAt)}'::timestamptz,
          ${draft.deletedAt ? `'${quoteLiteral(draft.deletedAt)}'::timestamptz` : "NULL"},
          ${draft.createdByActorId ? `'${quoteLiteral(draft.createdByActorId)}'` : "NULL"},
          ${draft.createdByActorRole ? `'${quoteLiteral(draft.createdByActorRole)}'` : "NULL"},
          ${draft.updatedByActorId ? `'${quoteLiteral(draft.updatedByActorId)}'` : "NULL"},
          ${draft.updatedByActorRole ? `'${quoteLiteral(draft.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(draft.channel)}',
          ${draft.threadId ? `'${quoteLiteral(draft.threadId)}'::uuid` : "NULL"},
          '${quoteLiteral(draft.parentAccountId)}'::uuid,
          '${quoteLiteral(draft.billingAccountId)}'::uuid,
          '${jsonLiteral(draft.branchIds)}'::jsonb,
          ${draft.contactId ? `'${quoteLiteral(draft.contactId)}'::uuid` : "NULL"},
          ${draft.senderIdentityHook?.senderIdentityId ? `'${quoteLiteral(draft.senderIdentityHook.senderIdentityId)}'::uuid` : "NULL"},
          '${jsonLiteral(draft.invoiceIds)}'::jsonb,
          '${quoteLiteral(draft.status)}',
          ${draft.subjectLine ? `'${quoteLiteral(draft.subjectLine)}'` : "NULL"},
          '${quoteLiteral(draft.bodyPreview)}',
          ${draft.bodyText ? `'${quoteLiteral(draft.bodyText)}'` : "NULL"},
          ${draft.approvalRequestId ? `'${quoteLiteral(draft.approvalRequestId)}'::uuid` : "NULL"},
          ${draft.replyToMessageId ? `'${quoteLiteral(draft.replyToMessageId)}'::uuid` : "NULL"},
          ${draft.emailFirstProductionBehavior ? "TRUE" : "FALSE"},
          '${jsonLiteral(draft.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          status = EXCLUDED.status,
          subject_line = EXCLUDED.subject_line,
          body_preview = EXCLUDED.body_preview,
          body_text = EXCLUDED.body_text,
          approval_request_id = EXCLUDED.approval_request_id,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  saveContactDeliveryStatus(status: ContactDeliveryStatus): void {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO contact_delivery_status (
          id, tenant_id, version, created_at, updated_at, deleted_at,
          created_by_actor_id, created_by_actor_role, updated_by_actor_id, updated_by_actor_role,
          parent_account_id, billing_account_id, contact_id, channel, destination, state,
          last_attempt_at, last_delivered_at, last_bounced_at, last_bounce_reason, related_message_id, metadata
        )
        VALUES (
          '${quoteLiteral(status.id)}'::uuid,
          '${quoteLiteral(status.tenantId ?? this.tenantId)}',
          ${status.version ?? 1},
          '${quoteLiteral(status.createdAt)}'::timestamptz,
          '${quoteLiteral(status.updatedAt)}'::timestamptz,
          ${status.deletedAt ? `'${quoteLiteral(status.deletedAt)}'::timestamptz` : "NULL"},
          ${status.createdByActorId ? `'${quoteLiteral(status.createdByActorId)}'` : "NULL"},
          ${status.createdByActorRole ? `'${quoteLiteral(status.createdByActorRole)}'` : "NULL"},
          ${status.updatedByActorId ? `'${quoteLiteral(status.updatedByActorId)}'` : "NULL"},
          ${status.updatedByActorRole ? `'${quoteLiteral(status.updatedByActorRole)}'` : "NULL"},
          '${quoteLiteral(status.parentAccountId)}'::uuid,
          '${quoteLiteral(status.billingAccountId)}'::uuid,
          ${status.contactId ? `'${quoteLiteral(status.contactId)}'::uuid` : "NULL"},
          '${quoteLiteral(status.channel)}',
          '${quoteLiteral(status.destination)}',
          '${quoteLiteral(status.state)}',
          ${status.lastAttemptAt ? `'${quoteLiteral(status.lastAttemptAt)}'::timestamptz` : "NULL"},
          ${status.lastDeliveredAt ? `'${quoteLiteral(status.lastDeliveredAt)}'::timestamptz` : "NULL"},
          ${status.lastBouncedAt ? `'${quoteLiteral(status.lastBouncedAt)}'::timestamptz` : "NULL"},
          ${status.lastBounceReason ? `'${quoteLiteral(status.lastBounceReason)}'` : "NULL"},
          ${status.relatedMessageId ? `'${quoteLiteral(status.relatedMessageId)}'::uuid` : "NULL"},
          '${jsonLiteral(status.metadata)}'::jsonb
        )
        ON CONFLICT (id)
        DO UPDATE SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          state = EXCLUDED.state,
          last_attempt_at = EXCLUDED.last_attempt_at,
          last_delivered_at = EXCLUDED.last_delivered_at,
          last_bounced_at = EXCLUDED.last_bounced_at,
          last_bounce_reason = EXCLUDED.last_bounce_reason,
          related_message_id = EXCLUDED.related_message_id,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  listThreads(billingAccountId: string): CommunicationThread[] {
    const rows = queryJsonRows<ThreadRow>(
      this.databaseUrl,
      this.baseSelect("communication_thread", `
        id::text AS "id",
        tenant_id AS "tenantId",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt",
        created_by_actor_id AS "createdByActorId",
        created_by_actor_role AS "createdByActorRole",
        updated_by_actor_id AS "updatedByActorId",
        updated_by_actor_role AS "updatedByActorRole",
        channel,
        parent_account_id::text AS "parentAccountId",
        billing_account_id::text AS "billingAccountId",
        branch_ids AS "branchIds",
        contact_id::text AS "contactId",
        sender_identity_id::text AS "senderIdentityId",
        status,
        inbox_state AS "inboxState",
        subject_line AS "subjectLine",
        participant_addresses AS "participantAddresses",
        invoice_ids AS "invoiceIds",
        promise_to_pay_ids AS "promiseToPayIds",
        latest_message_id::text AS "latestMessageId",
        latest_message_at AS "latestMessageAt",
        unread_count AS "unreadCount",
        provider_thread_id AS "providerThreadId",
        provider_conversation_id AS "providerConversationId",
        metadata
      `, `billing_account_id = '${quoteLiteral(billingAccountId)}'::uuid`),
    );

    return rows.map((row) => ({
      ...baseEntity(row),
      channel: row.channel,
      parentAccountId: row.parentAccountId,
      billingAccountId: row.billingAccountId,
      branchIds: row.branchIds ?? [],
      ...(row.contactId ? { contactId: row.contactId } : {}),
      status: row.status,
      inboxState: row.inboxState,
      ...(row.subjectLine ? { subjectLine: row.subjectLine } : {}),
      participantAddresses: row.participantAddresses ?? [],
      invoiceIds: row.invoiceIds ?? [],
      promiseToPayIds: row.promiseToPayIds ?? [],
      ...(row.latestMessageId ? { latestMessageId: row.latestMessageId } : {}),
      ...(row.latestMessageAt ? { latestMessageAt: row.latestMessageAt } : {}),
      unreadCount: row.unreadCount,
      ...(row.providerThreadId ? { providerThreadId: row.providerThreadId } : {}),
      ...(row.providerConversationId ? { providerConversationId: row.providerConversationId } : {}),
      metadata: row.metadata ?? {},
    }));
  }

  listMessages(billingAccountId: string): CommunicationMessage[] {
    const rows = queryJsonRows<MessageRow>(
      this.databaseUrl,
      this.baseSelect("communication_message", `
        id::text AS "id",
        tenant_id AS "tenantId",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt",
        created_by_actor_id AS "createdByActorId",
        created_by_actor_role AS "createdByActorRole",
        updated_by_actor_id AS "updatedByActorId",
        updated_by_actor_role AS "updatedByActorRole",
        thread_id::text AS "threadId",
        channel,
        kind,
        status,
        direction,
        parent_account_id::text AS "parentAccountId",
        billing_account_id::text AS "billingAccountId",
        branch_id::text AS "branchId",
        contact_id::text AS "contactId",
        sender_identity_id::text AS "senderIdentityId",
        subject_line AS "subjectLine",
        body_preview AS "bodyPreview",
        body_text AS "bodyText",
        provider_message_id AS "providerMessageId",
        provider_thread_id AS "providerThreadId",
        provider_conversation_id AS "providerConversationId",
        in_reply_to_provider_message_id AS "inReplyToProviderMessageId",
        from_address AS "fromAddress",
        to_address AS "toAddress",
        occurred_at AS "occurredAt",
        reply_analysis AS "replyAnalysis",
        metadata
      `, `billing_account_id = '${quoteLiteral(billingAccountId)}'::uuid`),
    );

    return rows.map((row) => ({
      ...baseEntity(row),
      threadId: row.threadId,
      channel: row.channel,
      kind: row.kind,
      status: row.status,
      direction: row.direction,
      parentAccountId: row.parentAccountId,
      billingAccountId: row.billingAccountId,
      ...(row.branchId ? { branchId: row.branchId } : {}),
      ...(row.contactId ? { contactId: row.contactId } : {}),
      ...(row.subjectLine ? { subjectLine: row.subjectLine } : {}),
      bodyPreview: row.bodyPreview,
      ...(row.bodyText ? { bodyText: row.bodyText } : {}),
      ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}),
      ...(row.providerThreadId ? { providerThreadId: row.providerThreadId } : {}),
      ...(row.providerConversationId ? { providerConversationId: row.providerConversationId } : {}),
      ...(row.inReplyToProviderMessageId
        ? { inReplyToProviderMessageId: row.inReplyToProviderMessageId }
        : {}),
      ...(row.fromAddress ? { fromAddress: row.fromAddress } : {}),
      ...(row.toAddress ? { toAddress: row.toAddress } : {}),
      occurredAt: row.occurredAt,
      ...(row.replyAnalysis ? { replyAnalysis: row.replyAnalysis } : {}),
      metadata: row.metadata ?? {},
    }));
  }

  listCallSessions(billingAccountId: string): CallSession[] {
    const rows = queryJsonRows<CallSessionRow>(
      this.databaseUrl,
      this.baseSelect("call_session", `
        id::text AS "id",
        tenant_id AS "tenantId",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt",
        created_by_actor_id AS "createdByActorId",
        created_by_actor_role AS "createdByActorRole",
        updated_by_actor_id AS "updatedByActorId",
        updated_by_actor_role AS "updatedByActorRole",
        thread_id::text AS "threadId",
        parent_account_id::text AS "parentAccountId",
        billing_account_id::text AS "billingAccountId",
        branch_id::text AS "branchId",
        contact_id::text AS "contactId",
        sender_identity_id::text AS "senderIdentityId",
        provider,
        provider_call_id AS "providerCallId",
        direction,
        disposition,
        answered,
        started_at AS "startedAt",
        ended_at AS "endedAt",
        transcript_summary AS "transcriptSummary",
        transcript_segments AS "transcriptSegments",
        sentiment_label AS "sentimentLabel",
        operator_review_required AS "operatorReviewRequired",
        promise_to_pay_id::text AS "promiseToPayId",
        metadata
      `, `billing_account_id = '${quoteLiteral(billingAccountId)}'::uuid`),
    );

    return rows.map((row) => ({
      ...baseEntity(row),
      ...(row.threadId ? { threadId: row.threadId } : {}),
      parentAccountId: row.parentAccountId,
      billingAccountId: row.billingAccountId,
      ...(row.branchId ? { branchId: row.branchId } : {}),
      ...(row.contactId ? { contactId: row.contactId } : {}),
      provider: row.provider,
      ...(row.providerCallId ? { providerCallId: row.providerCallId } : {}),
      direction: row.direction,
      disposition: row.disposition,
      answered: row.answered,
      startedAt: row.startedAt,
      ...(row.endedAt ? { endedAt: row.endedAt } : {}),
      ...(row.transcriptSummary ? { transcriptSummary: row.transcriptSummary } : {}),
      transcriptSegments: row.transcriptSegments ?? [],
      ...(row.sentimentLabel ? { sentimentLabel: row.sentimentLabel } : {}),
      operatorReviewRequired: row.operatorReviewRequired,
      ...(row.promiseToPayId ? { promiseToPayId: row.promiseToPayId } : {}),
      metadata: row.metadata ?? {},
    }));
  }

  listOutreachDrafts(billingAccountId: string): OutreachDraft[] {
    const rows = queryJsonRows<DraftRow>(
      this.databaseUrl,
      this.baseSelect("outreach_draft", `
        id::text AS "id",
        tenant_id AS "tenantId",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt",
        created_by_actor_id AS "createdByActorId",
        created_by_actor_role AS "createdByActorRole",
        updated_by_actor_id AS "updatedByActorId",
        updated_by_actor_role AS "updatedByActorRole",
        channel,
        thread_id::text AS "threadId",
        parent_account_id::text AS "parentAccountId",
        billing_account_id::text AS "billingAccountId",
        branch_ids AS "branchIds",
        contact_id::text AS "contactId",
        sender_identity_id::text AS "senderIdentityId",
        invoice_ids AS "invoiceIds",
        status,
        subject_line AS "subjectLine",
        body_preview AS "bodyPreview",
        body_text AS "bodyText",
        approval_request_id::text AS "approvalRequestId",
        reply_to_message_id::text AS "replyToMessageId",
        email_first_production_behavior AS "emailFirstProductionBehavior",
        metadata
      `, `billing_account_id = '${quoteLiteral(billingAccountId)}'::uuid`),
    );

    return rows.map((row) => ({
      ...baseEntity(row),
      channel: row.channel,
      ...(row.threadId ? { threadId: row.threadId } : {}),
      parentAccountId: row.parentAccountId,
      billingAccountId: row.billingAccountId,
      branchIds: row.branchIds ?? [],
      ...(row.contactId ? { contactId: row.contactId } : {}),
      invoiceIds: row.invoiceIds ?? [],
      status: row.status,
      ...(row.subjectLine ? { subjectLine: row.subjectLine } : {}),
      bodyPreview: row.bodyPreview,
      ...(row.bodyText ? { bodyText: row.bodyText } : {}),
      ...(row.approvalRequestId ? { approvalRequestId: row.approvalRequestId } : {}),
      ...(row.replyToMessageId ? { replyToMessageId: row.replyToMessageId } : {}),
      emailFirstProductionBehavior: row.emailFirstProductionBehavior,
      metadata: row.metadata ?? {},
    }));
  }

  listDeliveryStatuses(billingAccountId: string): ContactDeliveryStatus[] {
    const rows = queryJsonRows<DeliveryStatusRow>(
      this.databaseUrl,
      this.baseSelect("contact_delivery_status", `
        id::text AS "id",
        tenant_id AS "tenantId",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt",
        created_by_actor_id AS "createdByActorId",
        created_by_actor_role AS "createdByActorRole",
        updated_by_actor_id AS "updatedByActorId",
        updated_by_actor_role AS "updatedByActorRole",
        parent_account_id::text AS "parentAccountId",
        billing_account_id::text AS "billingAccountId",
        contact_id::text AS "contactId",
        channel,
        destination,
        state,
        last_attempt_at AS "lastAttemptAt",
        last_delivered_at AS "lastDeliveredAt",
        last_bounced_at AS "lastBouncedAt",
        last_bounce_reason AS "lastBounceReason",
        related_message_id::text AS "relatedMessageId",
        metadata
      `, `billing_account_id = '${quoteLiteral(billingAccountId)}'::uuid`),
    );

    return rows.map((row) => ({
      ...baseEntity(row),
      parentAccountId: row.parentAccountId,
      billingAccountId: row.billingAccountId,
      ...(row.contactId ? { contactId: row.contactId } : {}),
      channel: row.channel,
      destination: row.destination,
      state: row.state,
      ...(row.lastAttemptAt ? { lastAttemptAt: row.lastAttemptAt } : {}),
      ...(row.lastDeliveredAt ? { lastDeliveredAt: row.lastDeliveredAt } : {}),
      ...(row.lastBouncedAt ? { lastBouncedAt: row.lastBouncedAt } : {}),
      ...(row.lastBounceReason ? { lastBounceReason: row.lastBounceReason } : {}),
      ...(row.relatedMessageId ? { relatedMessageId: row.relatedMessageId } : {}),
      metadata: row.metadata ?? {},
    }));
  }

  private baseSelect(table: string, projection: string, predicate: string): string {
    return `
      SELECT row_to_json(q)
      FROM (
        SELECT ${projection}
        FROM ${table}
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND deleted_at IS NULL
          AND ${predicate}
        ORDER BY updated_at DESC
      ) q
    `;
  }
}

function baseEntity(row: {
  id: string;
  tenantId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdByActorId?: string;
  createdByActorRole?: string;
  updatedByActorId?: string;
  updatedByActorRole?: string;
}) {
  return {
    id: row.id,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    ...(row.createdByActorId ? { createdByActorId: row.createdByActorId } : {}),
    ...(row.createdByActorRole ? { createdByActorRole: row.createdByActorRole as "system" | "user" } : {}),
    ...(row.updatedByActorId ? { updatedByActorId: row.updatedByActorId } : {}),
    ...(row.updatedByActorRole ? { updatedByActorRole: row.updatedByActorRole as "system" | "user" } : {}),
  };
}
