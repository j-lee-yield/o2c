import type { ConnectorKind, IntegrationProvider } from "../integrations/framework.js";
export type InvoiceIndexProvider = IntegrationProvider | "business_central" | "seed_demo" | "spreadsheet_upload";
export type InvoiceIndexSourceKind = ConnectorKind | "seed";
export type InvoiceIndexImportMode = "live_connection" | "seed_fallback" | "manual_upload";
export type InvoiceIndexStatus = "open" | "partial" | "paid" | "disputed" | "voided";
export type InvoiceIndexTypeFilter = "all" | "live_connection" | "manual_upload" | "seed_fallback" | "installment_plan" | "standard_invoice";
export type InvoiceIndexMoreFilter = "all" | "overdue" | "due_today" | "due_soon" | "with_promise" | "with_balance" | "with_branch" | "missing_branch";
export interface InvoiceIndexFilters {
    q?: string;
    status?: InvoiceIndexStatus | "all";
    type?: InvoiceIndexTypeFilter;
    more?: InvoiceIndexMoreFilter;
    page?: number;
    pageSize?: number;
}
export interface InvoiceIndexEntry {
    id: string;
    sourceProvider: InvoiceIndexProvider;
    sourceKind: InvoiceIndexSourceKind;
    sourceLabel: string;
    importMode: InvoiceIndexImportMode;
    externalId?: string;
    canonicalInvoiceId?: string;
    customerName: string;
    customerReference?: string;
    parentAccountId?: string;
    parentAccountName?: string;
    billingAccountId?: string;
    billingAccountName?: string;
    branchId?: string;
    branchName?: string;
    invoiceNumber: string;
    currency: string;
    totalAmountCents: number;
    openAmountCents: number;
    overdueAmountCents?: number;
    dueNowAmountCents?: number;
    futureAmountCents?: number;
    collectibleAmountCents?: number;
    paidAmountCents: number;
    status: InvoiceIndexStatus;
    sourceStatus: string;
    issuedAt?: string;
    dueDate?: string;
    lastImportedAt?: string;
    daysPastDue?: number;
    installmentPlanId?: string;
    oldestOverdueInstallmentDaysPastDue?: number;
    missedInstallmentCount?: number;
    nextInstallmentDueDate?: string;
    nextInstallmentAmountCents?: number;
    tags: string[];
    metadata: Record<string, unknown>;
}
export interface InvoiceIndexProviderSummary {
    provider: InvoiceIndexProvider;
    label: string;
    kind: InvoiceIndexSourceKind;
    importMode: InvoiceIndexImportMode;
    invoiceCount: number;
    openInvoiceCount: number;
    totalAmountCents: number;
    openAmountCents: number;
}
export interface InvoiceIndexStatusSummary {
    status: InvoiceIndexStatus;
    invoiceCount: number;
    totalAmountCents: number;
    openAmountCents: number;
}
export interface InvoiceIndexSummary {
    totalInvoices: number;
    totalAmountCents: number;
    openAmountCents: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
    disputedInvoiceCount: number;
    paidInvoiceCount: number;
    connectedProviderCount: number;
}
export interface InvoiceIndexResponse {
    generatedAt: string;
    source: {
        kind: "live" | "seeded";
        label: string;
        detail: string;
    };
    summary: InvoiceIndexSummary;
    providers: InvoiceIndexProviderSummary[];
    statuses: InvoiceIndexStatusSummary[];
    invoices: InvoiceIndexEntry[];
    filters?: InvoiceIndexFilters;
    pagination?: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
    };
}
//# sourceMappingURL=index.d.ts.map
