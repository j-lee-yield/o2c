import type { CommunicationIntentType } from "../communications.js";

export type OutreachChannel = "email" | "voice_agent" | "sms";

export type OutreachRiskFlag =
  | "disputed_invoice"
  | "unverified_contact"
  | "cross_entity_ambiguity"
  | "branch_context_preserved"
  | "billing_account_context_preserved"
  | "approval_required"
  | "low_confidence_personalization"
  | "broad_inbox_fallback_used"
  | "promise_to_pay_broken"
  | "remittance_pending_review"
  | "deduction_or_exception_open";

export interface OutreachMessageSummary {
  id: string;
  direction: "inbound" | "outbound";
  occurredAt: string;
  subjectLine?: string;
  bodyPreview: string;
  matchedInvoiceIds?: string[];
}

export interface OutreachCommunicationHistory {
  id: string;
  source: "current_thread" | "related_thread" | "broad_inbox_fallback";
  channel: "email";
  contactId?: string;
  billingAccountId?: string;
  providerThreadId?: string;
  subjectLine?: string;
  participants: string[];
  lastMessageAt?: string;
  messages: OutreachMessageSummary[];
}

export interface OutreachOperatorFeedbackSignal {
  source: "operator_feedback" | "approved_pattern" | "contact_preference";
  label: string;
  summary: string;
  value?: string;
}

export interface OutreachPaymentActivity {
  id: string;
  occurredAt: string;
  amountCents: number;
  currency: string;
  status: "pending" | "posted" | "applied" | "review_required";
  reference?: string;
  matchedInvoiceIds?: string[];
}

export interface OutreachRemittanceStatus {
  id: string;
  occurredAt: string;
  state:
    | "received_unparsed"
    | "parsed_structured"
    | "linked_to_payment"
    | "linked_to_invoice_candidate"
    | "review_required"
    | "resolved"
    | "orphaned";
  amountCents?: number;
  linkedInvoiceIds?: string[];
  summary?: string;
}

export interface OutreachDeductionOrException {
  id: string;
  invoiceId?: string;
  amountCents?: number;
  state: string;
  summary: string;
}

export interface OutreachPromiseToPayStatus {
  id: string;
  state:
    | "detected_unconfirmed"
    | "accepted"
    | "due_today"
    | "kept"
    | "broken"
    | "superseded"
    | "cancelled";
  promisedDate?: string;
  promisedAmountCents?: number;
  summary?: string;
}

export interface OutreachContextExplanation {
  sourcesUsed: string[];
  selectedThreadIds: string[];
  omittedThreadIds: string[];
  retrievalOrder: Array<
    "current_receivable_context" | "account_memory" | "communication_history" | "broad_inbox_fallback"
  >;
  notes: string[];
}

export interface OutreachContactSummary {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  verified: boolean;
  allowAutoSend: boolean;
}

export interface OutreachReceivableFact {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  amountCents: number;
  collectibleAmountCents: number;
  disputedAmountCents: number;
  dueDate?: string;
  agingDays?: number;
  state: string;
  branchId?: string;
}

export interface OutreachContextBundle {
  id: string;
  generatedAt: string;
  tenantId: string;
  channel: OutreachChannel;
  intent: CommunicationIntentType;
  customerAccount: {
    parentAccountId: string;
    billingAccountId: string;
    billingAccountName: string;
    accountNumber: string;
    branchId?: string;
    branchIds: string[];
    currency: string;
    accountTier: "standard" | "strategic";
  };
  contact: OutreachContactSummary;
  threadId?: string;
  operatorIntent?: string;
  invoiceIds: string[];
  receivables: {
    invoices: OutreachReceivableFact[];
    invoiceCount: number;
    totalAmountCents: number;
    collectibleAmountCents: number;
    disputedAmountCents: number;
    oldestDueDate?: string;
    currency: string;
  };
  paymentState: {
    recentPayments: OutreachPaymentActivity[];
    remittances: OutreachRemittanceStatus[];
    deductions: OutreachDeductionOrException[];
    promiseToPay?: OutreachPromiseToPayStatus;
  };
  accountMemory: {
    signals: OutreachOperatorFeedbackSignal[];
  };
  recentCommunications: OutreachCommunicationHistory[];
  riskFlags: OutreachRiskFlag[];
  approvalRequirements: string[];
  confidence: {
    score: number;
    label: "high" | "medium" | "low";
    reasons: string[];
  };
  explanation: OutreachContextExplanation;
}

export interface OutreachPolicyDecision {
  outreachAllowed: boolean;
  operatorReviewRequired: boolean;
  approvalRequired: boolean;
  escalationRequired: boolean;
  confidenceLow: boolean;
  reviewStatus: "ready_for_review" | "blocked" | "approval_required";
  disallowedStatements: string[];
  prohibitedClaims: string[];
  warnings: OutreachRiskFlag[];
  channelRestrictions: {
    email: string[];
    voiceAgent: string[];
    sms: string[];
    autoSendAllowed: boolean;
    handoffAllowed: boolean;
  };
  rationale: string[];
}

export interface OutreachEmailDraft {
  kind: "email";
  subjectSuggestions: string[];
  emailBody: string;
  toneLabel: "conservative" | "empathetic" | "firm";
  personalizationSummary: string;
  warnings: OutreachRiskFlag[];
  contextUsed: OutreachContextExplanation;
}

export interface VoiceAgentContextPayload {
  kind: "voice_agent";
  agentBrief: string;
  conversationGoal: string;
  customerContext: string[];
  receivablesContext: string[];
  safeTalkingPoints: string[];
  disallowedStatements: string[];
  objectionHandlingGuidance: string[];
  handoffConditions: string[];
  toneGuidance: string;
  postCallOutcomeSchema: Array<{
    field: string;
    description: string;
    required: boolean;
  }>;
  warnings: OutreachRiskFlag[];
  contextUsed: OutreachContextExplanation;
}

export interface OutreachSmsDraft {
  kind: "sms";
  variants: string[];
  messagePurposeLabel: string;
  toneLabel: "conservative" | "empathetic" | "firm";
  personalizationSummary: string;
  warnings: OutreachRiskFlag[];
  contextUsed: OutreachContextExplanation;
}

export interface OutreachExecutionHandoff {
  id: string;
  channel: OutreachChannel;
  provider: string;
  preparedAt: string;
  readiness: "preview_only" | "handoff_ready";
  warnings: OutreachRiskFlag[];
  payload: Record<string, unknown>;
}
