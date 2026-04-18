import type { AuditContext, AuditLogger } from "@o2c/audit";
import {
  createActivityLogDomainHelpers,
  InMemoryImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import {
  ApprovalRequestService,
  appendTaskAuditEntry,
  buildUnifiedCustomerProfileView,
  createCustomerProfileFromIngestion,
  createCustomerProfileTask,
  defaultCustomerProfileMasteringPolicy,
  detectPrimaryContactConflict,
  materializeProfileContacts,
  mergeCustomerProfileRecords,
  rankDuplicateCandidates,
  type ActorRole,
  type ApprovalRequest,
  type BillingAccount,
  type Branch,
  type CustomerInvoice,
  type CustomerIndexReadModel,
  type CustomerProfile,
  type CustomerProfileAggregateReadModel,
  type CustomerProfileContact,
  type CustomerProfileIngestionPayload,
  type CustomerProfileMasteringPolicy,
  type CustomerProfileMergeSuggestion,
  type CustomerProfilePrimaryContactConflict,
  type CustomerProfileReviewQueueItem,
  type CustomerProfileTask,
  type DomainException,
  type Payment,
  type ParentAccount,
  type Remittance,
  type UnifiedCustomerProfileView,
} from "@o2c/domain";

type LinkedEntities = {
  parentAccounts: Map<string, ParentAccount>;
  billingAccounts: Map<string, BillingAccount>;
  branches: Map<string, Branch>;
  invoices: Map<string, CustomerInvoice>;
  payments: Map<string, Payment>;
  remittances: Map<string, Remittance>;
  exceptions: Map<string, DomainException>;
};

export interface CustomerProfileMasteringStoreSnapshot {
  profiles: CustomerProfile[];
  contacts: CustomerProfileContact[];
  tasks: CustomerProfileTask[];
  approvals: ApprovalRequest[];
  mergeSuggestions: CustomerProfileMergeSuggestion[];
  primaryContactConflicts: CustomerProfilePrimaryContactConflict[];
}

export class InMemoryCustomerProfileMasteringStore {
  private readonly profiles = new Map<string, CustomerProfile>();
  private readonly contacts = new Map<string, CustomerProfileContact>();
  private readonly tasks = new Map<string, CustomerProfileTask>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly mergeSuggestions = new Map<string, CustomerProfileMergeSuggestion>();
  private readonly primaryContactConflicts = new Map<string, CustomerProfilePrimaryContactConflict>();
  private readonly entities: LinkedEntities = {
    parentAccounts: new Map(),
    billingAccounts: new Map(),
    branches: new Map(),
    invoices: new Map(),
    payments: new Map(),
    remittances: new Map(),
    exceptions: new Map(),
  };

  saveProfile(profile: CustomerProfile) {
    this.profiles.set(profile.id, profile);
  }

  saveContacts(contacts: CustomerProfileContact[]) {
    for (const contact of contacts) {
      this.contacts.set(contact.id, contact);
    }
  }

  saveTask(task: CustomerProfileTask) {
    this.tasks.set(task.id, task);
  }

  saveApproval(approval: ApprovalRequest) {
    this.approvals.set(approval.id, approval);
  }

  saveMergeSuggestion(suggestion: CustomerProfileMergeSuggestion) {
    this.mergeSuggestions.set(suggestion.id, suggestion);
  }

  savePrimaryContactConflict(conflict: CustomerProfilePrimaryContactConflict) {
    this.primaryContactConflicts.set(conflict.id, conflict);
  }

  ingestEntities(payload: CustomerProfileIngestionPayload) {
    if (payload.hierarchy.parentAccount) {
      this.entities.parentAccounts.set(payload.hierarchy.parentAccount.id, payload.hierarchy.parentAccount);
    }
    if (payload.hierarchy.billingAccount) {
      this.entities.billingAccounts.set(payload.hierarchy.billingAccount.id, payload.hierarchy.billingAccount);
    }
    if (payload.hierarchy.branch) {
      this.entities.branches.set(payload.hierarchy.branch.id, payload.hierarchy.branch);
    }
    for (const invoice of payload.invoices ?? []) {
      this.entities.invoices.set(invoice.id, invoice);
    }
    for (const payment of payload.payments ?? []) {
      this.entities.payments.set(payment.id, payment);
    }
    for (const remittance of payload.remittances ?? []) {
      this.entities.remittances.set(remittance.id, remittance);
    }
    for (const exception of payload.exceptions ?? []) {
      this.entities.exceptions.set(exception.id, exception);
    }
  }

  getProfile(profileId: string) {
    return this.profiles.get(profileId);
  }

  getContactsByProfile(profileId: string) {
    return [...this.contacts.values()].filter((contact) => contact.profileId === profileId);
  }

  getTask(taskId: string) {
    return this.tasks.get(taskId);
  }

  getApproval(approvalId: string) {
    return this.approvals.get(approvalId);
  }

  getMergeSuggestion(suggestionId: string) {
    return this.mergeSuggestions.get(suggestionId);
  }

  getPrimaryContactConflictByProfile(profileId: string) {
    return [...this.primaryContactConflicts.values()].find(
      (conflict) => conflict.customerProfileId === profileId && conflict.status === "pending_review",
    );
  }

  listProfiles() {
    return [...this.profiles.values()];
  }

  listTasks(filter?: { executionType?: CustomerProfileTask["executionType"]; status?: CustomerProfileTask["status"] }) {
    return [...this.tasks.values()].filter((task) => {
      if (filter?.executionType && task.executionType !== filter.executionType) {
        return false;
      }
      if (filter?.status && task.status !== filter.status) {
        return false;
      }
      return true;
    });
  }

  listApprovals() {
    return [...this.approvals.values()];
  }

  listMergeSuggestions() {
    return [...this.mergeSuggestions.values()];
  }

  snapshot(): CustomerProfileMasteringStoreSnapshot {
    return {
      profiles: this.listProfiles(),
      contacts: [...this.contacts.values()],
      tasks: [...this.tasks.values()],
      approvals: [...this.approvals.values()],
      mergeSuggestions: [...this.mergeSuggestions.values()],
      primaryContactConflicts: [...this.primaryContactConflicts.values()],
    };
  }

  getLinkedEntities() {
    return this.entities;
  }
}

export interface CustomerProfileIngestionResult {
  profile: CustomerProfile;
  contacts: CustomerProfileContact[];
  duplicateCandidates: ReturnType<typeof rankDuplicateCandidates>;
  mergeSuggestion?: CustomerProfileMergeSuggestion;
  reviewTask?: CustomerProfileTask;
  approval?: ApprovalRequest;
  primaryContactConflict?: CustomerProfilePrimaryContactConflict;
  primaryContactTask?: CustomerProfileTask;
}

export class CustomerProfileMasteringService {
  private readonly immutableActivityStore = new InMemoryImmutableActivityLogStore();
  private readonly approvalService = new ApprovalRequestService({
    audit: createActivityLogDomainHelpers({
      store: this.immutableActivityStore,
      idGenerator: () => this.nextId("activity"),
      now: () => this.now(),
    }),
    idGenerator: () => this.nextId("approval"),
    now: () => this.now(),
  });

  constructor(
    private readonly deps: {
      store: InMemoryCustomerProfileMasteringStore;
      auditLogger: AuditLogger;
      policy?: Partial<CustomerProfileMasteringPolicy>;
      now?: () => string;
      idGenerator?: () => string;
    },
  ) {}

  async ingest(
    principal: Principal,
    auditContext: AuditContext,
    payload: CustomerProfileIngestionPayload,
  ): Promise<CustomerProfileIngestionResult> {
    this.deps.store.ingestEntities(payload);
    const actor = principalToActor(principal);
    const existingProfiles = this.deps.store
      .listProfiles()
      .filter((profile) => profile.status !== "merged");
    const duplicateCandidates = rankDuplicateCandidates(payload, existingProfiles, this.deps.policy);
    const contacts = materializeProfileContacts({
      profileId: payload.id,
      source: payload.source,
      occurredAt: payload.occurredAt,
      actor,
      contacts: payload.contacts,
      policy: this.deps.policy,
    });
    const draftProfile = createCustomerProfileFromIngestion({
      id: payload.id,
      occurredAt: payload.occurredAt,
      actor,
      payload,
      contacts,
    });

    let persistedProfile = draftProfile;
    let mergeSuggestion: CustomerProfileMergeSuggestion | undefined;
    let reviewTask: CustomerProfileTask | undefined;
    let approval: ApprovalRequest | undefined;

    const bestCandidate = duplicateCandidates[0];
    const policy = mergePolicy(this.deps.policy);

    if (bestCandidate && bestCandidate.breakdown.confidence >= policy.duplicate.autoMergeMinConfidence) {
      const targetContacts = materializeProfileContacts({
        profileId: bestCandidate.profile.id,
        source: payload.source,
        occurredAt: payload.occurredAt,
        actor,
        contacts: payload.contacts,
        existingContacts: this.deps.store.getContactsByProfile(bestCandidate.profile.id),
        policy: this.deps.policy,
      });
      const merged = mergeCustomerProfileRecords({
        target: bestCandidate.profile,
        source: { ...draftProfile, status: "merged", mergedIntoProfileId: bestCandidate.profile.id },
        contacts: targetContacts,
        occurredAt: payload.occurredAt,
        actor,
      });
      persistedProfile = merged.mergedTarget;
      this.deps.store.saveProfile(merged.mergedTarget);
      this.deps.store.saveProfile(merged.mergedSource);
      this.deps.store.saveContacts(targetContacts);
      mergeSuggestion = {
        id: this.nextId("merge_suggestion"),
        ...entityMetadata(payload.occurredAt, actor),
        sourceProfileId: merged.mergedSource.id,
        targetProfileId: merged.mergedTarget.id,
        confidence: bestCandidate.breakdown.confidence,
        status: "auto_merged",
        threshold: policy.duplicate.autoMergeMinConfidence,
        autoMergeEligible: true,
        reasons: bestCandidate.breakdown.reasons,
        signals: bestCandidate.breakdown.signals,
        metadata: { source: payload.source },
      };
      this.deps.store.saveMergeSuggestion(mergeSuggestion);
      await this.audit("customer_profile.merge_auto_applied", persistedProfile.id, auditContext, {
        confidence: bestCandidate.breakdown.confidence,
        targetProfileId: bestCandidate.profile.id,
      });
    } else {
      if (bestCandidate) {
        persistedProfile = { ...draftProfile, status: "pending_review" };
      }
      this.deps.store.saveProfile(persistedProfile);
      this.deps.store.saveContacts(
        contacts.map((contact) => ({ ...contact, profileId: persistedProfile.id })),
      );

      if (bestCandidate) {
        reviewTask = createCustomerProfileTask({
          id: this.nextId("task"),
          customerProfileId: persistedProfile.id,
          executionType: "human",
          taskType: "review_duplicate_customer",
          sourceObjectType: "customer_profile_merge_suggestion",
          sourceObjectId: persistedProfile.id,
          occurredAt: payload.occurredAt,
          actor,
          ownerRole: "ar_manager",
          summary: "Human review required for a duplicate customer suggestion below auto-merge threshold.",
          metadata: { confidence: bestCandidate.breakdown.confidence },
        });
        this.deps.store.saveTask(reviewTask);
        approval = this.approvalService.submit(
          principal,
          this.approvalService.create(principal, {
            requestType: "customer_profile_merge_review",
            assigneeRole: "ar_manager",
            payload: {
              summary: "Review duplicate customer merge suggestion.",
              sourceProfileId: persistedProfile.id,
              targetProfileId: bestCandidate.profile.id,
            },
            policyContext: {
              reasonCodes: ["duplicate_customer_below_auto_merge_threshold"],
              confidence: bestCandidate.breakdown.confidence,
            },
          }),
        );
        this.deps.store.saveApproval(approval);
        mergeSuggestion = {
          id: this.nextId("merge_suggestion"),
          ...entityMetadata(payload.occurredAt, actor),
          sourceProfileId: persistedProfile.id,
          targetProfileId: bestCandidate.profile.id,
          confidence: bestCandidate.breakdown.confidence,
          status: "pending_review",
          threshold: policy.duplicate.autoMergeMinConfidence,
          autoMergeEligible: false,
          reasons: bestCandidate.breakdown.reasons,
          signals: bestCandidate.breakdown.signals,
          reviewTaskId: reviewTask.id,
          approvalRequestId: approval.id,
          metadata: { source: payload.source },
        };
        this.deps.store.saveMergeSuggestion(mergeSuggestion);
        await this.audit("customer_profile.merge_suggested", persistedProfile.id, auditContext, {
          confidence: bestCandidate.breakdown.confidence,
          targetProfileId: bestCandidate.profile.id,
          reviewTaskId: reviewTask.id,
        });
      }
    }

    await this.audit("customer_profile.ingested", persistedProfile.id, auditContext, {
      source: payload.source,
      linkedInvoiceCount: payload.invoices?.length ?? 0,
      linkedPaymentCount: payload.payments?.length ?? 0,
      branchKnown: Boolean(payload.hierarchy.branch?.id),
    });

    const profileContacts = this.deps.store.getContactsByProfile(persistedProfile.id);
    let primaryContactConflict: CustomerProfilePrimaryContactConflict | undefined;
    let primaryContactTask: CustomerProfileTask | undefined;

    const conflict = detectPrimaryContactConflict({
      profile: persistedProfile,
      contacts: profileContacts,
      occurredAt: payload.occurredAt,
      actor,
      idGenerator: () => this.nextId("primary_conflict"),
    });

    if (conflict) {
      primaryContactTask = createCustomerProfileTask({
        id: this.nextId("task"),
        customerProfileId: persistedProfile.id,
        executionType: "human",
        taskType: "approve_primary_contact_change",
        sourceObjectType: "customer_profile_primary_contact_conflict",
        sourceObjectId: conflict.id,
        occurredAt: payload.occurredAt,
        actor,
        ownerRole: "ar_manager",
        summary: "Human confirmation required before changing the primary customer contact.",
      });
      this.deps.store.saveTask(primaryContactTask);
      const primaryApproval = this.approvalService.submit(
        principal,
        this.approvalService.create(principal, {
          requestType: "customer_profile_primary_contact_change",
          assigneeRole: "ar_manager",
          payload: {
            summary: "Approve primary contact change.",
            customerProfileId: persistedProfile.id,
            suggestedPrimaryContactId: conflict.suggestedPrimaryContactId,
          },
          policyContext: {
            reasonCodes: ["primary_contact_change_requires_confirmation"],
          },
        }),
      );
      this.deps.store.saveApproval(primaryApproval);
      primaryContactConflict = {
        ...conflict,
        taskId: primaryContactTask.id,
        approvalRequestId: primaryApproval.id,
      };
      this.deps.store.savePrimaryContactConflict(primaryContactConflict);
      await this.audit("customer_profile.primary_contact_conflict_detected", persistedProfile.id, auditContext, {
        suggestedPrimaryContactId: conflict.suggestedPrimaryContactId,
      });
    }

    return {
      profile: persistedProfile,
      contacts: this.deps.store.getContactsByProfile(persistedProfile.id),
      duplicateCandidates,
      ...(mergeSuggestion ? { mergeSuggestion } : {}),
      ...(reviewTask ? { reviewTask } : {}),
      ...(approval ? { approval } : {}),
      ...(primaryContactConflict ? { primaryContactConflict } : {}),
      ...(primaryContactTask ? { primaryContactTask } : {}),
    };
  }

  async approveMergeSuggestion(
    principal: Principal,
    auditContext: AuditContext,
    suggestionId: string,
  ) {
    const suggestion = this.requireMergeSuggestion(suggestionId);
    const source = this.requireProfile(suggestion.sourceProfileId);
    const target = this.requireProfile(suggestion.targetProfileId);
    const targetContacts = materializeProfileContacts({
      profileId: target.id,
      source: source.sourceKinds[source.sourceKinds.length - 1] ?? "spreadsheet_fallback",
      occurredAt: auditContext.occurredAt,
      actor: principalToActor(principal),
      contacts: this.deps.store.getContactsByProfile(source.id).map((contact) => ({
        id: contact.id,
        fullName: contact.fullName,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        isPrimary: contact.isPrimaryCandidate,
        isVerified: contact.isVerified,
        allowAutoSend: contact.allowAutoSend,
        recentSuccessfulResponses: contact.recentSuccessfulResponses,
      })),
      existingContacts: this.deps.store.getContactsByProfile(target.id),
      policy: this.deps.policy,
    });

    const merged = mergeCustomerProfileRecords({
      target,
      source,
      contacts: targetContacts,
      occurredAt: auditContext.occurredAt,
      actor: principalToActor(principal),
    });

    this.deps.store.saveProfile(merged.mergedTarget);
    this.deps.store.saveProfile(merged.mergedSource);
    this.deps.store.saveContacts(targetContacts);
    const completedSuggestion: CustomerProfileMergeSuggestion = {
      ...suggestion,
      status: "approved",
      ...entityVersionBump(suggestion, auditContext.occurredAt, principal),
    };
    this.deps.store.saveMergeSuggestion(completedSuggestion);
    if (suggestion.reviewTaskId) {
      const task = this.deps.store.getTask(suggestion.reviewTaskId);
      if (task) {
        this.deps.store.saveTask(
          appendTaskAuditEntry(task, {
            occurredAt: auditContext.occurredAt,
            actor: principalToActor(principal),
            action: "task.completed",
            summary: "Duplicate merge suggestion approved.",
            nextStatus: "completed",
          }),
        );
      }
    }
    if (suggestion.approvalRequestId) {
      const approval = this.deps.store.getApproval(suggestion.approvalRequestId);
      if (approval) {
        this.deps.store.saveApproval(
          this.approvalService.decide(principal, approval, "approved"),
        );
      }
    }
    await this.audit("customer_profile.merge_approved", target.id, auditContext, {
      sourceProfileId: source.id,
      suggestionId,
    });
    return { suggestion: completedSuggestion, mergedTarget: merged.mergedTarget };
  }

  async rejectMergeSuggestion(
    principal: Principal,
    auditContext: AuditContext,
    suggestionId: string,
  ) {
    const suggestion = this.requireMergeSuggestion(suggestionId);
    const source = this.requireProfile(suggestion.sourceProfileId);
    const rejectedSuggestion: CustomerProfileMergeSuggestion = {
      ...suggestion,
      status: "rejected",
      ...entityVersionBump(suggestion, auditContext.occurredAt, principal),
    };
    const reactivatedSource: CustomerProfile = {
      ...source,
      status: "active",
      ...entityVersionBump(source, auditContext.occurredAt, principal),
    };
    this.deps.store.saveMergeSuggestion(rejectedSuggestion);
    this.deps.store.saveProfile(reactivatedSource);
    if (suggestion.reviewTaskId) {
      const task = this.deps.store.getTask(suggestion.reviewTaskId);
      if (task) {
        this.deps.store.saveTask(
          appendTaskAuditEntry(task, {
            occurredAt: auditContext.occurredAt,
            actor: principalToActor(principal),
            action: "task.completed",
            summary: "Duplicate merge suggestion rejected; profile stays separate.",
            nextStatus: "completed",
          }),
        );
      }
    }
    if (suggestion.approvalRequestId) {
      const approval = this.deps.store.getApproval(suggestion.approvalRequestId);
      if (approval) {
        this.deps.store.saveApproval(
          this.approvalService.decide(principal, approval, "rejected"),
        );
      }
    }
    await this.audit("customer_profile.merge_rejected", source.id, auditContext, {
      suggestionId,
      targetProfileId: suggestion.targetProfileId,
    });
    return { suggestion: rejectedSuggestion, profile: reactivatedSource };
  }

  async resolvePrimaryContactConflict(
    principal: Principal,
    auditContext: AuditContext,
    profileId: string,
    selectedContactId: string,
  ) {
    const profile = this.requireProfile(profileId);
    const contacts = this.deps.store.getContactsByProfile(profileId);
    const selectedContact = contacts.find((contact) => contact.id === selectedContactId);
    if (!selectedContact) {
      throw new Error(`Primary contact "${selectedContactId}" was not found on profile "${profileId}".`);
    }

    const conflict = this.deps.store.getPrimaryContactConflictByProfile(profileId);
    if (!conflict) {
      throw new Error(`No primary contact conflict is pending for profile "${profileId}".`);
    }

    const updatedContacts = contacts.map((contact) => ({
      ...contact,
      ...entityVersionBump(contact, auditContext.occurredAt, principal),
      isPrimaryEmail: contact.id === selectedContactId,
      isPrimaryCandidate: contact.id === selectedContactId || contact.isPrimaryPhone,
    })) as CustomerProfileContact[];
    const updatedProfile = compactOptionalObject<CustomerProfile>({
      ...profile,
      ...entityVersionBump(profile, auditContext.occurredAt, principal),
      primaryContactId: selectedContact.id,
      ...(selectedContact.email ? { primaryContactEmail: selectedContact.email } : {}),
      ...(selectedContact.phone ?? profile.primaryContactPhone
        ? { primaryContactPhone: selectedContact.phone ?? profile.primaryContactPhone }
        : {}),
    });
    const resolvedConflict: CustomerProfilePrimaryContactConflict = {
      ...conflict,
      ...entityVersionBump(conflict, auditContext.occurredAt, principal),
      status: "resolved",
    };

    this.deps.store.saveProfile(updatedProfile);
    this.deps.store.saveContacts(updatedContacts);
    this.deps.store.savePrimaryContactConflict(resolvedConflict);

    const task = this.deps.store.getTask(conflict.taskId);
    if (task) {
      this.deps.store.saveTask(
        appendTaskAuditEntry(task, {
          occurredAt: auditContext.occurredAt,
          actor: principalToActor(principal),
          action: "task.completed",
          summary: "Primary contact conflict resolved.",
          nextStatus: "completed",
        }),
      );
    }

    if (conflict.approvalRequestId) {
      const approval = this.deps.store.getApproval(conflict.approvalRequestId);
      if (approval) {
        this.deps.store.saveApproval(this.approvalService.decide(principal, approval, "approved"));
      }
    }

    await this.audit("customer_profile.primary_contact_resolved", profileId, auditContext, {
      selectedContactId,
    });
    return { profile: updatedProfile, contacts: updatedContacts, conflict: resolvedConflict };
  }

  getUnifiedProfile(profileId: string): UnifiedCustomerProfileView {
    const profile = this.requireProfile(profileId);
    const entities = this.deps.store.getLinkedEntities();
    return buildUnifiedCustomerProfileView({
      profile,
      contacts: this.deps.store.getContactsByProfile(profileId),
      invoices: profile.linkedInvoiceIds
        .map((id) => entities.invoices.get(id))
        .filter(isDefined),
      payments: profile.linkedPaymentIds
        .map((id) => entities.payments.get(id))
        .filter(isDefined),
      remittances: profile.linkedRemittanceIds
        .map((id) => entities.remittances.get(id))
        .filter(isDefined),
      exceptions: profile.linkedExceptionIds
        .map((id) => entities.exceptions.get(id))
        .filter(isDefined),
      approvals: profile.linkedApprovalRequestIds
        .map((id) => this.deps.store.getApproval(id))
        .filter(isDefined),
      tasks: this.deps.store.listTasks().filter((task) => task.customerProfileId === profileId),
      mergeSuggestions: this.deps.store
        .listMergeSuggestions()
        .filter(
          (suggestion) =>
            suggestion.sourceProfileId === profileId || suggestion.targetProfileId === profileId,
        ),
      primaryContactConflict: this.deps.store.getPrimaryContactConflictByProfile(profileId),
      parentAccount: profile.parentAccountId
        ? entities.parentAccounts.get(profile.parentAccountId)
        : undefined,
      billingAccount: profile.billingAccountId
        ? entities.billingAccounts.get(profile.billingAccountId)
        : undefined,
      branches: profile.branchIds
        .map((id) => entities.branches.get(id))
        .filter(isDefined),
    });
  }

  listCustomerIndex(): CustomerIndexReadModel[] {
    return this.deps.store
      .listProfiles()
      .filter((profile) => profile.status !== "merged")
      .map((profile) => this.getUnifiedProfile(profile.id).customerIndexEntry)
      .sort((left, right) => right.openAmountCents - left.openAmountCents);
  }

  getCustomerProfileReadModel(profileId: string): CustomerProfileAggregateReadModel {
    return this.getUnifiedProfile(profileId).customerProfile;
  }

  listReviewQueue(): CustomerProfileReviewQueueItem[] {
    return this.deps.store
      .listMergeSuggestions()
      .filter((suggestion) => suggestion.status === "pending_review")
      .map((suggestion) => ({
        mergeSuggestion: suggestion,
        sourceProfile: this.deps.store.getProfile(suggestion.sourceProfileId),
        targetProfile: this.deps.store.getProfile(suggestion.targetProfileId),
        ...(suggestion.reviewTaskId ? { task: this.deps.store.getTask(suggestion.reviewTaskId) } : {}),
        ...(suggestion.approvalRequestId
          ? { approval: this.deps.store.getApproval(suggestion.approvalRequestId) }
          : {}),
      }));
  }

  listTasks(filter?: { executionType?: CustomerProfileTask["executionType"]; status?: CustomerProfileTask["status"] }) {
    return this.deps.store.listTasks(filter);
  }

  getActivityEntries() {
    return this.immutableActivityStore.entries;
  }

  private requireProfile(profileId: string) {
    const profile = this.deps.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`Customer profile "${profileId}" was not found.`);
    }
    return profile;
  }

  private requireMergeSuggestion(suggestionId: string) {
    const suggestion = this.deps.store.getMergeSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Merge suggestion "${suggestionId}" was not found.`);
    }
    return suggestion;
  }

  private nextId(prefix: string) {
    return this.deps.idGenerator?.() ?? `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  private async audit(
    action: string,
    entityId: string,
    context: AuditContext,
    metadata: Record<string, string | number | boolean | null | undefined>,
  ) {
    const normalizedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    ) as Record<string, string | number | boolean | null>;
    await this.deps.auditLogger.log(context, {
      action,
      entityId,
      entityType: "customer_profile",
      metadata: normalizedMetadata,
    });
  }
}

function mergePolicy(policy?: Partial<CustomerProfileMasteringPolicy>) {
  const defaults = defaultCustomerProfileMasteringPolicy();
  return {
    ...defaults,
    ...policy,
    duplicate: {
      ...defaults.duplicate,
      ...(policy?.duplicate ?? {}),
      weights: {
        ...defaults.duplicate.weights,
        ...(policy?.duplicate?.weights ?? {}),
      },
    },
  };
}

function principalToActor(principal: Principal) {
  return {
    actorId: principal.id,
    actorRole: principal.roles[0] ?? "user",
  } as const;
}

function entityMetadata(occurredAt: string, actor: ReturnType<typeof principalToActor>) {
  return {
    tenantId: "default",
    version: 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    createdByActorId: actor.actorId,
    createdByActorRole: actor.actorRole,
    updatedByActorId: actor.actorId,
    updatedByActorRole: actor.actorRole,
  };
}

function entityVersionBump<T extends { version?: number }>(
  entity: T,
  occurredAt: string,
  principal: Principal,
) {
  const actorRole = (principal.roles[0] ?? "user") as ActorRole;
  return {
    version: (entity.version ?? 1) + 1,
    updatedAt: occurredAt,
    updatedByActorId: principal.id,
    updatedByActorRole: actorRole,
  };
}

function compactOptionalObject<T>(value: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
