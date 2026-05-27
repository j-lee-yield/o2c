import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  ApprovalRequestService,
  SafeCommunicationAttemptFactory,
  canUseSendingIdentityForOutbound,
  createEmailThreadReference,
  createSendingIdentity,
  evaluateApprovalRequirement,
  setSendingIdentityDefault,
  updateSendingIdentityHealth,
  type ApprovalRequest,
  type BillingAccount,
  type CollectionSendWindow,
  type CollectionScope,
  type Contact,
  type CustomerInvoice,
  type EmailDraftResult,
  type EmailProviderAdapter,
  type EmailThreadReference,
  type SendingIdentity,
  type SendingIdentityHealthCheck,
  type SendingIdentityProvider,
} from "@o2c/domain";

import {
  CollectionsWorkflowEngine,
  type ReminderPlanResult,
} from "./collections-engine.js";
import {
  CommunicationProviderExecutor,
  DefaultCommunicationExecutionHooks,
  createDefaultCommunicationProviderRegistry,
  type InMemoryCommunicationProviderRegistry,
} from "./communication-providers.js";

export type OutboundEmailWorkflowKind =
  | "grouped_reminder"
  | "invoice_level_reminder"
  | "resend_documents"
  | "request_remittance"
  | "ptp_follow_up"
  | "escalate_to_owner"
  | "inbox_reply";

export interface SendingIdentityStore {
  save(identity: SendingIdentity): void;
  list(): SendingIdentity[];
  get(id: string): SendingIdentity | undefined;
  replaceAll(identities: SendingIdentity[]): void;
}

export interface EmailThreadReferenceStore {
  save(reference: EmailThreadReference): void;
  getByAttemptId(communicationAttemptId: string): EmailThreadReference | undefined;
  findLatest(input: {
    provider: SendingIdentityProvider;
    senderIdentityId: string;
    billingAccountId?: string;
    contactId?: string;
  }): EmailThreadReference | undefined;
}

export class InMemorySendingIdentityStore implements SendingIdentityStore {
  private identities: SendingIdentity[] = [];

  save(identity: SendingIdentity): void {
    const index = this.identities.findIndex((candidate) => candidate.id === identity.id);
    if (index >= 0) {
      this.identities[index] = identity;
      return;
    }

    this.identities.push(identity);
  }

  list(): SendingIdentity[] {
    return [...this.identities];
  }

  get(id: string): SendingIdentity | undefined {
    return this.identities.find((identity) => identity.id === id);
  }

  replaceAll(identities: SendingIdentity[]): void {
    this.identities = [...identities];
  }
}

export class InMemoryEmailThreadReferenceStore implements EmailThreadReferenceStore {
  private references: EmailThreadReference[] = [];

  save(reference: EmailThreadReference): void {
    const index = this.references.findIndex((candidate) => candidate.id === reference.id);
    if (index >= 0) {
      this.references[index] = reference;
      return;
    }

    this.references.push(reference);
  }

  getByAttemptId(communicationAttemptId: string): EmailThreadReference | undefined {
    return this.references.find(
      (reference) => reference.communicationAttemptId === communicationAttemptId,
    );
  }

  findLatest(input: {
    provider: SendingIdentityProvider;
    senderIdentityId: string;
    billingAccountId?: string;
    contactId?: string;
  }): EmailThreadReference | undefined {
    return [...this.references]
      .filter((reference) => reference.provider === input.provider)
      .filter((reference) => reference.senderIdentityId === input.senderIdentityId)
      .filter((reference) =>
        input.billingAccountId ? reference.billingAccountId === input.billingAccountId : true,
      )
      .filter((reference) => (input.contactId ? reference.contactId === input.contactId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }
}

export interface OutboundEmailWorkflowDependencies {
  activityStore: ImmutableActivityLogStore;
  sendingIdentityStore?: SendingIdentityStore;
  threadStore?: EmailThreadReferenceStore;
  communicationAttemptStore?: CommunicationAttemptStore;
  providerRegistry?: InMemoryCommunicationProviderRegistry;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export interface CommunicationAttemptStore {
  save(attempt: ReturnType<SafeCommunicationAttemptFactory["create"]>): void;
}

export interface SendReminderParams {
  principal: Principal;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  contact: Contact;
  senderIdentityId?: string;
  scope?: CollectionScope;
  sendWindow?: CollectionSendWindow;
}

export interface SendResendParams {
  principal: Principal;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  contact: Contact;
  senderIdentityId?: string;
  subjectLine: string;
  bodyPreview: string;
  documentIds?: string[];
  attachments?: EmailAttachmentInput[];
}

export interface SendWorkflowEmailParams {
  principal: Principal;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  contact: Contact;
  senderIdentityId?: string;
  workflowKind: Exclude<
    OutboundEmailWorkflowKind,
    "grouped_reminder" | "invoice_level_reminder" | "resend_documents"
  >;
  subjectLine: string;
  bodyPreview: string;
  contentTemplateKey?: string;
  attachments?: EmailAttachmentInput[];
  ccEmails?: string[];
}

export interface SendInboxReplyParams {
  principal: Principal;
  account: BillingAccount;
  invoices?: CustomerInvoice[];
  contact: Contact;
  senderIdentityId?: string;
  providerThreadId: string;
  replyToProviderMessageId?: string;
  subjectLine: string;
  bodyPreview: string;
  attachments?: EmailAttachmentInput[];
}

export interface EmailAttachmentInput {
  fileName: string;
  mimeType?: string;
  contentBase64: string;
}

export interface OutboundEmailDraftResult {
  workflowKind: OutboundEmailWorkflowKind;
  communicationAttempt: ReturnType<SafeCommunicationAttemptFactory["create"]>;
  senderIdentity: SendingIdentity;
  draftResult: EmailDraftResult;
  threadReference: EmailThreadReference;
  activityEntries: ImmutableActivityLogEntry[];
}

export interface OutboundEmailSendResult {
  workflowKind: OutboundEmailWorkflowKind;
  communicationAttempt?: ReturnType<SafeCommunicationAttemptFactory["create"]>;
  senderIdentity: SendingIdentity;
  reminderPlan?: ReminderPlanResult;
  approvalRequest?: ApprovalRequest;
  deliveryState:
    | "drafted"
    | "sent"
    | "approval_needed"
    | "blocked"
    | "failed";
  failureReason?: string;
  threadReference?: EmailThreadReference;
  activityEntries: ImmutableActivityLogEntry[];
}

export class OutboundEmailWorkflowService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly sendingIdentityStore: SendingIdentityStore;
  private readonly threadStore: EmailThreadReferenceStore;
  private readonly communicationAttemptStore: CommunicationAttemptStore | undefined;
  private readonly providerRegistry: InMemoryCommunicationProviderRegistry;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly collectionsEngine: CollectionsWorkflowEngine;
  private readonly approvals: ApprovalRequestService;
  private readonly communicationFactory = new SafeCommunicationAttemptFactory();
  private readonly executor = new CommunicationProviderExecutor();
  private readonly hooks = new DefaultCommunicationExecutionHooks();

  constructor(private readonly deps: OutboundEmailWorkflowDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.sendingIdentityStore =
      deps.sendingIdentityStore ?? new InMemorySendingIdentityStore();
    this.threadStore = deps.threadStore ?? new InMemoryEmailThreadReferenceStore();
    this.communicationAttemptStore = deps.communicationAttemptStore;
    this.providerRegistry =
      deps.providerRegistry ?? createDefaultCommunicationProviderRegistry();
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: () => this.idGenerator("activity"),
      now: this.now,
    });
    this.collectionsEngine = new CollectionsWorkflowEngine({
      activityStore: deps.activityStore,
      now: this.now,
      idGenerator: this.idGenerator,
    });
    this.approvals = new ApprovalRequestService({
      audit: this.audit,
      now: this.now,
      idGenerator: () => this.idGenerator("approval"),
    });
  }

  connectSendingIdentity(input: {
    id?: string;
    provider: SendingIdentityProvider;
    authMode: SendingIdentity["authMode"];
    senderEmail: string;
    displayName?: string;
    ownerPrincipalId?: string;
    ownerPrincipalRoles?: string[];
    scopes?: string[];
    sendAsEmail?: string;
    sendOnBehalfOfEmail?: string;
    allowedTenantId?: string;
    allowedSupplierScope?: string[];
    isDefault?: boolean;
    connectionStatus?: SendingIdentity["connectionStatus"];
    permissionStatus?: SendingIdentity["permissionStatus"];
    healthState?: SendingIdentity["healthState"];
    lastSyncAt?: string;
    lastSendCheckAt?: string;
    metadata?: Record<string, unknown>;
    principal?: Principal;
  }): SendingIdentity {
    const createdAt = this.now();
    const identity = createSendingIdentity({
      id: input.id ?? this.idGenerator("sender"),
      provider: input.provider,
      authMode: input.authMode,
      senderEmail: input.senderEmail,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.ownerPrincipalId || input.principal?.id
        ? { ownerPrincipalId: input.ownerPrincipalId ?? input.principal?.id }
        : {}),
      ownerPrincipalRoles: input.ownerPrincipalRoles ?? input.principal?.roles ?? [],
      scopes: input.scopes ?? [],
      ...(input.sendAsEmail ? { sendAsEmail: input.sendAsEmail } : {}),
      ...(input.sendOnBehalfOfEmail
        ? { sendOnBehalfOfEmail: input.sendOnBehalfOfEmail }
        : {}),
      ...(input.allowedTenantId ? { allowedTenantId: input.allowedTenantId } : {}),
      allowedSupplierScope: input.allowedSupplierScope ?? [],
      isDefault: input.isDefault ?? this.sendingIdentityStore.list().length === 0,
      connectionStatus: input.connectionStatus ?? "connected",
      permissionStatus:
        input.permissionStatus ??
        (input.scopes && input.scopes.length > 0 ? "granted" : "partial"),
      healthState: input.healthState ?? "healthy",
      lastSyncAt: input.lastSyncAt ?? createdAt,
      lastSendCheckAt: input.lastSendCheckAt ?? createdAt,
      metadata: input.metadata ?? {},
      createdAt,
      actorId: input.principal?.id,
      actorRole: input.principal ? "user" : "system",
    });

    if (identity.isDefault) {
      this.sendingIdentityStore.replaceAll(
        setSendingIdentityDefault(
          [...this.sendingIdentityStore.list(), identity],
          identity.id,
          createdAt,
        ),
      );
    } else {
      this.sendingIdentityStore.save(identity);
    }

    return this.requireSendingIdentity(identity.id);
  }

  listSendingIdentities(): SendingIdentity[] {
    return this.sendingIdentityStore.list();
  }

  saveSendingIdentity(identity: SendingIdentity): SendingIdentity {
    this.sendingIdentityStore.save(identity);
    return this.requireSendingIdentity(identity.id);
  }

  setDefaultSendingIdentity(identityId: string): SendingIdentity {
    const identities = this.sendingIdentityStore.list();
    const updated = setSendingIdentityDefault(identities, identityId, this.now());
    this.sendingIdentityStore.replaceAll(updated);
    return this.requireSendingIdentity(identityId);
  }

  validateSendingIdentityHealth(identityId: string): {
    identity: SendingIdentity;
    healthCheck: SendingIdentityHealthCheck;
  } {
    const identity = this.requireSendingIdentity(identityId);
    const checkedAt = this.now();
    const reasonCodes: string[] = [];
    if (identity.connectionStatus !== "connected") {
      reasonCodes.push("mailbox_disconnected");
    }
    if (identity.permissionStatus === "missing") {
      reasonCodes.push("permissions_missing");
    }
    if (identity.scopes.length === 0) {
      reasonCodes.push("scopes_unverified");
    }

    const healthCheck: SendingIdentityHealthCheck = {
      status:
        reasonCodes.length === 0 ? "healthy" : reasonCodes.includes("mailbox_disconnected")
          ? "failed"
          : "degraded",
      checkedAt,
      reasonCodes,
    };
    const updated = updateSendingIdentityHealth(identity, {
      checkedAt,
      status: healthCheck.status,
      reasonCodes,
      actorId: "system_email",
      actorRole: "system",
    });
    this.sendingIdentityStore.save(updated);

    return {
      identity: updated,
      healthCheck,
    };
  }

  previewReminder(params: SendReminderParams): ReminderPlanResult & {
    senderIdentity: SendingIdentity;
  } {
    const senderIdentity = this.resolveSendingIdentity(params.senderIdentityId);
    const reminderPlan = this.collectionsEngine.planReminder({
      principal: params.principal,
      account: params.account,
      invoices: params.invoices,
      contact: params.contact,
      ...(params.scope ? { scope: params.scope } : {}),
      ...(params.sendWindow ? { sendWindow: params.sendWindow } : {}),
    });

    return {
      ...reminderPlan,
      senderIdentity,
    };
  }

  async draftReminder(
    params: SendReminderParams,
  ): Promise<OutboundEmailDraftResult | OutboundEmailSendResult> {
    const preview = this.previewReminder(params);
    if (preview.reminderDraft.deliveryState !== "ready" || !preview.communicationAttempt) {
      return {
        workflowKind:
          preview.reminderDraft.groupingMode === "invoice"
            ? "invoice_level_reminder"
            : "grouped_reminder",
        senderIdentity: preview.senderIdentity,
        reminderPlan: preview,
        ...(preview.approvalRequest ? { approvalRequest: preview.approvalRequest } : {}),
        deliveryState:
          preview.reminderDraft.deliveryState === "approval_needed"
            ? "approval_needed"
            : "blocked",
        failureReason: preview.reminderDraft.blockedReason,
        activityEntries: preview.activityEntries,
      };
    }

    const identityCheck = this.validateSendingIdentityHealth(preview.senderIdentity.id);
    if (!canUseSendingIdentityForOutbound(identityCheck.identity)) {
      return {
        workflowKind:
          preview.reminderDraft.groupingMode === "invoice"
            ? "invoice_level_reminder"
            : "grouped_reminder",
        senderIdentity: identityCheck.identity,
        reminderPlan: preview,
        deliveryState: "blocked",
        failureReason: "sending_identity_unhealthy",
        activityEntries: preview.activityEntries,
      };
    }

    const workflowKind =
      preview.reminderDraft.groupingMode === "invoice"
        ? "invoice_level_reminder"
        : "grouped_reminder";
    const thread = this.threadStore.findLatest({
      provider: identityCheck.identity.provider,
      senderIdentityId: identityCheck.identity.id,
      billingAccountId: params.account.id,
      contactId: params.contact.id,
    });
    const attempt = this.decorateAttemptWithIdentity(
      preview.communicationAttempt,
      identityCheck.identity,
      thread,
    );
    const adapter = this.resolveEmailAdapter(identityCheck.identity.provider);
    const draftResult = await adapter.createDraft({ attempt });
    const threadReference = this.storeThreadReference({
      attempt,
      senderIdentity: identityCheck.identity,
      workflowKind,
      providerMessageId: draftResult.providerMessageId,
      providerThreadId: draftResult.providerThreadId,
      providerConversationId: draftResult.providerConversationId,
      replyToProviderMessageId: thread?.providerMessageId,
    });
    const activityEntry = this.audit.append({
      actorId: params.principal.id,
      actorRole: params.principal.roles[0] ?? "ar_collector",
      action: "email.outbound.drafted",
      entityType: "communication_attempt",
      entityId: attempt.id,
      after: serializeJson(attempt),
      metadata: {
        senderIdentityId: identityCheck.identity.id,
        provider: attempt.provider,
        billingAccountId: params.account.id,
        workflowKind,
      },
    });

    return {
      workflowKind,
      communicationAttempt: attempt,
      senderIdentity: identityCheck.identity,
      draftResult,
      threadReference,
      activityEntries: [...preview.activityEntries, activityEntry],
    };
  }

  async sendReminder(
    params: SendReminderParams,
  ): Promise<OutboundEmailSendResult> {
    const preview = this.previewReminder(params);
    if (preview.reminderDraft.deliveryState !== "ready" || !preview.communicationAttempt) {
      return {
        workflowKind:
          preview.reminderDraft.groupingMode === "invoice"
            ? "invoice_level_reminder"
            : "grouped_reminder",
        senderIdentity: preview.senderIdentity,
        reminderPlan: preview,
        ...(preview.approvalRequest ? { approvalRequest: preview.approvalRequest } : {}),
        deliveryState:
          preview.reminderDraft.deliveryState === "approval_needed"
            ? "approval_needed"
            : "blocked",
        failureReason: preview.reminderDraft.blockedReason,
        activityEntries: preview.activityEntries,
      };
    }

    return this.executeAttempt({
      principal: params.principal,
      workflowKind:
        preview.reminderDraft.groupingMode === "invoice"
          ? "invoice_level_reminder"
          : "grouped_reminder",
      senderIdentity: preview.senderIdentity,
      attempt: preview.communicationAttempt,
      billingAccountId: params.account.id,
      contactId: params.contact.id,
      reminderPlan: preview,
    });
  }

  async sendResendDocuments(
    params: SendResendParams,
  ): Promise<OutboundEmailSendResult> {
    const senderIdentity = this.resolveSendingIdentity(params.senderIdentityId);
    const identityCheck = this.validateSendingIdentityHealth(senderIdentity.id);
    if (!canUseSendingIdentityForOutbound(identityCheck.identity)) {
      return {
        workflowKind: "resend_documents",
        senderIdentity: identityCheck.identity,
        deliveryState: "blocked",
        failureReason: "sending_identity_unhealthy",
        activityEntries: [],
      };
    }

    if (!params.contact.email || !params.contact.isVerified || !params.contact.allowAutoSend) {
      const approvalRequest = this.createApprovalRequest(params.principal, {
        account: params.account,
        invoices: params.invoices,
        workflowKind: "resend_documents",
        subjectLine: params.subjectLine,
      });

      return {
        workflowKind: "resend_documents",
        senderIdentity: identityCheck.identity,
        approvalRequest,
        deliveryState: "approval_needed",
        failureReason: "unverified_contact",
        activityEntries: [],
      };
    }

    const attempt = this.createWorkflowAttempt({
      workflowKind: "resend_documents",
      account: params.account,
      invoices: params.invoices,
      contact: params.contact,
      senderIdentity: identityCheck.identity,
      subjectLine: params.subjectLine,
      bodyPreview: params.bodyPreview,
      contentTemplateKey: "collections_resend_bundle_v1",
      metadata: {
        documentIds: params.documentIds ?? [],
        ...(params.attachments?.length ? { attachments: params.attachments } : {})
      },
    });

    return this.executeAttempt({
      principal: params.principal,
      workflowKind: "resend_documents",
      senderIdentity: identityCheck.identity,
      attempt,
      billingAccountId: params.account.id,
      contactId: params.contact.id,
    });
  }

  async sendWorkflowEmail(
    params: SendWorkflowEmailParams,
  ): Promise<OutboundEmailSendResult> {
    const senderIdentity = this.resolveSendingIdentity(params.senderIdentityId);
    const identityCheck = this.validateSendingIdentityHealth(senderIdentity.id);
    if (!canUseSendingIdentityForOutbound(identityCheck.identity)) {
      return {
        workflowKind: params.workflowKind,
        senderIdentity: identityCheck.identity,
        deliveryState: "blocked",
        failureReason: "sending_identity_unhealthy",
        activityEntries: [],
      };
    }

    const approvalDecision = evaluateApprovalRequirement({
      subject: "outbound_message",
      action:
        params.workflowKind === "request_remittance"
          ? "request_remittance_advice"
          : params.workflowKind === "ptp_follow_up"
            ? "broken_promise_follow_up"
            : "send_reminder",
      billingAccountId: params.account.id,
      parentAccountId: params.account.parentAccountId,
      branchIds: params.invoices
        .map((invoice) => invoice.branchId)
        .filter((value): value is string => Boolean(value)),
      accountTier: params.account.accountTier,
      hasDisputedInvoice: params.invoices.some(
        (invoice) => invoice.state === "disputed_partial" || invoice.state === "disputed_full",
      ),
      verifiedContact: Boolean(params.contact.isVerified && params.contact.allowAutoSend),
      lowRisk: params.workflowKind !== "escalate_to_owner",
    });

    if (approvalDecision.requiresApproval || !params.contact.email) {
      const approvalRequest = this.approvals.create(params.principal, {
        requestType: approvalDecision.requestType,
        assigneeRole: approvalDecision.assigneeRole,
        payload: {
          workflowKind: params.workflowKind,
          subjectLine: params.subjectLine,
          billingAccountId: params.account.id,
          invoiceIds: params.invoices.map((invoice) => invoice.id),
        },
        policyContext: approvalDecision.policyContext,
      });
      const submitted = this.approvals.submit(params.principal, approvalRequest);

      return {
        workflowKind: params.workflowKind,
        senderIdentity: identityCheck.identity,
        approvalRequest: submitted,
        deliveryState: "approval_needed",
        failureReason: !params.contact.email ? "missing_recipient" : "approval_required",
        activityEntries: [],
      };
    }

    const attemptMetadata = {
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
      ...(params.ccEmails?.length ? { ccEmails: params.ccEmails } : {}),
    };
    const attempt = this.createWorkflowAttempt({
      workflowKind: params.workflowKind,
      account: params.account,
      invoices: params.invoices,
      contact: params.contact,
      senderIdentity: identityCheck.identity,
      subjectLine: params.subjectLine,
      bodyPreview: params.bodyPreview,
      ...(params.contentTemplateKey ? { contentTemplateKey: params.contentTemplateKey } : {}),
      ...(Object.keys(attemptMetadata).length > 0 ? { metadata: attemptMetadata } : {}),
    });

    return this.executeAttempt({
      principal: params.principal,
      workflowKind: params.workflowKind,
      senderIdentity: identityCheck.identity,
      attempt,
      billingAccountId: params.account.id,
      contactId: params.contact.id,
    });
  }

  async sendInboxReply(
    params: SendInboxReplyParams,
  ): Promise<OutboundEmailSendResult> {
    const senderIdentity = this.resolveSendingIdentity(params.senderIdentityId);
    const identityCheck = this.validateSendingIdentityHealth(senderIdentity.id);
    const invoices = params.invoices ?? [];
    if (!canUseSendingIdentityForOutbound(identityCheck.identity)) {
      return {
        workflowKind: "inbox_reply",
        senderIdentity: identityCheck.identity,
        deliveryState: "blocked",
        failureReason: "sending_identity_unhealthy",
        activityEntries: [],
      };
    }

    const approvalDecision = evaluateApprovalRequirement({
      subject: "outbound_message",
      action: "send_reminder",
      billingAccountId: params.account.id,
      parentAccountId: params.account.parentAccountId,
      branchIds: invoices
        .map((invoice) => invoice.branchId)
        .filter((value): value is string => Boolean(value)),
      accountTier: params.account.accountTier,
      hasDisputedInvoice: invoices.some(
        (invoice) => invoice.state === "disputed_partial" || invoice.state === "disputed_full",
      ),
      verifiedContact: Boolean(params.contact.isVerified && params.contact.allowAutoSend),
      lowRisk: false,
    });
    const requiresVerifiedContactApproval = !params.contact.isVerified || !params.contact.allowAutoSend;

    if (approvalDecision.requiresApproval || requiresVerifiedContactApproval || !params.contact.email) {
      const approvalRequest = this.approvals.create(params.principal, {
        requestType: approvalDecision.requestType,
        assigneeRole: approvalDecision.assigneeRole,
        payload: {
          workflowKind: "inbox_reply",
          subjectLine: params.subjectLine,
          billingAccountId: params.account.id,
          invoiceIds: invoices.map((invoice) => invoice.id),
          providerThreadId: params.providerThreadId,
        },
        policyContext: approvalDecision.policyContext,
      });
      const submitted = this.approvals.submit(params.principal, approvalRequest);

      return {
        workflowKind: "inbox_reply",
        senderIdentity: identityCheck.identity,
        approvalRequest: submitted,
        deliveryState: "approval_needed",
        failureReason:
          !params.contact.email
            ? "missing_recipient"
            : requiresVerifiedContactApproval
              ? "unverified_contact_requires_approval"
              : "approval_required",
        activityEntries: [],
      };
    }

    const attempt = this.createWorkflowAttempt({
      workflowKind: "inbox_reply",
      account: params.account,
      invoices,
      contact: params.contact,
      senderIdentity: identityCheck.identity,
      subjectLine: params.subjectLine,
      bodyPreview: params.bodyPreview,
      metadata: {
        source: "inbox_reply",
        providerThreadId: params.providerThreadId,
        ...(params.attachments?.length ? { attachments: params.attachments } : {}),
      },
    });

    return this.executeAttempt({
      principal: params.principal,
      workflowKind: "inbox_reply",
      senderIdentity: identityCheck.identity,
      attempt,
      billingAccountId: params.account.id,
      contactId: params.contact.id,
      threadOverride: {
        providerThreadId: params.providerThreadId,
        ...(params.replyToProviderMessageId
          ? { providerMessageId: params.replyToProviderMessageId }
          : {}),
      },
    });
  }

  getConversationMetadata(communicationAttemptId: string): EmailThreadReference | undefined {
    return this.threadStore.getByAttemptId(communicationAttemptId);
  }

  private createApprovalRequest(
    principal: Principal,
    input: {
      account: BillingAccount;
      invoices: CustomerInvoice[];
      workflowKind: OutboundEmailWorkflowKind;
      subjectLine: string;
    },
  ): ApprovalRequest {
    const created = this.approvals.create(principal, {
      requestType: "collections_outreach_review",
      assigneeRole: "ar_manager",
      payload: {
        workflowKind: input.workflowKind,
        billingAccountId: input.account.id,
        invoiceIds: input.invoices.map((invoice) => invoice.id),
        subjectLine: input.subjectLine,
      },
      policyContext: {
        workflowKind: input.workflowKind,
      },
    });
    return this.approvals.submit(principal, created);
  }

  private async executeAttempt(input: {
    principal: Principal;
    workflowKind: OutboundEmailWorkflowKind;
    senderIdentity: SendingIdentity;
    attempt: ReturnType<SafeCommunicationAttemptFactory["create"]>;
    billingAccountId: string;
    contactId?: string;
    reminderPlan?: ReminderPlanResult;
    threadOverride?: {
      providerThreadId: string;
      providerMessageId?: string;
    };
  }): Promise<OutboundEmailSendResult> {
    const identityCheck = this.validateSendingIdentityHealth(input.senderIdentity.id);
    if (!canUseSendingIdentityForOutbound(identityCheck.identity)) {
      return {
        workflowKind: input.workflowKind,
        senderIdentity: identityCheck.identity,
        ...(input.reminderPlan ? { reminderPlan: input.reminderPlan } : {}),
        deliveryState: "blocked",
        failureReason: "sending_identity_unhealthy",
        activityEntries: input.reminderPlan?.activityEntries ?? [],
      };
    }

    const thread =
      input.threadOverride
        ? {
            id: this.idGenerator("thread_lookup"),
            communicationAttemptId: input.attempt.id,
            provider: identityCheck.identity.provider,
            senderIdentityId: identityCheck.identity.id,
            billingAccountId: input.billingAccountId,
            invoiceIds: input.attempt.invoiceIds,
            workflowIntent: input.workflowKind,
            providerThreadId: input.threadOverride.providerThreadId,
            ...(input.contactId ? { contactId: input.contactId } : {}),
            ...(input.threadOverride.providerMessageId
              ? { providerMessageId: input.threadOverride.providerMessageId }
              : {}),
            metadata: {},
            createdAt: this.now(),
            updatedAt: this.now(),
            actorId: "system_email",
            actorRole: "system",
          }
        : this.threadStore.findLatest({
            provider: identityCheck.identity.provider,
            senderIdentityId: identityCheck.identity.id,
            billingAccountId: input.billingAccountId,
            ...(input.contactId ? { contactId: input.contactId } : {}),
          });
    const attempt = this.decorateAttemptWithIdentity(
      input.attempt,
      identityCheck.identity,
      thread,
    );
    const adapter = this.resolveEmailAdapter(identityCheck.identity.provider);

    try {
      const execution =
        thread?.providerThreadId
          ? await adapter.replyToThread({
              attempt,
              providerThreadId: thread.providerThreadId,
              ...(thread.providerMessageId
                ? { replyToProviderMessageId: thread.providerMessageId }
                : {}),
            })
          : (
              await this.executor.executeOutbound({
                attempt,
                occurredAt: this.now(),
                hooks: this.hooks,
                emailProvider: adapter,
              })
            ).sendResult;

      if (!execution) {
        return {
          workflowKind: input.workflowKind,
          senderIdentity: identityCheck.identity,
          communicationAttempt: attempt,
          ...(input.reminderPlan ? { reminderPlan: input.reminderPlan } : {}),
          deliveryState: "blocked",
          failureReason: "send_blocked",
          activityEntries: input.reminderPlan?.activityEntries ?? [],
        };
      }

      const sentAttempt: typeof attempt = {
        ...attempt,
        status: "sent",
        updatedAt: this.now(),
        ...(execution.providerMessageId
          ? { providerMessageId: execution.providerMessageId }
          : {}),
        ...(execution.providerThreadId
          ? { providerThreadId: execution.providerThreadId }
          : {}),
        ...(execution.providerConversationId
          ? { providerConversationId: execution.providerConversationId }
          : {}),
      };
      this.communicationAttemptStore?.save(sentAttempt);
      const threadReference = this.storeThreadReference({
        attempt: sentAttempt,
        senderIdentity: identityCheck.identity,
        workflowKind: input.workflowKind,
        providerMessageId: execution.providerMessageId,
        providerThreadId: execution.providerThreadId,
        providerConversationId: execution.providerConversationId,
        replyToProviderMessageId: thread?.providerMessageId,
      });
      const activityEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "email.outbound.sent",
        entityType: "communication_attempt",
        entityId: attempt.id,
        after: serializeJson(sentAttempt),
        metadata: {
          workflowKind: input.workflowKind,
          senderIdentityId: identityCheck.identity.id,
          provider: sentAttempt.provider,
          billingAccountId: input.billingAccountId,
          ...(thread?.providerThreadId ? { threadedReply: true } : {}),
        },
      });

      return {
        workflowKind: input.workflowKind,
        senderIdentity: identityCheck.identity,
        communicationAttempt: sentAttempt,
        ...(input.reminderPlan ? { reminderPlan: input.reminderPlan } : {}),
        deliveryState: "sent",
        threadReference,
        activityEntries: [...(input.reminderPlan?.activityEntries ?? []), activityEntry],
      };
    } catch (error) {
      const failedAttempt: typeof attempt = {
        ...attempt,
        status: "failed",
        updatedAt: this.now(),
      };
      this.communicationAttemptStore?.save(failedAttempt);
      const activityEntry = this.audit.append({
        actorId: input.principal.id,
        actorRole: input.principal.roles[0] ?? "ar_collector",
        action: "email.outbound.failed",
        entityType: "communication_attempt",
        entityId: failedAttempt.id,
        after: serializeJson(failedAttempt),
        metadata: {
          workflowKind: input.workflowKind,
          senderIdentityId: identityCheck.identity.id,
          provider: failedAttempt.provider,
          billingAccountId: input.billingAccountId,
          reasonSummary: error instanceof Error ? error.message : "Unknown send failure.",
        },
      });

      return {
        workflowKind: input.workflowKind,
        senderIdentity: identityCheck.identity,
        communicationAttempt: failedAttempt,
        ...(input.reminderPlan ? { reminderPlan: input.reminderPlan } : {}),
        deliveryState: "failed",
        failureReason: error instanceof Error ? error.message : "Unknown send failure.",
        activityEntries: [...(input.reminderPlan?.activityEntries ?? []), activityEntry],
      };
    }
  }

  private createWorkflowAttempt(input: {
    workflowKind: Exclude<OutboundEmailWorkflowKind, "grouped_reminder" | "invoice_level_reminder">;
    account: BillingAccount;
    invoices: CustomerInvoice[];
    contact: Contact;
    senderIdentity: SendingIdentity;
    subjectLine: string;
    bodyPreview: string;
    contentTemplateKey?: string;
    metadata?: Record<string, unknown>;
  }): ReturnType<SafeCommunicationAttemptFactory["create"]> {
    return this.communicationFactory.create({
      attemptId: this.idGenerator("communication"),
      parentAccountId: input.account.parentAccountId,
      billingAccountId: input.account.id,
      branchId: input.invoices.find((invoice) => invoice.branchId)?.branchId,
      contactId: input.contact.id,
      channel: "email",
      provider: input.senderIdentity.provider,
      senderIdentityId: input.senderIdentity.id,
      senderEmail: input.senderIdentity.senderEmail,
      ...(input.senderIdentity.displayName
        ? { senderDisplayName: input.senderIdentity.displayName }
        : {}),
      direction: "outbound",
      intentType: mapWorkflowIntent(input.workflowKind),
      recipient: {
        email: input.contact.email,
        displayName: input.contact.fullName,
        verified: input.contact.isVerified && input.contact.allowAutoSend,
      },
      invoiceIds: input.invoices.map((invoice) => invoice.id),
      subjectLine: input.subjectLine,
      ...(input.contentTemplateKey ? { contentTemplateKey: input.contentTemplateKey } : {}),
      bodyPreview: input.bodyPreview,
      createdAt: this.now(),
      actorId: "system_email",
      actorRole: "system",
      metadata: input.metadata ?? {},
    });
  }

  private decorateAttemptWithIdentity(
    attempt: ReturnType<SafeCommunicationAttemptFactory["create"]>,
    senderIdentity: SendingIdentity,
    thread?: EmailThreadReference,
  ): ReturnType<SafeCommunicationAttemptFactory["create"]> {
    return {
      ...attempt,
      provider: senderIdentity.provider,
      senderIdentityId: senderIdentity.id,
      senderEmail: senderIdentity.senderEmail,
      ...(senderIdentity.displayName
        ? { senderDisplayName: senderIdentity.displayName }
        : {}),
      ...(thread?.providerThreadId ? { providerThreadId: thread.providerThreadId } : {}),
      ...(thread?.providerConversationId
        ? { providerConversationId: thread.providerConversationId }
        : {}),
      ...(thread?.providerMessageId
        ? { inReplyToProviderMessageId: thread.providerMessageId }
        : {}),
    };
  }

  private storeThreadReference(input: {
    attempt: ReturnType<SafeCommunicationAttemptFactory["create"]>;
    senderIdentity: SendingIdentity;
    workflowKind: OutboundEmailWorkflowKind;
    providerMessageId?: string;
    providerThreadId?: string;
    providerConversationId?: string;
    replyToProviderMessageId?: string;
  }): EmailThreadReference {
    const reference = createEmailThreadReference({
      id: this.idGenerator("thread"),
      communicationAttemptId: input.attempt.id,
      provider: input.attempt.provider,
      senderIdentityId: input.senderIdentity.id,
      ...(input.attempt.billingAccountId ? { billingAccountId: input.attempt.billingAccountId } : {}),
      ...(input.attempt.contactId ? { contactId: input.attempt.contactId } : {}),
      invoiceIds: input.attempt.invoiceIds,
      workflowIntent: input.workflowKind,
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      ...(input.providerThreadId ? { providerThreadId: input.providerThreadId } : {}),
      ...(input.providerConversationId
        ? { providerConversationId: input.providerConversationId }
        : {}),
      ...(input.replyToProviderMessageId
        ? { replyToProviderMessageId: input.replyToProviderMessageId }
        : {}),
      metadata: {
        senderEmail: input.senderIdentity.senderEmail,
      },
      createdAt: this.now(),
      actorId: "system_email",
      actorRole: "system",
    });
    this.threadStore.save(reference);
    return reference;
  }

  private resolveSendingIdentity(senderIdentityId?: string): SendingIdentity {
    if (senderIdentityId) {
      return this.requireSendingIdentity(senderIdentityId);
    }

    const identity = this.sendingIdentityStore.list().find((candidate) => candidate.isDefault);
    if (!identity) {
      throw new Error("No default sending identity is connected.");
    }
    return identity;
  }

  private requireSendingIdentity(identityId: string): SendingIdentity {
    const identity = this.sendingIdentityStore.get(identityId);
    if (!identity) {
      throw new Error(`Sending identity ${identityId} was not found.`);
    }
    return identity;
  }

  private resolveEmailAdapter(provider: SendingIdentityProvider): EmailProviderAdapter {
    const bundle = this.providerRegistry.resolveForAttempt({
      id: "provider_lookup",
      createdAt: this.now(),
      updatedAt: this.now(),
      parentAccountId: "provider_lookup",
      channel: "email",
      provider,
      direction: "outbound",
      intentType: "reminder",
      status: "queued",
      recipient: { verified: true },
      invoiceIds: [],
      blockedReasons: [],
      explanation: [],
      metadata: {},
    });

    if (bundle.descriptor.channel !== "email") {
      throw new Error(`Provider ${provider} is not registered for email.`);
    }

    return bundle.adapter as EmailProviderAdapter;
  }
}

function mapWorkflowIntent(
  workflowKind: Exclude<OutboundEmailWorkflowKind, "grouped_reminder" | "invoice_level_reminder">,
): "resend_documents" | "request_remittance" | "ptp_follow_up" | "escalation" | "exception_resolution" {
  switch (workflowKind) {
    case "resend_documents":
      return "resend_documents";
    case "request_remittance":
      return "request_remittance";
    case "ptp_follow_up":
      return "ptp_follow_up";
    case "escalate_to_owner":
      return "escalation";
    case "inbox_reply":
      return "exception_resolution";
  }
}

function serializeJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
