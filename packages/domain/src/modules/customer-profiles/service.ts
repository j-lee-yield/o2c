import {
  createEntityMetadata,
  evolveEntityMetadata,
  type ActorContext,
} from "../../shared/types.js";
import {
  buildCustomerProfileReadModel,
  type CustomerProfileAggregateInput,
} from "../learning-layer/customer-profiles.js";
import type {
  BillingAccount,
  Branch,
  Contact,
  ParentAccount,
} from "../accounts/schema.js";
import type { ApprovalRequest } from "../approvals/schema.js";
import type { DomainException } from "../exceptions/schema.js";
import type { CustomerInvoice } from "../invoices/schema.js";
import type { Payment } from "../payments/schema.js";
import type { Remittance } from "../remittances/schema.js";
import type {
  CustomerCompletenessCheck,
  CustomerCompletenessCheckItem,
  CustomerCreditProfile,
  CustomerProfile,
  CustomerProfileAggregateReadModel,
  CustomerProfileCandidateContactInput,
  CustomerProfileContact,
  CustomerProfileIngestionPayload,
  CustomerProfileMasteringPolicy,
  CustomerProfileMergeSignal,
  CustomerProfileNote,
  CustomerProfilePrimaryContactConflict,
  CustomerProfileTab,
  CustomerProfileTask,
  CustomerIndexReadModel,
  DuplicateScoreBreakdown,
  DuplicateScoreCandidate,
  UnifiedCustomerProfileView,
} from "./schema.js";
import {
  defaultCustomerProfileMasteringPolicy,
} from "./schema.js";

export function scoreCustomerProfileDuplicate(
  incoming: CustomerProfileIngestionPayload,
  existing: CustomerProfile,
  policy: Partial<CustomerProfileMasteringPolicy> = {},
): DuplicateScoreBreakdown {
  const mergedPolicy = mergeCustomerProfilePolicy(policy);
  const signals: CustomerProfileMergeSignal[] = [];
  const reasons: string[] = [];

  const incomingLegal = normalizeText(incoming.legalEntityName ?? incoming.billingAccountName);
  const existingLegal = normalizeText(existing.legalEntityName ?? existing.canonicalName);
  const incomingBilling = normalizeText(
    incoming.hierarchy.billingAccount?.displayName ?? incoming.billingAccountName,
  );
  const existingBilling = normalizeText(existing.billingAccountName);

  if (incoming.taxId && existing.taxId && normalizeText(incoming.taxId) === normalizeText(existing.taxId)) {
    signals.push({
      signal: "tax_id_exact",
      weight: mergedPolicy.duplicate.weights.taxIdExact,
      matchedValue: incoming.taxId,
      exact: true,
    });
    reasons.push("Matching tax identifier.");
  }

  if (incomingLegal && existingLegal) {
    if (incomingLegal === existingLegal) {
      const matchedValue = incoming.legalEntityName ?? incoming.billingAccountName;
      signals.push({
        signal: "legal_entity_exact",
        weight: mergedPolicy.duplicate.weights.legalEntityExact,
        ...(matchedValue ? { matchedValue } : {}),
        exact: true,
      });
      reasons.push("Exact legal entity name match.");
    } else {
      const similarity = similarityRatio(incomingLegal, existingLegal);
      if (similarity >= 0.75) {
        signals.push({
          signal: "legal_entity_fuzzy",
          weight: roundMetric(mergedPolicy.duplicate.weights.legalEntityFuzzy * similarity),
          matchedValue: `${roundMetric(similarity * 100)}%`,
          exact: false,
        });
        reasons.push("High legal entity name similarity.");
      }
    }
  }

  if (incomingBilling && existingBilling) {
    if (incomingBilling === existingBilling) {
      const matchedValue =
        incoming.hierarchy.billingAccount?.displayName ?? incoming.billingAccountName;
      signals.push({
        signal: "billing_name_exact",
        weight: mergedPolicy.duplicate.weights.billingNameExact,
        ...(matchedValue ? { matchedValue } : {}),
        exact: true,
      });
      reasons.push("Exact billing account name match.");
    } else {
      const similarity = similarityRatio(incomingBilling, existingBilling);
      if (similarity >= 0.75) {
        signals.push({
          signal: "billing_name_fuzzy",
          weight: roundMetric(mergedPolicy.duplicate.weights.billingNameFuzzy * similarity),
          matchedValue: `${roundMetric(similarity * 100)}%`,
          exact: false,
        });
        reasons.push("High billing account name similarity.");
      }
    }
  }

  const incomingDomains = collectEmailDomains(incoming.contacts);
  const existingDomains = new Set(
    existing.primaryContactEmail ? [extractEmailDomain(existing.primaryContactEmail)] : [],
  );
  for (const domain of incomingDomains) {
    if (existingDomains.has(domain)) {
      signals.push({
        signal: "email_domain_overlap",
        weight: mergedPolicy.duplicate.weights.emailDomainOverlap,
        matchedValue: domain,
        exact: true,
      });
      reasons.push("Email domain overlap detected.");
      break;
    }
  }

  const incomingPhones = new Set(
    incoming.contacts.map((contact) => normalizePhone(contact.phone)).filter(Boolean),
  );
  if (
    existing.primaryContactPhone &&
    incomingPhones.has(normalizePhone(existing.primaryContactPhone))
  ) {
    signals.push({
      signal: "phone_overlap",
      weight: mergedPolicy.duplicate.weights.phoneOverlap,
      matchedValue: existing.primaryContactPhone,
      exact: true,
    });
    reasons.push("Phone number overlap detected.");
  }

  const incomingBranches = new Set([
    normalizeText(incoming.hierarchy.branch?.name),
    normalizeText(incoming.hierarchy.branch?.code),
  ].filter(Boolean));
  if (
    existing.branchNames.some((branchName) => incomingBranches.has(normalizeText(branchName)))
  ) {
    signals.push({
      signal: "branch_overlap",
      weight: mergedPolicy.duplicate.weights.branchOverlap,
      exact: true,
    });
    reasons.push("Branch overlap detected.");
  }

  const incomingLinkedIds = new Set([
    ...(incoming.invoices ?? []).map((invoice) => invoice.id),
    ...(incoming.payments ?? []).map((payment) => payment.id),
    ...(incoming.remittances ?? []).map((remittance) => remittance.id),
  ]);
  const existingLinkedIds = new Set([
    ...existing.linkedInvoiceIds,
    ...existing.linkedPaymentIds,
    ...existing.linkedRemittanceIds,
  ]);
  if ([...incomingLinkedIds].some((id) => existingLinkedIds.has(id))) {
    signals.push({
      signal: "historical_linkage_overlap",
      weight: mergedPolicy.duplicate.weights.linkageOverlap,
      exact: true,
    });
    reasons.push("Historical invoice or payment linkage overlaps.");
  }

  const confidence = roundMetric(
    Math.min(1, signals.reduce((sum, signal) => sum + signal.weight, 0)),
  );

  return {
    confidence,
    reasons,
    signals,
  };
}

export function rankDuplicateCandidates(
  incoming: CustomerProfileIngestionPayload,
  existingProfiles: CustomerProfile[],
  policy: Partial<CustomerProfileMasteringPolicy> = {},
): DuplicateScoreCandidate[] {
  return existingProfiles
    .map((profile) => ({
      profile,
      breakdown: scoreCustomerProfileDuplicate(incoming, profile, policy),
    }))
    .filter(
      (candidate) =>
        candidate.breakdown.confidence >= mergeCustomerProfilePolicy(policy).duplicate.reviewMinConfidence,
    )
    .sort((left, right) => right.breakdown.confidence - left.breakdown.confidence);
}

export function materializeProfileContacts(input: {
  profileId: string;
  source: CustomerProfileIngestionPayload["source"];
  occurredAt: string;
  actor: ActorContext;
  contacts: CustomerProfileCandidateContactInput[];
  existingContacts?: CustomerProfileContact[];
  policy?: Partial<CustomerProfileMasteringPolicy>;
}): CustomerProfileContact[] {
  const mergedPolicy = mergeCustomerProfilePolicy(input.policy);
  const contactsByIdentity = new Map<string, CustomerProfileContact>();

  for (const existingContact of input.existingContacts ?? []) {
    contactsByIdentity.set(contactIdentity(existingContact), existingContact);
  }

  for (const candidate of input.contacts) {
    const provisional = createCustomerProfileContact({
      profileId: input.profileId,
      source: input.source,
      occurredAt: input.occurredAt,
      actor: input.actor,
      contact: candidate,
      policy: mergedPolicy,
    });
    const identity = contactIdentity(provisional);
    const existing = contactsByIdentity.get(identity);
    contactsByIdentity.set(
      identity,
      existing
        ? mergeCustomerProfileContact({
            existing,
            incoming: provisional,
            source: input.source,
            occurredAt: input.occurredAt,
            actor: input.actor,
            policy: mergedPolicy,
          })
        : provisional,
    );
  }

  const contacts = [...contactsByIdentity.values()];
  const selection = selectPrimaryContacts(contacts);
  return contacts.map((contact) => ({
    ...contact,
    isPrimaryEmail: selection.primaryEmailContactId === contact.id,
    isPrimaryPhone: selection.primaryPhoneContactId === contact.id,
    isPrimaryCandidate:
      selection.primaryEmailContactId === contact.id ||
      selection.primaryPhoneContactId === contact.id,
  }));
}

export function selectPrimaryContacts(contacts: CustomerProfileContact[]) {
  const emailCandidates = contacts
    .filter((contact) => Boolean(contact.email))
    .sort(compareContactsForPrimarySelection);
  const phoneCandidates = contacts
    .filter((contact) => Boolean(contact.phone))
    .sort(compareContactsForPrimarySelection);

  return {
    primaryEmailContactId: emailCandidates[0]?.id,
    primaryPhoneContactId: phoneCandidates[0]?.id,
  };
}

export function detectPrimaryContactConflict(input: {
  profile: CustomerProfile;
  contacts: CustomerProfileContact[];
  occurredAt: string;
  actor: ActorContext;
  idGenerator: () => string;
}): CustomerProfilePrimaryContactConflict | undefined {
  const selection = selectPrimaryContacts(input.contacts);
  if (!selection.primaryEmailContactId || !input.profile.primaryContactId) {
    return undefined;
  }

  if (selection.primaryEmailContactId === input.profile.primaryContactId) {
    return undefined;
  }

  const existingPrimary = input.contacts.find((contact) => contact.id === input.profile.primaryContactId);
  const suggestedPrimary = input.contacts.find(
    (contact) => contact.id === selection.primaryEmailContactId,
  );
  if (!suggestedPrimary || !existingPrimary) {
    return undefined;
  }

  return {
    id: input.idGenerator(),
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    customerProfileId: input.profile.id,
    existingPrimaryContactId: existingPrimary.id,
    suggestedPrimaryContactId: suggestedPrimary.id,
    status: "pending_review",
    reasonSummary:
      "A new verified contact outranks the existing primary contact, so a human must confirm the change.",
    taskId: "",
    metadata: {},
  };
}

export function createCustomerProfileTask(input: {
  id: string;
  customerProfileId: string;
  executionType: CustomerProfileTask["executionType"];
  taskType: CustomerProfileTask["taskType"];
  sourceObjectType: string;
  sourceObjectId: string;
  occurredAt: string;
  actor: ActorContext;
  dueAt?: string;
  slaAt?: string;
  ownerId?: string;
  ownerRole?: CustomerProfileTask["ownerRole"];
  summary: string;
  metadata?: Record<string, unknown>;
}): CustomerProfileTask {
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    customerProfileId: input.customerProfileId,
    executionType: input.executionType,
    taskType: input.taskType,
    status: "open",
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}),
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.slaAt ? { slaAt: input.slaAt } : {}),
    sourceObjectType: input.sourceObjectType,
    sourceObjectId: input.sourceObjectId,
    auditTrail: [
      {
        occurredAt: input.occurredAt,
        action: "task.created",
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        summary: input.summary,
      },
    ],
    metadata: input.metadata ?? {},
  };
}

export function appendTaskAuditEntry(
  task: CustomerProfileTask,
  input: {
    occurredAt: string;
    actor: ActorContext;
    action: string;
    summary: string;
    nextStatus?: CustomerProfileTask["status"];
  },
): CustomerProfileTask {
  return {
    ...task,
    ...evolveEntityMetadata(task, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    ...(input.nextStatus ? { status: input.nextStatus } : {}),
    auditTrail: [
      ...task.auditTrail,
      {
        occurredAt: input.occurredAt,
        action: input.action,
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        summary: input.summary,
      },
    ],
  };
}

export function createCustomerProfileFromIngestion(input: {
  id: string;
  occurredAt: string;
  actor: ActorContext;
  payload: CustomerProfileIngestionPayload;
  contacts: CustomerProfileContact[];
}): CustomerProfile {
  const primarySelection = selectPrimaryContacts(input.contacts);
  const primaryEmail = input.contacts.find(
    (contact) => contact.id === primarySelection.primaryEmailContactId,
  )?.email;
  const primaryPhone = input.contacts.find(
    (contact) => contact.id === primarySelection.primaryPhoneContactId,
  )?.phone;
  return {
    id: input.id,
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    status: "active",
    canonicalName:
      input.payload.billingAccountName ??
      input.payload.hierarchy.billingAccount?.displayName ??
      input.payload.legalEntityName ??
      input.payload.hierarchy.parentAccount?.name ??
      "Unnamed customer profile",
    ...(input.payload.legalEntityName ? { legalEntityName: input.payload.legalEntityName } : {}),
    ...(input.payload.taxId ? { taxId: input.payload.taxId } : {}),
    ...(input.payload.hierarchy.parentAccount?.id
      ? { parentAccountId: input.payload.hierarchy.parentAccount.id }
      : {}),
    ...(input.payload.hierarchy.parentAccount?.name
      ? { parentAccountName: input.payload.hierarchy.parentAccount.name }
      : {}),
    ...(input.payload.hierarchy.billingAccount?.id
      ? { billingAccountId: input.payload.hierarchy.billingAccount.id }
      : {}),
    ...(input.payload.hierarchy.billingAccount?.displayName
      ? { billingAccountName: input.payload.hierarchy.billingAccount.displayName }
    : input.payload.billingAccountName
        ? { billingAccountName: input.payload.billingAccountName }
        : input.payload.legalEntityName
          ? { billingAccountName: input.payload.legalEntityName }
        : {}),
    branchIds: input.payload.hierarchy.branch?.id ? [input.payload.hierarchy.branch.id] : [],
    branchNames: input.payload.hierarchy.branch?.name ? [input.payload.hierarchy.branch.name] : [],
    ...(primarySelection.primaryEmailContactId
      ? { primaryContactId: primarySelection.primaryEmailContactId }
      : {}),
    ...(primaryEmail ? { primaryContactEmail: primaryEmail } : {}),
    ...(primaryPhone ? { primaryContactPhone: primaryPhone } : {}),
    contactIds: input.contacts.map((contact) => contact.id),
    linkedInvoiceIds: (input.payload.invoices ?? []).map((invoice) => invoice.id),
    linkedPaymentIds: (input.payload.payments ?? []).map((payment) => payment.id),
    linkedRemittanceIds: (input.payload.remittances ?? []).map((remittance) => remittance.id),
    linkedExceptionIds: (input.payload.exceptions ?? []).map((exception) => exception.id),
    linkedApprovalRequestIds: (input.payload.approvals ?? []).map((approval) => approval.id),
    linkedTaskIds: (input.payload.tasks ?? []).map((task) => task.id),
    sourceKinds: [input.payload.source],
    ...(input.payload.memorySummary ? { memorySummary: input.payload.memorySummary } : {}),
    metadata: input.payload.metadata ?? {},
  };
}

export function mergeCustomerProfileRecords(input: {
  target: CustomerProfile;
  source: CustomerProfile;
  contacts: CustomerProfileContact[];
  occurredAt: string;
  actor: ActorContext;
}): { mergedTarget: CustomerProfile; mergedSource: CustomerProfile } {
  const selection = selectPrimaryContacts(input.contacts);
  const primaryEmail = input.contacts.find((contact) => contact.id === selection.primaryEmailContactId)?.email;
  const primaryPhone = input.contacts.find((contact) => contact.id === selection.primaryPhoneContactId)?.phone;
  const preferredLegalEntityName = choosePreferredString(
    input.target.legalEntityName,
    input.source.legalEntityName,
  );
  const preferredTaxId = choosePreferredString(input.target.taxId, input.source.taxId);
  const preferredParentAccountId = choosePreferredString(
    input.target.parentAccountId,
    input.source.parentAccountId,
  );
  const preferredParentAccountName = choosePreferredString(
    input.target.parentAccountName,
    input.source.parentAccountName,
  );
  const preferredBillingAccountId = choosePreferredString(
    input.target.billingAccountId,
    input.source.billingAccountId,
  );
  const preferredBillingAccountName = choosePreferredString(
    input.target.billingAccountName,
    input.source.billingAccountName,
  );

  const mergedTarget = compactOptionalObject({
    ...input.target,
    ...evolveEntityMetadata(input.target, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    canonicalName: choosePreferredString(
      input.target.canonicalName,
      input.source.canonicalName,
    ) ?? input.target.canonicalName,
    ...(preferredLegalEntityName ? { legalEntityName: preferredLegalEntityName } : {}),
    ...(preferredTaxId ? { taxId: preferredTaxId } : {}),
    ...(preferredParentAccountId ? { parentAccountId: preferredParentAccountId } : {}),
    ...(preferredParentAccountName ? { parentAccountName: preferredParentAccountName } : {}),
    ...(preferredBillingAccountId ? { billingAccountId: preferredBillingAccountId } : {}),
    ...(preferredBillingAccountName ? { billingAccountName: preferredBillingAccountName } : {}),
    branchIds: uniqueValues([...input.target.branchIds, ...input.source.branchIds]),
    branchNames: uniqueValues([...input.target.branchNames, ...input.source.branchNames]),
    ...(selection.primaryEmailContactId ? { primaryContactId: selection.primaryEmailContactId } : {}),
    ...(primaryEmail ? { primaryContactEmail: primaryEmail } : {}),
    ...(primaryPhone ? { primaryContactPhone: primaryPhone } : {}),
    contactIds: uniqueValues([...input.target.contactIds, ...input.source.contactIds]),
    linkedInvoiceIds: uniqueValues([
      ...input.target.linkedInvoiceIds,
      ...input.source.linkedInvoiceIds,
    ]),
    linkedPaymentIds: uniqueValues([
      ...input.target.linkedPaymentIds,
      ...input.source.linkedPaymentIds,
    ]),
    linkedRemittanceIds: uniqueValues([
      ...input.target.linkedRemittanceIds,
      ...input.source.linkedRemittanceIds,
    ]),
    linkedExceptionIds: uniqueValues([
      ...input.target.linkedExceptionIds,
      ...input.source.linkedExceptionIds,
    ]),
    linkedApprovalRequestIds: uniqueValues([
      ...input.target.linkedApprovalRequestIds,
      ...input.source.linkedApprovalRequestIds,
    ]),
    linkedTaskIds: uniqueValues([...input.target.linkedTaskIds, ...input.source.linkedTaskIds]),
    sourceKinds: uniqueValues([...input.target.sourceKinds, ...input.source.sourceKinds]),
    memorySummary: input.source.memorySummary ?? input.target.memorySummary,
    metadata: {
      ...input.target.metadata,
      ...input.source.metadata,
      mergedProfileIds: uniqueValues([
        ...(Array.isArray(input.target.metadata.mergedProfileIds)
          ? input.target.metadata.mergedProfileIds.filter(isString)
          : []),
        input.source.id,
      ]),
    },
  }) as CustomerProfile;

  const mergedSource: CustomerProfile = {
    ...input.source,
    ...evolveEntityMetadata(input.source, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    status: "merged",
    mergedIntoProfileId: input.target.id,
  };

  return { mergedTarget, mergedSource };
}

export function buildUnifiedCustomerProfileView(input: {
  profile: CustomerProfile;
  contacts: CustomerProfileContact[];
  invoices: CustomerInvoice[];
  payments: Payment[];
  remittances: Remittance[];
  exceptions: DomainException[];
  approvals: ApprovalRequest[];
  tasks: CustomerProfileTask[];
  mergeSuggestions: UnifiedCustomerProfileView["mergeSuggestions"];
  primaryContactConflict?: CustomerProfilePrimaryContactConflict;
  parentAccount?: ParentAccount;
  billingAccount?: BillingAccount;
  branches: Branch[];
}): UnifiedCustomerProfileView {
  const primaryContact = input.contacts.find((contact) => contact.id === input.profile.primaryContactId);
  const learningSummary =
    input.profile.memorySummary ??
    tryBuildFallbackLearningSummary({
      profile: input.profile,
      contacts: input.contacts,
      remittances: input.remittances,
    });
  const tabs = buildCustomerProfileTabs({
    invoices: input.invoices,
    tasks: input.tasks,
    payments: input.payments,
    remittances: input.remittances,
    exceptions: input.exceptions,
    approvals: input.approvals,
  });
  const financialSummary = buildCustomerFinancialSummary({
    invoices: input.invoices,
    payments: input.payments,
    remittances: input.remittances,
  });
  const completenessCheck = buildCustomerCompletenessCheck({
    profile: input.profile,
    contacts: input.contacts,
    ...(input.parentAccount ? { parentAccount: input.parentAccount } : {}),
    ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
    branches: input.branches,
    financialSummary,
  });
  const conciseSummary = buildConciseSummary({
    profile: input.profile,
    ...(primaryContact ? { primaryContact } : {}),
    invoiceCount: input.profile.linkedInvoiceIds.length,
    duplicateReviewPending: input.mergeSuggestions.some((suggestion) => suggestion.status === "pending_review"),
  });
  const insightSummary = buildCustomerInsightSummary({
    conciseSummary,
    ...(learningSummary ? { learningSummary } : {}),
    mergeSuggestions: input.mergeSuggestions,
    ...(input.primaryContactConflict ? { primaryContactConflict: input.primaryContactConflict } : {}),
  });
  const customerIndexEntry = buildCustomerIndexEntry({
    profile: input.profile,
    ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
    tabs,
    financialSummary,
    completenessCheck,
    taskCount: input.tasks.filter((task) => task.status === "open" || task.status === "in_progress").length,
    nextAction:
      learningSummary?.nextBestAction?.reasonSummary ??
      input.tasks.find((task) => task.status === "open")?.auditTrail.at(-1)?.summary ??
      "Review the overview before taking customer action.",
    hasPendingReview: insightSummary.duplicateReviewPending || insightSummary.primaryContactReviewPending,
  });
  const customerProfile = buildCustomerProfileAggregateReadModel({
    profile: input.profile,
    ...(input.parentAccount ? { parentAccount: input.parentAccount } : {}),
    ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
    branches: input.branches,
    contacts: input.contacts,
    tasks: input.tasks,
    exceptions: input.exceptions,
    learningSummary,
    tabs,
    financialSummary,
    completenessCheck,
    conciseSummary,
    ...(primaryContact ? { primaryContact } : {}),
    insightSummary,
  });

  return {
    profile: input.profile,
    hierarchy: {
      ...(input.parentAccount ? { parentAccount: input.parentAccount } : {}),
      ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
      branches: input.branches,
    },
    contacts: input.contacts,
    invoices: input.invoices,
    payments: input.payments,
    remittances: input.remittances,
    exceptions: input.exceptions,
    approvals: input.approvals,
    tasks: input.tasks,
    mergeSuggestions: input.mergeSuggestions,
    ...(input.primaryContactConflict ? { primaryContactConflict: input.primaryContactConflict } : {}),
    ...(learningSummary ? { summary: learningSummary } : {}),
    conciseSummary,
    customerIndexEntry,
    customerProfile,
  };
}

export function buildCustomerIndexEntry(input: {
  profile: CustomerProfile;
  billingAccount?: BillingAccount;
  tabs: CustomerProfileTab[];
  financialSummary: CustomerProfileAggregateReadModel["financialSummary"];
  completenessCheck: CustomerCompletenessCheck;
  taskCount: number;
  nextAction: string;
  hasPendingReview: boolean;
}): CustomerIndexReadModel {
  return {
    profileId: input.profile.id,
    canonicalName: input.profile.canonicalName,
    status: input.profile.status,
    accountTier: input.billingAccount?.accountTier ?? "unknown",
    ...(input.profile.parentAccountId ? { parentAccountId: input.profile.parentAccountId } : {}),
    ...(input.profile.parentAccountName ? { parentAccountName: input.profile.parentAccountName } : {}),
    ...(input.profile.billingAccountId ? { billingAccountId: input.profile.billingAccountId } : {}),
    ...(input.profile.billingAccountName ? { billingAccountName: input.profile.billingAccountName } : {}),
    branchIds: input.profile.branchIds,
    branchNames: input.profile.branchNames,
    ...(input.profile.primaryContactEmail ? { primaryContactEmail: input.profile.primaryContactEmail } : {}),
    openAmountCents: input.financialSummary.openAmountCents,
    overdueAmountCents: input.financialSummary.overdueAmountCents,
    collectibleAmountCents: input.financialSummary.collectibleAmountCents,
    disputedAmountCents: input.financialSummary.disputedAmountCents,
    openInvoiceCount: input.financialSummary.openInvoiceCount,
    taskCount: input.taskCount,
    completenessScore: input.completenessCheck.score,
    nextAction: input.nextAction,
    hasPendingReview: input.hasPendingReview,
    tabs: input.tabs,
  };
}

export function buildCustomerProfileAggregateReadModel(input: {
  profile: CustomerProfile;
  parentAccount?: ParentAccount;
  billingAccount?: BillingAccount;
  branches: Branch[];
  contacts: CustomerProfileContact[];
  tasks: CustomerProfileTask[];
  exceptions: DomainException[];
  learningSummary?: UnifiedCustomerProfileView["summary"];
  tabs: CustomerProfileTab[];
  financialSummary: CustomerProfileAggregateReadModel["financialSummary"];
  completenessCheck: CustomerCompletenessCheck;
  conciseSummary: string;
  primaryContact?: CustomerProfileContact;
  insightSummary: CustomerProfileAggregateReadModel["insightSummary"];
}): CustomerProfileAggregateReadModel {
  const notes = buildCustomerProfileNotes({
    profile: input.profile,
    ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
    branches: input.branches,
    financialSummary: input.financialSummary,
    ...(input.primaryContact ? { primaryContact: input.primaryContact } : {}),
  });

  return {
    profileId: input.profile.id,
    overviewSummary: {
      canonicalName: input.profile.canonicalName,
      ...(input.profile.legalEntityName ? { legalEntityName: input.profile.legalEntityName } : {}),
      ...(input.profile.taxId ? { taxId: input.profile.taxId } : {}),
      status: input.profile.status,
      accountTier: input.billingAccount?.accountTier ?? "unknown",
      ...(input.parentAccount?.name ? { parentAccountName: input.parentAccount.name } : {}),
      ...(input.billingAccount?.displayName ? { billingAccountName: input.billingAccount.displayName } : {}),
      branchNames: input.branches.map((branch) => branch.name),
      hierarchySummary: buildHierarchySummary({
        ...(input.parentAccount ? { parentAccount: input.parentAccount } : {}),
        ...(input.billingAccount ? { billingAccount: input.billingAccount } : {}),
        branches: input.branches,
      }),
    },
    contactSummary: {
      totalContacts: input.contacts.length,
      verifiedContacts: input.contacts.filter((contact) => contact.isVerified).length,
      autoSendEligibleContacts: input.contacts.filter(
        (contact) => contact.allowAutoSend && contact.isVerified,
      ).length,
      sharedMailboxContacts: input.contacts.filter((contact) => contact.sharedMailbox).length,
      hasVerifiedPrimaryContact: Boolean(input.primaryContact?.isVerified),
      ...(input.primaryContact
        ? {
            primaryContact: {
              id: input.primaryContact.id,
              fullName: input.primaryContact.fullName,
              ...(input.primaryContact.email ? { email: input.primaryContact.email } : {}),
              ...(input.primaryContact.phone ? { phone: input.primaryContact.phone } : {}),
              role: input.primaryContact.role,
              allowAutoSend: input.primaryContact.allowAutoSend,
              isVerified: input.primaryContact.isVerified,
            },
          }
        : {}),
    },
    insightSummary: input.insightSummary,
    financialSummary: input.financialSummary,
    completenessCheck: input.completenessCheck,
    notes,
    creditProfile: buildCustomerCreditProfile({
      profile: input.profile,
      exceptions: input.exceptions,
      financialSummary: input.financialSummary,
      completenessCheck: input.completenessCheck,
    }),
    tabs: input.tabs,
  };
}

function tryBuildFallbackLearningSummary(input: {
  profile: CustomerProfile;
  contacts: CustomerProfileContact[];
  remittances: Remittance[];
}) {
  const primaryContact = input.contacts.find((contact) => contact.id === input.profile.primaryContactId);
  if (!primaryContact) {
    return undefined;
  }

  const summaryInput: CustomerProfileAggregateInput = {
    billingAccountId: input.profile.billingAccountId ?? input.profile.id,
    accountName: input.profile.canonicalName,
    ...(input.profile.parentAccountId ? { parentAccountId: input.profile.parentAccountId } : {}),
    ...(input.profile.parentAccountName
      ? { parentAccountName: input.profile.parentAccountName }
      : {}),
    generatedAt: input.profile.updatedAt,
    preferredContact: {
      contactId: primaryContact.id,
      contactName: primaryContact.fullName,
      ...(primaryContact.email ? { contactEmail: primaryContact.email } : {}),
      ...(primaryContact.phone ? { contactPhone: primaryContact.phone } : {}),
      reasonSummary: primaryContact.survivorshipReasons[0] ?? "Primary contact selected from mastered contact set.",
    },
    groupedReminderAttempts: 0,
    groupedReminderPayments: 0,
    resendAttempts: 0,
    resendPayments: 0,
    remittanceTotalCount: input.remittances.length,
    remittanceStructuredCount: input.remittances.filter((remittance) => remittance.state !== "received_unparsed").length,
    remittanceLinkedCount: input.remittances.filter(
      (remittance) =>
        remittance.state === "linked_to_payment" || remittance.state === "linked_to_invoice_candidate",
    ).length,
    promiseObservedCount: 0,
    promiseKeptCount: 0,
    communicationAttemptCount: 0,
    wrongContactCount: 0,
    parentPayerObservations: 0,
    parentPayerSignals: 0,
  };

  return buildCustomerProfileReadModel(summaryInput);
}

function buildCustomerProfileTabs(input: {
  invoices: CustomerInvoice[];
  tasks: CustomerProfileTask[];
  payments: Payment[];
  remittances: Remittance[];
  exceptions: DomainException[];
  approvals: ApprovalRequest[];
}): CustomerProfileTab[] {
  const deductionsCount = input.exceptions.filter((exception) =>
    [
      "short_payment",
      "overpayment",
      "partial_dispute",
      "full_dispute",
      "credit_memo_pending",
    ].includes(exception.kind),
  ).length;
  const apPortalCount =
    input.remittances.filter((remittance) => remittance.sourceChannel === "portal").length +
    input.approvals.filter((approval) => approval.requestType.includes("portal")).length;

  return [
    { id: "overview", label: "Overview", itemCount: 1, status: "ready" },
    {
      id: "invoices",
      label: "Invoices",
      itemCount: input.invoices.length,
      status: input.invoices.length > 0 ? "ready" : "empty",
    },
    {
      id: "tasks",
      label: "Tasks",
      itemCount: input.tasks.length,
      status: input.tasks.some((task) => task.status !== "completed" && task.status !== "cancelled")
        ? "attention"
        : input.tasks.length > 0
          ? "ready"
          : "empty",
    },
    {
      id: "activity",
      label: "Activity",
      itemCount: input.tasks.length + input.approvals.length + input.exceptions.length,
      status:
        input.tasks.length + input.approvals.length + input.exceptions.length > 0 ? "ready" : "empty",
    },
    {
      id: "payments",
      label: "Payments",
      itemCount: input.payments.length,
      status: input.payments.length > 0 ? "ready" : "empty",
    },
    {
      id: "ap_portal",
      label: "AP Portal",
      itemCount: apPortalCount,
      status: apPortalCount > 0 ? "ready" : "empty",
    },
    {
      id: "deductions",
      label: "Deductions",
      itemCount: deductionsCount,
      status: deductionsCount > 0 ? "attention" : "empty",
    },
  ];
}

function buildCustomerFinancialSummary(input: {
  invoices: CustomerInvoice[];
  payments: Payment[];
  remittances: Remittance[];
}): CustomerProfileAggregateReadModel["financialSummary"] {
  const openInvoices = input.invoices.filter((invoice) =>
    invoice.state !== "paid" && invoice.state !== "voided",
  );
  const disputedInvoices = input.invoices.filter((invoice) =>
    invoice.state === "disputed_partial" || invoice.state === "disputed_full",
  );
  const overdueInvoices = openInvoices.filter((invoice) => isInvoiceOverdue(invoice));
  const currency = openInvoices[0]?.currency ?? input.payments[0]?.currency ?? "PHP";

  return {
    currency,
    openAmountCents: openInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0),
    overdueAmountCents: overdueInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0),
    collectibleAmountCents: openInvoices.reduce(
      (sum, invoice) => sum + (invoice.collectibleAmountCents ?? invoice.amountCents),
      0,
    ),
    disputedAmountCents: disputedInvoices.reduce(
      (sum, invoice) =>
        sum +
        (invoice.disputedAmountCents ??
          (invoice.state === "disputed_full" ? invoice.amountCents : 0)),
      0,
    ),
    unappliedCashAmountCents: input.payments
      .filter((payment) => payment.state === "unapplied_cash")
      .reduce((sum, payment) => sum + payment.amountCents, 0),
    openInvoiceCount: openInvoices.length,
    overdueInvoiceCount: overdueInvoices.length,
    disputedInvoiceCount: disputedInvoices.length,
    paymentCount: input.payments.length,
    remittanceCount: input.remittances.length,
    ...(() => {
      const lastPaymentAt = [...input.payments]
        .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))[0]?.receivedAt;
      return lastPaymentAt ? { lastPaymentAt } : {};
    })(),
  };
}

function buildCustomerCompletenessCheck(input: {
  profile: CustomerProfile;
  contacts: CustomerProfileContact[];
  parentAccount?: ParentAccount;
  billingAccount?: BillingAccount;
  branches: Branch[];
  financialSummary: CustomerProfileAggregateReadModel["financialSummary"];
}): CustomerCompletenessCheck {
  const items: CustomerCompletenessCheckItem[] = [
    {
      id: "parent_account",
      label: "Parent account linked",
      status: input.parentAccount ? "complete" : "warning",
      detail: input.parentAccount
        ? `Parent account ${input.parentAccount.name} is preserved for rollup visibility.`
        : "Customer is still usable, but parent-account visibility is missing.",
    },
    {
      id: "billing_account",
      label: "Billing account linked",
      status: input.billingAccount ? "complete" : "missing",
      detail: input.billingAccount
        ? `Billing account ${input.billingAccount.displayName} remains the default routing level.`
        : "Billing account routing must be established before this customer is operational.",
    },
    {
      id: "branch_context",
      label: "Branch context preserved",
      status:
        input.branches.length > 0 ||
        input.profile.branchIds.length > 0 ||
        input.financialSummary.openInvoiceCount === 0
          ? "complete"
          : "warning",
      detail:
        input.branches.length > 0
          ? `Branch context is preserved on ${input.branches.length} linked branch records.`
          : "No branch record is linked yet for current open invoice exposure.",
    },
    {
      id: "verified_contact",
      label: "Verified customer contact",
      status: input.contacts.some((contact) => contact.isVerified) ? "complete" : "missing",
      detail: input.contacts.some((contact) => contact.isVerified)
        ? "At least one verified contact can support safe customer outreach."
        : "No verified contact is available, so automation must stay conservative.",
    },
    {
      id: "tax_id",
      label: "Tax identity",
      status: input.profile.taxId ? "complete" : "warning",
      detail: input.profile.taxId
        ? `Tax identity ${input.profile.taxId} is present on the profile.`
        : "Tax identity is still missing from the mastered customer profile.",
    },
    {
      id: "credit_profile",
      label: "Credit profile metadata",
      status:
        typeof input.profile.metadata.creditHold === "boolean" ||
        typeof input.profile.metadata.internalCreditLimitCents === "number"
          ? "complete"
          : "warning",
      detail:
        typeof input.profile.metadata.creditHold === "boolean" ||
        typeof input.profile.metadata.internalCreditLimitCents === "number"
          ? "Credit metadata is available for customer review."
          : "Credit controls are still inferred from exposure and exceptions only.",
    },
  ];

  const completedCount = items.filter((item) => item.status === "complete").length;
  const score = roundMetric(completedCount / items.length);
  return {
    score,
    completedCount,
    totalCount: items.length,
    status: completedCount === items.length ? "complete" : completedCount >= 3 ? "warning" : "missing",
    items,
  };
}

function buildCustomerProfileNotes(input: {
  profile: CustomerProfile;
  billingAccount?: BillingAccount;
  branches: Branch[];
  financialSummary: CustomerProfileAggregateReadModel["financialSummary"];
  primaryContact?: CustomerProfileContact;
}): CustomerProfileNote[] {
  const notes: CustomerProfileNote[] = [];
  const metadataNotes = Array.isArray(input.profile.metadata.notes)
    ? input.profile.metadata.notes.filter(isString)
    : [];

  for (const [index, body] of metadataNotes.entries()) {
    notes.push({
      id: `${input.profile.id}-note-${index + 1}`,
      kind: "operator",
      body,
      source: "profile.metadata.notes",
      createdAt: input.profile.updatedAt,
    });
  }

  notes.push({
    id: `${input.profile.id}-routing`,
    kind: "system",
    body:
      input.billingAccount?.displayName
        ? `Billing account ${input.billingAccount.displayName} remains the default routing level for collections actions.`
        : "Billing-account routing is still being established for this customer profile.",
    source: "customer_profile.summary",
    createdAt: input.profile.updatedAt,
  });

  if (input.branches.length > 0) {
    notes.push({
      id: `${input.profile.id}-branch`,
      kind: "system",
      body: `Known branch context is preserved for ${input.branches.map((branch) => branch.name).join(", ")}.`,
      source: "customer_profile.summary",
      createdAt: input.profile.updatedAt,
    });
  }

  if (input.financialSummary.disputedAmountCents > 0) {
    notes.push({
      id: `${input.profile.id}-dispute`,
      kind: "collections",
      body: "Disputed invoice exposure is visible on the profile and must remain blocked from automated chase.",
      source: "customer_profile.financial_summary",
      createdAt: input.profile.updatedAt,
    });
  }

  if (!input.primaryContact?.isVerified) {
    notes.push({
      id: `${input.profile.id}-contact`,
      kind: "collections",
      body: "No verified primary contact is available yet, so auto-send should remain disabled.",
      source: "customer_profile.contact_summary",
      createdAt: input.profile.updatedAt,
    });
  }

  return notes;
}

function buildCustomerCreditProfile(input: {
  profile: CustomerProfile;
  exceptions: DomainException[];
  financialSummary: CustomerProfileAggregateReadModel["financialSummary"];
  completenessCheck: CustomerCompletenessCheck;
}): CustomerCreditProfile {
  const hasCreditHold = Boolean(input.profile.metadata.creditHold);
  const blockedReasons = [
    ...(hasCreditHold ? ["Credit hold is marked on the profile metadata."] : []),
    ...(input.financialSummary.disputedAmountCents > 0
      ? ["Disputed balance remains open and should be reviewed before collections action."]
      : []),
    ...(input.completenessCheck.items.some((item) => item.id === "verified_contact" && item.status !== "complete")
      ? ["No verified contact is available for safe automated outreach."]
      : []),
    ...input.exceptions
      .filter((exception) => exception.severity === "high" || exception.severity === "critical")
      .map((exception) => `Open ${exception.kind.replace(/_/g, " ")} exception is still active.`),
  ];

  const riskLevel =
    hasCreditHold || input.financialSummary.disputedAmountCents > 0
      ? "high"
      : input.financialSummary.overdueAmountCents > 0 || blockedReasons.length > 0
        ? "medium"
        : input.financialSummary.openAmountCents > 0
          ? "low"
          : "unknown";
  const internalCreditLimitCents =
    typeof input.profile.metadata.internalCreditLimitCents === "number"
      ? input.profile.metadata.internalCreditLimitCents
      : undefined;

  return {
    riskLevel,
    hasCreditHold,
    hasOverdueBalance: input.financialSummary.overdueAmountCents > 0,
    ...(internalCreditLimitCents !== undefined ? { internalCreditLimitCents } : {}),
    ...(internalCreditLimitCents !== undefined
      ? {
          availableCreditCents: internalCreditLimitCents - input.financialSummary.openAmountCents,
        }
      : {}),
    blockedReasons,
  };
}

function buildCustomerInsightSummary(input: {
  conciseSummary: string;
  learningSummary?: UnifiedCustomerProfileView["summary"];
  mergeSuggestions: UnifiedCustomerProfileView["mergeSuggestions"];
  primaryContactConflict?: CustomerProfilePrimaryContactConflict;
}): CustomerProfileAggregateReadModel["insightSummary"] {
  return {
    conciseSummary: input.conciseSummary,
    ...(input.learningSummary?.preferredChannel
      ? { preferredChannel: input.learningSummary.preferredChannel }
      : {}),
    ...(input.learningSummary?.nextBestAction
      ? { nextBestAction: input.learningSummary.nextBestAction }
      : {}),
    ...(input.learningSummary?.paymentBehaviorSnapshot.remittanceQuality
      ? { remittanceQuality: input.learningSummary.paymentBehaviorSnapshot.remittanceQuality }
      : {}),
    ...(input.learningSummary?.paymentBehaviorSnapshot.parentPayerProbability !== undefined
      ? {
          centralizedPayerConfidence: input.learningSummary.paymentBehaviorSnapshot.parentPayerProbability,
        }
      : {}),
    duplicateReviewPending: input.mergeSuggestions.some(
      (suggestion) => suggestion.status === "pending_review",
    ),
    primaryContactReviewPending: input.primaryContactConflict?.status === "pending_review",
    explanation: input.learningSummary?.explanation.map((reason) => reason.summary) ?? [],
  };
}

function buildConciseSummary(input: {
  profile: CustomerProfile;
  primaryContact?: CustomerProfileContact;
  invoiceCount: number;
  duplicateReviewPending: boolean;
}) {
  return [
    input.profile.canonicalName,
    input.primaryContact?.email
      ? `primary email ${input.primaryContact.email}`
      : "no verified primary email",
    input.invoiceCount > 0 ? `${input.invoiceCount} linked invoices` : "no linked invoices yet",
    input.duplicateReviewPending ? "duplicate review pending" : "no duplicate review pending",
  ].join(" | ");
}

function buildHierarchySummary(input: {
  parentAccount?: ParentAccount;
  billingAccount?: BillingAccount;
  branches: Branch[];
}) {
  return [
    input.parentAccount?.name ? `parent ${input.parentAccount.name}` : "no parent account",
    input.billingAccount?.displayName
      ? `billing ${input.billingAccount.displayName}`
      : "no billing account",
    input.branches.length > 0
      ? `${input.branches.length} branch${input.branches.length === 1 ? "" : "es"} preserved`
      : "no branch linked",
  ].join(" | ");
}

function mergeCustomerProfilePolicy(
  policy: Partial<CustomerProfileMasteringPolicy> = {},
): CustomerProfileMasteringPolicy {
  const defaults = defaultCustomerProfileMasteringPolicy();
  return {
    ...defaults,
    ...policy,
    duplicate: {
      ...defaults.duplicate,
      ...(policy.duplicate ?? {}),
      weights: {
        ...defaults.duplicate.weights,
        ...(policy.duplicate?.weights ?? {}),
      },
    },
    contacts: {
      ...defaults.contacts,
      ...(policy.contacts ?? {}),
    },
  };
}

function createCustomerProfileContact(input: {
  profileId: string;
  source: CustomerProfileIngestionPayload["source"];
  occurredAt: string;
  actor: ActorContext;
  contact: CustomerProfileCandidateContactInput;
  policy: CustomerProfileMasteringPolicy;
}): CustomerProfileContact {
  const sharedMailbox = detectSharedMailbox(
    input.contact.email,
    input.contact.fullName,
    input.policy.contacts.sharedMailboxPrefixes,
  );
  return {
    id: input.contact.id ?? buildGeneratedContactId(input.profileId, input.contact),
    ...createEntityMetadata({
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    profileId: input.profileId,
    fullName: input.contact.fullName,
    ...(input.contact.email ? { email: input.contact.email } : {}),
    ...(input.contact.phone ? { phone: input.contact.phone } : {}),
    role: input.contact.role,
    isPrimaryCandidate: Boolean(input.contact.isPrimary),
    isPrimaryEmail: false,
    isPrimaryPhone: false,
    allowAutoSend: Boolean(input.contact.allowAutoSend),
    isVerified: Boolean(input.contact.isVerified),
    verification: {
      email: input.contact.email
        ? input.contact.isVerified
          ? "verified"
          : "unverified"
        : "unknown",
      phone: input.contact.phone
        ? input.contact.isVerified
          ? "verified"
          : "unverified"
        : "unknown",
    },
    sharedMailbox,
    sourcePriorities: [input.source],
    sourceContactIds: input.contact.id ? [input.contact.id] : [],
    survivorshipReasons: [
      sharedMailbox
        ? "Shared mailbox retained because it matches the canonical routing pattern."
        : "Named contact retained from incoming source data.",
    ],
    recentSuccessfulResponses: input.contact.recentSuccessfulResponses ?? 0,
    metadata: input.contact.metadata ?? {},
  };
}

function mergeCustomerProfileContact(input: {
  existing: CustomerProfileContact;
  incoming: CustomerProfileContact;
  source: CustomerProfileIngestionPayload["source"];
  occurredAt: string;
  actor: ActorContext;
  policy: CustomerProfileMasteringPolicy;
}): CustomerProfileContact {
  const preferredEmail = choosePreferredContactField({
    existingValue: input.existing.email,
    incomingValue: input.incoming.email,
    existingVerified: input.existing.verification.email === "verified",
    incomingVerified: input.incoming.verification.email === "verified",
    existingSources: input.existing.sourcePriorities,
    incomingSource: input.source,
    sourcePriority: input.policy.contacts.sourcePriority,
  });
  const preferredPhone = choosePreferredContactField({
    existingValue: input.existing.phone,
    incomingValue: input.incoming.phone,
    existingVerified: input.existing.verification.phone === "verified",
    incomingVerified: input.incoming.verification.phone === "verified",
    existingSources: input.existing.sourcePriorities,
    incomingSource: input.source,
    sourcePriority: input.policy.contacts.sourcePriority,
  });

  return {
    ...input.existing,
    ...evolveEntityMetadata(input.existing, {
      at: input.occurredAt,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
    }),
    fullName: choosePreferredName(input.existing.fullName, input.incoming.fullName),
    ...(preferredEmail ? { email: preferredEmail } : {}),
    ...(preferredPhone ? { phone: preferredPhone } : {}),
    allowAutoSend: input.existing.allowAutoSend || input.incoming.allowAutoSend,
    isVerified: input.existing.isVerified || input.incoming.isVerified,
    verification: {
      email:
        input.existing.verification.email === "verified" ||
        input.incoming.verification.email === "verified"
          ? "verified"
          : input.existing.verification.email !== "unknown" ||
              input.incoming.verification.email !== "unknown"
            ? "unverified"
            : "unknown",
      phone:
        input.existing.verification.phone === "verified" ||
        input.incoming.verification.phone === "verified"
          ? "verified"
          : input.existing.verification.phone !== "unknown" ||
              input.incoming.verification.phone !== "unknown"
            ? "unverified"
            : "unknown",
    },
    sharedMailbox: input.existing.sharedMailbox || input.incoming.sharedMailbox,
    sourcePriorities: uniqueValues([...input.existing.sourcePriorities, input.source]),
    sourceContactIds: uniqueValues([
      ...input.existing.sourceContactIds,
      ...input.incoming.sourceContactIds,
    ]),
    survivorshipReasons: uniqueValues([
      ...input.existing.survivorshipReasons,
      preferredEmail === input.incoming.email && input.incoming.email
        ? "Incoming email won survivorship because it carried stronger verification or source priority."
        : "Existing email retained as safer survivorship choice.",
      preferredPhone === input.incoming.phone && input.incoming.phone
        ? "Incoming phone won survivorship because it carried stronger verification or source priority."
        : "Existing phone retained as safer survivorship choice.",
    ]),
    recentSuccessfulResponses: Math.max(
      input.existing.recentSuccessfulResponses,
      input.incoming.recentSuccessfulResponses,
    ),
    metadata: {
      ...input.existing.metadata,
      ...input.incoming.metadata,
    },
  };
}

function compareContactsForPrimarySelection(
  left: CustomerProfileContact,
  right: CustomerProfileContact,
) {
  const leftScore = primarySelectionScore(left);
  const rightScore = primarySelectionScore(right);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  if (left.recentSuccessfulResponses !== right.recentSuccessfulResponses) {
    return right.recentSuccessfulResponses - left.recentSuccessfulResponses;
  }

  return left.id.localeCompare(right.id);
}

function primarySelectionScore(contact: CustomerProfileContact) {
  const emailVerified = contact.verification.email === "verified" ? 50 : 0;
  const phoneVerified = contact.verification.phone === "verified" ? 20 : 0;
  const autoSend = contact.allowAutoSend ? 15 : 0;
  const namedContact = contact.sharedMailbox ? 0 : 8;
  const explicitPrimary = contact.isPrimaryCandidate ? 5 : 0;
  const rolePriority =
    contact.role === "ap"
      ? 10
      : contact.role === "shared_finance"
        ? 9
        : contact.role === "treasury"
          ? 8
          : contact.role === "customer"
            ? 7
            : 5;
  return emailVerified + phoneVerified + autoSend + namedContact + explicitPrimary + rolePriority;
}

function choosePreferredContactField(input: {
  existingValue: string | undefined;
  incomingValue: string | undefined;
  existingVerified: boolean;
  incomingVerified: boolean;
  existingSources: string[];
  incomingSource: string;
  sourcePriority: string[];
}) {
  if (!input.existingValue) {
    return input.incomingValue;
  }
  if (!input.incomingValue) {
    return input.existingValue;
  }
  if (input.existingValue === input.incomingValue) {
    return input.existingValue;
  }
  if (input.incomingVerified && !input.existingVerified) {
    return input.incomingValue;
  }
  if (input.existingVerified && !input.incomingVerified) {
    return input.existingValue;
  }
  const existingPriority = lowestPriorityIndex(input.existingSources, input.sourcePriority);
  const incomingPriority = input.sourcePriority.indexOf(input.incomingSource);
  return incomingPriority < existingPriority ? input.incomingValue : input.existingValue;
}

function choosePreferredName(existingName: string, incomingName: string) {
  if (looksLikeNamedContact(incomingName) && !looksLikeNamedContact(existingName)) {
    return incomingName;
  }
  if (incomingName.length > existingName.length) {
    return incomingName;
  }
  return existingName;
}

function buildGeneratedContactId(
  profileId: string,
  contact: CustomerProfileCandidateContactInput,
) {
  const normalizedIdentity = normalizeText(contact.email ?? contact.phone ?? contact.fullName);
  return [
    "customer_profile_contact",
    profileId,
    normalizedIdentity ? normalizedIdentity.replace(/\s+/g, "_") : "contact",
  ].join("_");
}

function contactIdentity(contact: Pick<CustomerProfileContact, "email" | "phone" | "fullName" | "role">) {
  const email = normalizeText(contact.email);
  if (email) {
    return `email:${email}`;
  }
  const phone = normalizePhone(contact.phone);
  if (phone) {
    return `phone:${phone}`;
  }
  return `name-role:${normalizeText(contact.fullName)}:${contact.role}`;
}

function detectSharedMailbox(
  email: string | undefined,
  fullName: string,
  prefixes: string[],
) {
  if (!email) {
    return false;
  }
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  return (
    prefixes.some((prefix) => localPart.replace(/[^a-z]/g, "").startsWith(prefix)) ||
    /\b(ap|finance|treasury|accounts payable)\b/i.test(fullName)
  );
}

function collectEmailDomains(contacts: CustomerProfileCandidateContactInput[]) {
  return new Set(
    contacts
      .map((contact) => extractEmailDomain(contact.email))
      .filter((value): value is string => Boolean(value)),
  );
}

function extractEmailDomain(email: string | undefined) {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  return domain && domain.length > 0 ? domain : undefined;
}

function normalizeText(value: string | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value: string | undefined) {
  return value?.replace(/\D+/g, "");
}

function similarityRatio(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function isInvoiceOverdue(invoice: CustomerInvoice) {
  if (!invoice.dueDate) {
    return false;
  }
  return invoice.dueDate < new Date().toISOString().slice(0, 10);
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function choosePreferredString(current?: string, incoming?: string) {
  return incoming && incoming.length > 0 ? incoming : current;
}

function lowestPriorityIndex(values: string[], order: string[]) {
  const indexes = values
    .map((value) => order.indexOf(value))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function looksLikeNamedContact(value: string) {
  return !/\b(ap|finance|treasury|accounts payable)\b/i.test(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function compactOptionalObject<T>(value: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
