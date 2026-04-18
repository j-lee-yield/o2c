export type UploadedDocumentType =
  | "invoice"
  | "bir_invoice"
  | "payment"
  | "proof_of_payment"
  | "remittance"
  | "remittance_advice"
  | "bank_statement"
  | "statement_of_account"
  | "delivery_receipt"
  | "proof_of_delivery"
  | "purchase_order"
  | "official_receipt"
  | "supporting"
  | "supporting_other";

export interface DeductionQueueItemReadModel {
  deductionCaseId: string;
  invoiceId?: string;
  paymentId?: string;
  exceptionId?: string;
  approvalRequestId?: string;
  accountName: string;
  invoiceNumber?: string;
  paymentReference?: string;
  reasonCode: string;
  queueStatus: string;
  priority: string;
  sourceChannel: string;
  targetAmountCents: number;
  currency: string;
  missingDocumentCount: number;
  claimCount: number;
  creditMemoState?: string;
  detectedAt: string;
  nextAction: string;
}

export interface DeductionQueueReadModel {
  generatedAt: string;
  summary: {
    totalOpenCases: number;
    approvalBlockedCases: number;
    syncReadyCases: number;
    missingDocumentsCases: number;
    totalTargetAmountCents: number;
  };
  items: DeductionQueueItemReadModel[];
}

export interface DeductionRelatedRecordSummary {
  id: string;
  status: string;
  label: string;
  amountCents?: number;
  currency?: string;
}

export interface DeductionDetailReadModel {
  deductionCase: {
    id: string;
    state: string;
    queueStatus: string;
    reasonCode: string;
    priority: string;
    sourceChannel: string;
    targetAmountCents: number;
    currency: string;
    detectedAt: string;
    openedAt: string;
    externalClaimReference?: string;
    ownerRole?: string;
    metadata: Record<string, unknown>;
  };
  relatedRecords: {
    invoice?: DeductionRelatedRecordSummary;
    payment?: DeductionRelatedRecordSummary;
    exception?: DeductionRelatedRecordSummary;
    approval?: DeductionRelatedRecordSummary;
  };
  lineItems: Array<{
    id: string;
    lineNumber: number;
    category: string;
    description: string;
    disputedAmountCents: number;
    acceptedAmountCents?: number;
    status: string;
  }>;
  claims: Array<{
    id: string;
    claimNumber: string;
    status: string;
    sourceChannel: string;
    assertedAmountCents: number;
    assertedAt: string;
    claimantName?: string;
  }>;
  documentBundle?: {
    id: string;
    status: string;
    completenessScore: number;
    documentIds: string[];
    missingDocumentTypes: UploadedDocumentType[];
  };
  creditMemoDraft?: {
    id: string;
    state: string;
    subtotalAmountCents: number;
    totalAmountCents: number;
    erpSyncStatus: string;
    memoNumber?: string;
    lastRefreshedAt: string;
    lastSyncedAt?: string;
    lines: Array<{
      id: string;
      lineNumber: number;
      description: string;
      amountCents: number;
    }>;
  };
}

export interface DeductionLineItemInput {
  id?: string;
  claimId?: string;
  lineNumber: number;
  category: string;
  description: string;
  disputedAmountCents: number;
  acceptedAmountCents?: number;
  quantity?: number;
  unitAmountCents?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimInput {
  id?: string;
  claimNumber: string;
  claimantName?: string;
  assertedAmountCents: number;
  assertedAt: string;
  status?: string;
  sourceChannel?: string;
  metadata?: Record<string, unknown>;
}

export interface DeductionUploadHookInput {
  caseId?: string;
  tenantId?: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceId?: string;
  paymentId?: string;
  exceptionId?: string;
  approvalRequestId?: string;
  externalClaimReference?: string;
  targetAmountCents: number;
  currency: string;
  reasonCode: string;
  priority?: string;
  ownerRole?: string;
  detectedAt: string;
  uploadedDocumentIds: string[];
  missingDocumentTypes?: UploadedDocumentType[];
  lineItems?: DeductionLineItemInput[];
  claims?: ClaimInput[];
  metadata?: Record<string, unknown>;
}

export interface DeductionApPortalJobHookInput {
  caseId?: string;
  tenantId?: string;
  sourceJobId: string;
  parentAccountId: string;
  billingAccountId: string;
  branchId?: string;
  invoiceId?: string;
  paymentId?: string;
  exceptionId?: string;
  approvalRequestId?: string;
  externalClaimReference: string;
  targetAmountCents: number;
  currency: string;
  reasonCode: string;
  priority?: string;
  detectedAt: string;
  claim: ClaimInput;
  lineItems?: DeductionLineItemInput[];
  documentIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface DeductionCreditMemoRefreshResult {
  deductionCaseId: string;
  creditMemoDraftId: string;
  state: string;
  totalAmountCents: number;
  lineCount: number;
}

export interface DeductionCreditMemoSyncResult {
  deductionCaseId: string;
  creditMemoDraftId: string;
  state: string;
  erpSyncStatus: string;
  syncedAt?: string;
}
