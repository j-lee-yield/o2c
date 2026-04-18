export interface CollectionEmailAddress {
  email: string;
  name?: string;
}

export interface CollectionEmailInvoicePayload {
  invoiceId: string;
  invoiceNumber: string;
  branchId?: string;
  amountCents: number;
  currency: string;
  dueDate?: string;
  daysPastDue?: number;
  isUrgent: boolean;
}

export interface CollectionEmailSendWindowPayload {
  timezone: string;
  startHour: number;
  endHour: number;
  allowedWeekdays: number[];
}

export interface CollectionEmailProviderHook {
  templateKey: "collections_grouped_email_v1";
  reminderId: string;
  billingAccountId: string;
  parentAccountId: string;
  escalationStage: string;
  deliveryState: "ready" | "approval_needed" | "blocked";
  groupingMode: "billing_account" | "invoice";
  recipient: CollectionEmailAddress;
  subjectLine: string;
  previewLine: string;
  bodySections: string[];
  invoices: CollectionEmailInvoicePayload[];
  urgentInvoiceIds: string[];
  sendWindow: CollectionEmailSendWindowPayload;
  metadata: Record<string, unknown>;
}
