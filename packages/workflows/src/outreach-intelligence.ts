import {
  createActivityLogDomainHelpers,
  type ImmutableActivityLogEntry,
  type ImmutableActivityLogStore,
} from "@o2c/audit";
import type { Principal } from "@o2c/auth";
import type {
  OutreachChannel,
  OutreachCommunicationHistory,
  OutreachContextBundle,
  OutreachDeductionOrException,
  OutreachEmailDraft,
  OutreachExecutionHandoff,
  OutreachOperatorFeedbackSignal,
  OutreachPaymentActivity,
  OutreachPolicyDecision,
  OutreachPromiseToPayStatus,
  OutreachRemittanceStatus,
  OutreachRiskFlag,
  OutreachSmsDraft,
  VoiceAgentContextPayload,
} from "@o2c/contracts";
import type { CommunicationIntentType } from "@o2c/contracts";
import type { BillingAccount, Contact, CustomerInvoice } from "@o2c/domain";
import { RetellVoiceAgentAdapter } from "./outreach-provider-adapters.js";
import {
  mergeOutreachGenerationInput,
  type OutreachContextStore,
} from "./outreach-intelligence-context.js";

const MAX_RELATED_THREADS = 3;

export interface OutreachIntelligenceDependencies {
  activityStore: ImmutableActivityLogStore;
  contextStore?: OutreachContextStore;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export interface OutreachGenerationInput {
  principal: Principal;
  tenantId: string;
  channel: OutreachChannel;
  intent: CommunicationIntentType;
  account: BillingAccount;
  invoices: CustomerInvoice[];
  contact: Contact;
  operatorIntent?: string;
  currentThread?: OutreachCommunicationHistory;
  relatedThreads?: OutreachCommunicationHistory[];
  broadInboxFallbackThreads?: OutreachCommunicationHistory[];
  accountMemorySignals?: OutreachOperatorFeedbackSignal[];
  recentPayments?: OutreachPaymentActivity[];
  remittances?: OutreachRemittanceStatus[];
  deductions?: OutreachDeductionOrException[];
  promiseToPay?: OutreachPromiseToPayStatus;
  crossEntityAmbiguity?: {
    isAmbiguous: boolean;
    reason: string;
  };
}

export interface OutreachContextResult {
  bundle: OutreachContextBundle;
  policy: OutreachPolicyDecision;
  activityEntries: ImmutableActivityLogEntry[];
}

export interface OutreachFeedbackInput {
  principal: Principal;
  tenantId: string;
  bundleId: string;
  channel: OutreachChannel;
  action: "edited" | "accepted" | "rejected";
  originalOutput: Record<string, unknown>;
  editedOutput?: Record<string, unknown>;
  notes?: string;
}

export interface OutreachFeedbackResult {
  recorded: boolean;
  activityEntries: ImmutableActivityLogEntry[];
}

export interface ExecutionHandoffInput {
  principal: Principal;
  tenantId: string;
  bundleId: string;
  channel: OutreachChannel;
  provider: "retell" | "sms_stub" | "email_stub";
  output: OutreachEmailDraft | VoiceAgentContextPayload | OutreachSmsDraft;
  policy: OutreachPolicyDecision;
  metadata?: Record<string, unknown>;
}

export interface ExecutionHandoffResult {
  handoff: OutreachExecutionHandoff;
  activityEntries: ImmutableActivityLogEntry[];
}

export class CollectionsOutreachIntelligenceService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly audit: ReturnType<typeof createActivityLogDomainHelpers>;
  private readonly retellAdapter = new RetellVoiceAgentAdapter();
  private readonly contextStore: OutreachContextStore | undefined;

  constructor(private readonly deps: OutreachIntelligenceDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.contextStore = deps.contextStore;
    this.audit = createActivityLogDomainHelpers({
      store: deps.activityStore,
      idGenerator: () => this.idGenerator("activity"),
      now: this.now,
    });
  }

  previewContext(input: OutreachGenerationInput): OutreachContextResult {
    return this.generateContext(input);
  }

  generateEmailDraft(input: OutreachGenerationInput): OutreachContextResult & {
    draft: OutreachEmailDraft;
  } {
    const context = this.generateContext(input);
    const draft = renderEmailDraft(context.bundle, context.policy);
    const activityEntries = [
      ...context.activityEntries,
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActorRole(input.principal),
        action: "collections.outreach.email_generated",
        entityType: "collections_outreach_bundle",
        entityId: context.bundle.id,
        metadata: {
          tenantId: input.tenantId,
          channel: "email",
          approvalRequired: context.policy.approvalRequired,
        },
        after: draft as unknown as Record<string, unknown>,
      }),
    ];

    return {
      ...context,
      draft,
      activityEntries,
    };
  }

  generateVoiceAgentPayload(input: OutreachGenerationInput): OutreachContextResult & {
    payload: VoiceAgentContextPayload;
  } {
    const context = this.generateContext(input);
    const payload = renderVoicePayload(context.bundle, context.policy);
    const activityEntries = [
      ...context.activityEntries,
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActorRole(input.principal),
        action: "collections.outreach.voice_payload_generated",
        entityType: "collections_outreach_bundle",
        entityId: context.bundle.id,
        metadata: {
          tenantId: input.tenantId,
          channel: "voice_agent",
          approvalRequired: context.policy.approvalRequired,
        },
        after: payload as unknown as Record<string, unknown>,
      }),
    ];

    return {
      ...context,
      payload,
      activityEntries,
    };
  }

  generateSmsDraft(input: OutreachGenerationInput): OutreachContextResult & {
    draft: OutreachSmsDraft;
  } {
    const context = this.generateContext(input);
    const draft = renderSmsDraft(context.bundle, context.policy);
    const activityEntries = [
      ...context.activityEntries,
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActorRole(input.principal),
        action: "collections.outreach.sms_generated",
        entityType: "collections_outreach_bundle",
        entityId: context.bundle.id,
        metadata: {
          tenantId: input.tenantId,
          channel: "sms",
          approvalRequired: context.policy.approvalRequired,
        },
        after: draft as unknown as Record<string, unknown>,
      }),
    ];

    return {
      ...context,
      draft,
      activityEntries,
    };
  }

  recordOperatorFeedback(input: OutreachFeedbackInput): OutreachFeedbackResult {
    const activityEntries = [
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActorRole(input.principal),
        action: `collections.outreach.operator_${input.action}`,
        entityType: "collections_outreach_bundle",
        entityId: input.bundleId,
        metadata: {
          tenantId: input.tenantId,
          channel: input.channel,
          edited: Boolean(input.editedOutput),
          ...(input.notes ? { notes: input.notes } : {}),
        },
        before: input.originalOutput,
        ...(input.editedOutput ? { after: input.editedOutput } : {}),
      }),
    ];

    return {
      recorded: true,
      activityEntries,
    };
  }

  prepareExecutionHandoff(input: ExecutionHandoffInput): ExecutionHandoffResult {
    const preparedAt = this.now();
    const handoffId = this.idGenerator("outreach_handoff");
    const handoff =
      input.provider === "retell" && input.channel === "voice_agent"
        ? this.retellAdapter.prepareHandoff({
            handoffId,
            preparedAt,
            output: input.output as VoiceAgentContextPayload,
            policy: input.policy,
            metadata: input.metadata,
          })
        : {
            id: handoffId,
            channel: input.channel,
            provider: input.provider,
            preparedAt,
            readiness: input.policy.channelRestrictions.handoffAllowed
              ? ("handoff_ready" as const)
              : ("preview_only" as const),
            warnings: input.policy.warnings,
            payload: {
              output: input.output,
              ...(input.metadata ? { metadata: input.metadata } : {}),
            },
          };

    const activityEntries = [
      this.audit.append({
        actorId: input.principal.id,
        actorRole: toActorRole(input.principal),
        action: "collections.outreach.execution_handoff_prepared",
        entityType: "collections_outreach_bundle",
        entityId: input.bundleId,
        metadata: {
          tenantId: input.tenantId,
          channel: input.channel,
          provider: handoff.provider,
          readiness: handoff.readiness,
        },
        after: handoff.payload,
      }),
    ];

    return {
      handoff,
      activityEntries,
    };
  }

  private generateContext(input: OutreachGenerationInput): OutreachContextResult {
    const hydratedInput = this.contextStore
      ? mergeOutreachGenerationInput(input, this.contextStore.loadContextSupplement(input))
      : mergeOutreachGenerationInput(input, undefined);
    const generatedAt = this.now();
    const bundleId = this.idGenerator("outreach_bundle");
    const activityEntries: ImmutableActivityLogEntry[] = [];

    activityEntries.push(
      this.audit.append({
        actorId: hydratedInput.principal.id,
        actorRole: toActorRole(hydratedInput.principal),
        action: "collections.outreach.requested",
        entityType: "collections_outreach_bundle",
        entityId: bundleId,
        metadata: {
          tenantId: hydratedInput.tenantId,
          channel: hydratedInput.channel,
          intent: hydratedInput.intent,
          billingAccountId: hydratedInput.account.id,
          invoiceCount: hydratedInput.invoices.length,
        },
      }),
    );

    const bundle = buildOutreachContextBundle({
      id: bundleId,
      generatedAt,
      ...hydratedInput,
    });

    activityEntries.push(
      this.audit.append({
        actorId: hydratedInput.principal.id,
        actorRole: toActorRole(hydratedInput.principal),
        action: "collections.outreach.context_retrieved",
        entityType: "collections_outreach_bundle",
        entityId: bundle.id,
        metadata: {
          threadCount: bundle.recentCommunications.length,
          sourcesUsed: bundle.explanation.sourcesUsed.join(","),
          riskFlagCount: bundle.riskFlags.length,
        },
        after: bundle as unknown as Record<string, unknown>,
      }),
    );

    const policy = evaluateOutreachPolicy(bundle);

    activityEntries.push(
      this.audit.append({
        actorId: hydratedInput.principal.id,
        actorRole: toActorRole(hydratedInput.principal),
        action: "collections.outreach.policy_evaluated",
        entityType: "collections_outreach_bundle",
        entityId: bundle.id,
        metadata: {
          outreachAllowed: policy.outreachAllowed,
          operatorReviewRequired: policy.operatorReviewRequired,
          approvalRequired: policy.approvalRequired,
          escalationRequired: policy.escalationRequired,
          confidenceLow: policy.confidenceLow,
        },
        after: policy as unknown as Record<string, unknown>,
      }),
    );

    return {
      bundle,
      policy,
      activityEntries,
    };
  }
}

function buildOutreachContextBundle(
  input: OutreachGenerationInput & { id: string; generatedAt: string },
): OutreachContextBundle {
  const invoiceFacts = input.invoices.map((invoice) => {
    const disputedAmountCents = invoice.disputedAmountCents ?? 0;
    const collectibleAmountCents =
      invoice.collectibleAmountCents ??
      Math.max(
        0,
        invoice.state === "disputed_full" ? 0 : invoice.amountCents - disputedAmountCents,
      );

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      amountCents: invoice.amountCents,
      collectibleAmountCents,
      disputedAmountCents,
      state: invoice.state,
      ...(invoice.dueDate ? { dueDate: invoice.dueDate } : {}),
      ...(invoice.dueDate ? { agingDays: calculateAgingDays(invoice.dueDate, input.generatedAt) } : {}),
      ...(invoice.branchId ? { branchId: invoice.branchId } : {}),
    };
  });

  const selectedThreads = selectRelevantThreads(input);
  const branchIds = [
    ...new Set(
      [
        input.account.branchId,
        input.contact.branchId,
        ...invoiceFacts.map((invoice) => invoice.branchId),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const totalAmountCents = invoiceFacts.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const collectibleAmountCents = invoiceFacts.reduce(
    (sum, invoice) => sum + invoice.collectibleAmountCents,
    0,
  );
  const disputedAmountCents = invoiceFacts.reduce(
    (sum, invoice) => sum + invoice.disputedAmountCents,
    0,
  );
  const oldestDueDate = invoiceFacts
    .map((invoice) => invoice.dueDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0];

  const confidenceReasons: string[] = [];
  let confidenceScore = 0.9;

  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    confidenceScore -= 0.3;
    confidenceReasons.push("The selected contact is not fully safe for autonomous outreach.");
  }
  if (input.crossEntityAmbiguity?.isAmbiguous) {
    confidenceScore -= 0.25;
    confidenceReasons.push("Cross-entity ambiguity is still unresolved.");
  }
  if (!input.currentThread && selectedThreads.length === 0) {
    confidenceScore -= 0.2;
    confidenceReasons.push("No directly relevant communication history was available.");
  }
  if ((input.accountMemorySignals ?? []).length === 0) {
    confidenceScore -= 0.1;
    confidenceReasons.push("No account-level feedback or approved wording patterns were found.");
  }
  if ((input.broadInboxFallbackThreads ?? []).length > 0) {
    confidenceScore -= 0.1;
    confidenceReasons.push("Broad inbox fallback was used because targeted history was thin.");
  }

  const normalizedConfidence = Math.max(0.1, Number(confidenceScore.toFixed(2)));
  const riskFlags = collectRiskFlags({
    invoices: input.invoices,
    contact: input.contact,
    crossEntityAmbiguity: input.crossEntityAmbiguity,
    promiseToPay: input.promiseToPay,
    remittances: input.remittances ?? [],
    deductions: input.deductions ?? [],
    broadInboxFallbackUsed: (input.broadInboxFallbackThreads ?? []).length > 0,
    branchIds,
  });

  const retrievalOrder: OutreachContextBundle["explanation"]["retrievalOrder"] = [
    "current_receivable_context",
    "account_memory",
    "communication_history",
    ...((input.broadInboxFallbackThreads ?? []).length ? (["broad_inbox_fallback"] as const) : []),
  ];

  const explanation = {
    sourcesUsed: [
      "current receivable context",
      ...(input.accountMemorySignals?.length ? ["account-level collections memory"] : []),
      ...(selectedThreads.length ? ["relevant communication history"] : []),
      ...((input.broadInboxFallbackThreads ?? []).length ? ["broad inbox fallback"] : []),
    ],
    selectedThreadIds: selectedThreads.map((thread) => thread.id),
    omittedThreadIds: [
      ...(input.relatedThreads ?? [])
        .filter((thread) => !selectedThreads.some((selected) => selected.id === thread.id))
        .map((thread) => thread.id),
      ...(input.broadInboxFallbackThreads ?? [])
        .filter((thread) => !selectedThreads.some((selected) => selected.id === thread.id))
        .map((thread) => thread.id),
    ],
    retrievalOrder,
    notes: [
      "Current thread is preferred when present.",
      "Related threads are limited to a small, entity-safe set.",
      ...(input.crossEntityAmbiguity?.isAmbiguous
        ? [input.crossEntityAmbiguity.reason]
        : []),
    ],
  };

  return {
    id: input.id,
    generatedAt: input.generatedAt,
    tenantId: input.tenantId,
    channel: input.channel,
    intent: input.intent,
    customerAccount: {
      parentAccountId: input.account.parentAccountId,
      billingAccountId: input.account.id,
      billingAccountName: input.account.displayName,
      accountNumber: input.account.accountNumber,
      branchIds,
      currency: input.account.currency,
      accountTier: input.account.accountTier,
      ...(input.account.branchId ? { branchId: input.account.branchId } : {}),
    },
    contact: {
      id: input.contact.id,
      fullName: input.contact.fullName,
      verified: input.contact.isVerified,
      allowAutoSend: input.contact.allowAutoSend,
      ...(input.contact.email ? { email: input.contact.email } : {}),
      ...(input.contact.phone ? { phone: input.contact.phone } : {}),
    },
    ...(input.currentThread?.providerThreadId
      ? { threadId: input.currentThread.providerThreadId }
      : {}),
    ...(input.operatorIntent ? { operatorIntent: input.operatorIntent } : {}),
    invoiceIds: invoiceFacts.map((invoice) => invoice.invoiceId),
    receivables: {
      invoices: invoiceFacts,
      invoiceCount: invoiceFacts.length,
      totalAmountCents,
      collectibleAmountCents,
      disputedAmountCents,
      currency: input.account.currency,
      ...(oldestDueDate ? { oldestDueDate } : {}),
    },
    paymentState: {
      recentPayments: input.recentPayments ?? [],
      remittances: input.remittances ?? [],
      deductions: input.deductions ?? [],
      ...(input.promiseToPay ? { promiseToPay: input.promiseToPay } : {}),
    },
    accountMemory: {
      signals: input.accountMemorySignals ?? [],
    },
    recentCommunications: selectedThreads,
    riskFlags,
    approvalRequirements: deriveApprovalRequirements({
      account: input.account,
      invoices: input.invoices,
      contact: input.contact,
      crossEntityAmbiguity: input.crossEntityAmbiguity,
    }),
    confidence: {
      score: normalizedConfidence,
      label: normalizedConfidence >= 0.75 ? "high" : normalizedConfidence >= 0.55 ? "medium" : "low",
      reasons: confidenceReasons.length > 0 ? confidenceReasons : ["Targeted receivable context was available."],
    },
    explanation,
  };
}

function evaluateOutreachPolicy(bundle: OutreachContextBundle): OutreachPolicyDecision {
  const warnings = [...bundle.riskFlags];
  const hasDispute = bundle.riskFlags.includes("disputed_invoice");
  const unverifiedContact = bundle.riskFlags.includes("unverified_contact");
  const ambiguousEntity = bundle.riskFlags.includes("cross_entity_ambiguity");
  const lowConfidence = bundle.confidence.label === "low";
  const approvalRequired =
    bundle.approvalRequirements.length > 0 ||
    hasDispute ||
    ambiguousEntity ||
    bundle.customerAccount.accountTier === "strategic";
  const escalationRequired =
    bundle.riskFlags.includes("promise_to_pay_broken") || hasDispute;
  const outreachAllowed = !hasDispute && !unverifiedContact;
  const channelRestrictions = {
    email: [] as string[],
    voiceAgent: [] as string[],
    sms: [] as string[],
    autoSendAllowed: false,
    handoffAllowed: outreachAllowed && !approvalRequired && !lowConfidence,
  };

  const disallowedStatements = [
    ...(hasDispute
      ? [
          "Do not use chase language or assert the full disputed balance is payable now.",
        ]
      : []),
    ...(unverifiedContact
      ? [
          "Do not imply this recipient is a verified collections contact.",
        ]
      : []),
    ...(ambiguousEntity
      ? [
          "Do not state with certainty that no payment has been received or that a specific entity is responsible.",
        ]
      : []),
  ];

  const prohibitedClaims = [
    ...(bundle.paymentState.remittances.some((item) => item.state === "review_required")
      ? ["Do not say the remittance has already been matched."]
      : []),
    ...(bundle.paymentState.recentPayments.some((item) => item.status === "review_required")
      ? ["Do not say cash application is complete."]
      : []),
  ];

  if (hasDispute) {
    channelRestrictions.email.push("Only review-safe, non-chasing copy is allowed.");
    channelRestrictions.voiceAgent.push("Voice handoff must stop before payment pressure or negotiation.");
    channelRestrictions.sms.push("SMS must avoid payment demand language.");
  }
  if (unverifiedContact) {
    channelRestrictions.email.push("Do not auto-send until contact verification is completed.");
    channelRestrictions.voiceAgent.push("Do not hand off a call flow to an unverified phone endpoint.");
    channelRestrictions.sms.push("Do not send SMS to an unverified number.");
  }
  if (ambiguousEntity) {
    channelRestrictions.email.push("Use conservative language and avoid entity-specific certainty.");
    channelRestrictions.voiceAgent.push("Require human review before any provider handoff.");
    channelRestrictions.sms.push("Keep the message generic and request clarification.");
  }
  if (lowConfidence) {
    channelRestrictions.email.push("Limit personalization to facts from the current receivable context.");
    channelRestrictions.voiceAgent.push("Mark the call brief as low-confidence.");
    channelRestrictions.sms.push("Use the shortest conservative variant only.");
  }

  return {
    outreachAllowed,
    operatorReviewRequired: true,
    approvalRequired,
    escalationRequired,
    confidenceLow: lowConfidence,
    reviewStatus: !outreachAllowed ? "blocked" : approvalRequired ? "approval_required" : "ready_for_review",
    disallowedStatements,
    prohibitedClaims,
    warnings,
    channelRestrictions,
    rationale: [
      "Billing account remains the default routing unit.",
      ...(bundle.customerAccount.branchIds.length > 0
        ? ["Known branch context is preserved in the bundle."]
        : []),
      ...(approvalRequired ? ["Approval or explicit operator release is still required."] : []),
      ...(lowConfidence ? ["Personalization confidence is weak, so output stays conservative."] : []),
    ],
  };
}

function renderEmailDraft(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
): OutreachEmailDraft {
  const subjectBase = bundle.receivables.invoiceCount === 1
    ? `Invoice ${bundle.receivables.invoices[0]?.invoiceNumber ?? ""}`.trim()
    : `${bundle.receivables.invoiceCount} open invoices`;
  const personalizationSummary = buildPersonalizationSummary(bundle);
  const body = policy.outreachAllowed
    ? [
        `Hi ${bundle.contact.fullName},`,
        "",
        buildOpeningLine(bundle, policy, "email"),
        "",
        buildReceivableSummary(bundle, policy),
        "",
        buildActionLine(bundle, policy, "email"),
        "",
        "Thank you,",
        "Yield AROS Collections",
      ].join("\n")
    : [
        `Hi ${bundle.contact.fullName},`,
        "",
        "We are reviewing the account details on our side before sending a payment follow-up.",
        buildReviewOnlyLine(bundle, policy, "email"),
        "",
        "Thank you,",
        "Yield AROS Collections",
      ].join("\n");

  return {
    kind: "email",
    subjectSuggestions: [
      `${subjectBase} follow-up for ${bundle.customerAccount.billingAccountName}`,
      `Payment status check for ${bundle.customerAccount.billingAccountName}`,
    ],
    emailBody: body,
    toneLabel: policy.confidenceLow || !policy.outreachAllowed ? "conservative" : "empathetic",
    personalizationSummary,
    warnings: policy.warnings,
    contextUsed: bundle.explanation,
  };
}

function renderVoicePayload(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
): VoiceAgentContextPayload {
  const invoiceNumbers = bundle.receivables.invoices.map((invoice) => invoice.invoiceNumber).join(", ");
  return {
    kind: "voice_agent",
    agentBrief: policy.outreachAllowed
      ? `Follow up on open receivables for ${bundle.customerAccount.billingAccountName} without over-claiming any payment status.`
      : "Do not run an autonomous chase. Use this brief only for internal review or a tightly controlled handoff.",
    conversationGoal: policy.outreachAllowed
      ? "Confirm payment timing or remittance status while preserving billing-account and branch context."
      : "Confirm the correct contact or dispute status without pressuring for payment.",
    customerContext: [
      `Billing account: ${bundle.customerAccount.billingAccountName}`,
      `Contact: ${bundle.contact.fullName}${bundle.contact.verified ? " (verified)" : " (not verified)"}`,
      ...(bundle.customerAccount.branchIds.length
        ? [`Known branches: ${bundle.customerAccount.branchIds.join(", ")}`]
        : []),
    ],
    receivablesContext: [
      `Invoice count: ${bundle.receivables.invoiceCount}`,
      `Invoices: ${invoiceNumbers || "None listed"}`,
      `Collectible amount: ${formatMoney(bundle.receivables.collectibleAmountCents, bundle.receivables.currency)}`,
      ...(bundle.receivables.disputedAmountCents > 0
        ? [`Disputed amount: ${formatMoney(bundle.receivables.disputedAmountCents, bundle.receivables.currency)}`]
        : []),
    ],
    safeTalkingPoints: [
      buildOpeningLine(bundle, policy, "voice_agent"),
      buildReceivableSummary(bundle, policy),
      buildActionLine(bundle, policy, "voice_agent"),
    ],
    disallowedStatements: policy.disallowedStatements,
    objectionHandlingGuidance: [
      "If the customer says the invoice is disputed, acknowledge it and stop any chase framing.",
      "If the customer says payment was already made, capture the remittance details and hand off for review.",
      "If the contact is wrong, ask for the verified AP or treasury contact and stop the call flow.",
    ],
    handoffConditions: [
      "Escalate to a human operator if the contact disputes the balance.",
      "Escalate if entity ownership, branch routing, or cash application is unclear.",
      "Escalate if the customer requests a promise-to-pay override or negotiation.",
    ],
    toneGuidance: policy.confidenceLow
      ? "Keep the tone calm, short, and fact-based. Do not improvise beyond the listed talking points."
      : "Be concise, respectful, and confirmation-oriented.",
    postCallOutcomeSchema: [
      { field: "disposition", description: "Call result such as answered, wrong_contact, or callback_requested.", required: true },
      { field: "promised_date", description: "Promised payment date if one is given.", required: false },
      { field: "promised_amount_cents", description: "Promised amount when explicitly confirmed.", required: false },
      { field: "remittance_signal", description: "Whether the customer referenced a remittance, proof of payment, or bank advice.", required: true },
      { field: "operator_review_required", description: "Flag true when dispute, ambiguity, or verification concerns remain.", required: true },
    ],
    warnings: policy.warnings,
    contextUsed: bundle.explanation,
  };
}

function renderSmsDraft(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
): OutreachSmsDraft {
  const accountLabel = bundle.customerAccount.billingAccountName;
  const amountLabel = formatMoney(bundle.receivables.collectibleAmountCents, bundle.receivables.currency);
  const variantCore = policy.warnings.includes("cross_entity_ambiguity")
    ? `Hi ${bundle.contact.fullName}, this is Yield AROS following up on ${accountLabel}. Please confirm the right paying entity or share the remittance reference for review.`
    : policy.outreachAllowed
    ? `Hi ${bundle.contact.fullName}, this is Yield AROS following up on ${accountLabel}. We have ${amountLabel} still open. Please share payment timing or remittance details.`
    : `Yield AROS review note for ${accountLabel}: please verify the contact or resolve the invoice review before any payment follow-up is sent.`;

  const conservativeVariant = policy.outreachAllowed
    ? `Hi ${bundle.contact.fullName}, quick follow-up on ${accountLabel}. Please reply with payment timing or remittance status when convenient.`
    : `Yield AROS review note: outreach is paused until contact or invoice status is confirmed.`;

  const variants = [
    trimSms(variantCore),
    trimSms(conservativeVariant),
    trimSms(
      policy.outreachAllowed
        ? `Following up for ${accountLabel}. If payment has already been released, please send the remittance reference so our team can review it safely.`
        : `Review required for ${accountLabel}. Avoid SMS follow-up until the record is cleared.`,
    ),
  ];

  return {
    kind: "sms",
    variants: policy.confidenceLow ? variants.slice(0, 1) : variants,
    messagePurposeLabel: policy.outreachAllowed ? "payment_follow_up" : "review_hold",
    toneLabel: policy.outreachAllowed && !policy.confidenceLow ? "empathetic" : "conservative",
    personalizationSummary: buildPersonalizationSummary(bundle),
    warnings: policy.warnings,
    contextUsed: bundle.explanation,
  };
}

function selectRelevantThreads(input: OutreachGenerationInput): OutreachCommunicationHistory[] {
  if (input.currentThread) {
    const related = (input.relatedThreads ?? [])
      .filter((thread) => isThreadEntitySafe(thread, input.contact.id, input.account.id))
      .slice(0, MAX_RELATED_THREADS - 1);
    return [input.currentThread, ...related];
  }

  const related = (input.relatedThreads ?? [])
    .filter((thread) => isThreadEntitySafe(thread, input.contact.id, input.account.id))
    .slice(0, MAX_RELATED_THREADS);
  if (related.length > 0) {
    return related;
  }

  return (input.broadInboxFallbackThreads ?? [])
    .filter((thread) => isThreadEntitySafe(thread, input.contact.id, input.account.id))
    .slice(0, 1);
}

function isThreadEntitySafe(
  thread: OutreachCommunicationHistory,
  contactId: string,
  billingAccountId: string,
): boolean {
  return thread.contactId === contactId || thread.billingAccountId === billingAccountId;
}

function collectRiskFlags(input: {
  invoices: CustomerInvoice[];
  contact: Contact;
  crossEntityAmbiguity?: { isAmbiguous: boolean; reason: string };
  promiseToPay?: OutreachPromiseToPayStatus;
  remittances: OutreachRemittanceStatus[];
  deductions: OutreachDeductionOrException[];
  broadInboxFallbackUsed: boolean;
  branchIds: string[];
}): OutreachRiskFlag[] {
  const flags = new Set<OutreachRiskFlag>();

  if (
    input.invoices.some(
      (invoice) =>
        invoice.state === "disputed_full" ||
        (invoice.state === "disputed_partial" &&
          invoice.collectibleAmountCents === undefined &&
          invoice.disputedAmountCents === undefined),
    )
  ) {
    flags.add("disputed_invoice");
  }
  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    flags.add("unverified_contact");
  }
  if (input.crossEntityAmbiguity?.isAmbiguous) {
    flags.add("cross_entity_ambiguity");
  }
  if (input.branchIds.length > 0) {
    flags.add("branch_context_preserved");
  }
  flags.add("billing_account_context_preserved");
  if (input.promiseToPay?.state === "broken") {
    flags.add("promise_to_pay_broken");
  }
  if (input.remittances.some((item) => item.state === "review_required")) {
    flags.add("remittance_pending_review");
  }
  if (input.deductions.length > 0) {
    flags.add("deduction_or_exception_open");
  }
  if (input.broadInboxFallbackUsed) {
    flags.add("broad_inbox_fallback_used");
  }

  return [...flags];
}

function deriveApprovalRequirements(input: {
  account: BillingAccount;
  invoices: CustomerInvoice[];
  contact: Contact;
  crossEntityAmbiguity?: { isAmbiguous: boolean; reason: string };
}): string[] {
  const requirements: string[] = [];
  if (input.account.accountTier === "strategic") {
    requirements.push("Strategic account follow-up requires approval.");
  }
  if (
    input.invoices.some(
      (invoice) => invoice.state === "disputed_partial" || invoice.state === "disputed_full",
    )
  ) {
    requirements.push("Disputed receivables require controlled review before outreach.");
  }
  if (!input.contact.isVerified || !input.contact.allowAutoSend) {
    requirements.push("Unverified contacts cannot be used for auto-send.");
  }
  if (input.crossEntityAmbiguity?.isAmbiguous) {
    requirements.push("Cross-entity ambiguity must be reviewed before outward claims are made.");
  }

  return requirements;
}

function buildPersonalizationSummary(bundle: OutreachContextBundle): string {
  const parts = [
    `Used ${bundle.receivables.invoiceCount} invoice fact${bundle.receivables.invoiceCount === 1 ? "" : "s"}`,
    ...(bundle.accountMemory.signals.length
      ? [`${bundle.accountMemory.signals.length} account-memory signal${bundle.accountMemory.signals.length === 1 ? "" : "s"}`]
      : []),
    ...(bundle.recentCommunications.length
      ? [`${bundle.recentCommunications.length} relevant thread${bundle.recentCommunications.length === 1 ? "" : "s"}`]
      : []),
  ];

  return `${parts.join(", ")} for ${bundle.customerAccount.billingAccountName}.`;
}

function buildOpeningLine(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
  channel: OutreachChannel,
): string {
  if (!policy.outreachAllowed) {
    return buildReviewOnlyLine(bundle, policy, channel);
  }
  if (bundle.recentCommunications[0]?.source === "current_thread") {
    return "We are following up on the current conversation and checking whether payment timing or remittance details are already available.";
  }
  return "We are following up on the open receivables for this billing account and checking the next payment step.";
}

function buildReviewOnlyLine(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
  _channel: OutreachChannel,
): string {
  if (policy.warnings.includes("disputed_invoice")) {
    return "An invoice dispute is still open, so this copy intentionally avoids payment pressure and should stay under operator control.";
  }
  if (policy.warnings.includes("unverified_contact")) {
    return "The contact route still needs verification, so outreach should not be released without confirmation.";
  }

  return `The current context for ${bundle.customerAccount.billingAccountName} is still under review, so the message stays conservative.`;
}

function buildReceivableSummary(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
): string {
  if (!policy.outreachAllowed && bundle.receivables.disputedAmountCents > 0) {
    return `The bundle includes ${formatMoney(bundle.receivables.disputedAmountCents, bundle.receivables.currency)} in disputed exposure, so payment-demand language is intentionally withheld.`;
  }

  const invoiceLabel =
    bundle.receivables.invoiceCount === 1
      ? `invoice ${bundle.receivables.invoices[0]?.invoiceNumber ?? ""}`.trim()
      : `${bundle.receivables.invoiceCount} invoices`;

  return `${invoiceLabel} currently show ${formatMoney(bundle.receivables.collectibleAmountCents, bundle.receivables.currency)} as collectible at the billing-account level.`;
}

function buildActionLine(
  bundle: OutreachContextBundle,
  policy: OutreachPolicyDecision,
  channel: OutreachChannel,
): string {
  if (policy.warnings.includes("cross_entity_ambiguity")) {
    return channel === "sms"
      ? "Please confirm the right paying entity or share the remittance reference so our team can review it safely."
      : "Please confirm the right paying entity or share the remittance reference so our team can review it safely without making the wrong ledger claim.";
  }
  if (policy.warnings.includes("remittance_pending_review")) {
    return "If payment has already been released, please share the remittance reference and our team will review it before making any cash-application claims.";
  }

  return "Please let us know the payment timing or send the remittance reference if payment has already been released.";
}

function calculateAgingDays(dueDate: string, asOf: string): number {
  const due = new Date(dueDate);
  const now = new Date(asOf);
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000);
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function trimSms(value: string): string {
  return value.length <= 320 ? value : `${value.slice(0, 317).trimEnd()}...`;
}

function toActorRole(principal: Principal): "ar_collector" | "ar_manager" | "controller" | "admin" | "system" {
  return (principal.roles[0] ?? "system") as "ar_collector" | "ar_manager" | "controller" | "admin" | "system";
}
