export class InvoiceHierarchyContextNotFoundError extends Error {
  readonly invoiceId: string;

  constructor(invoiceId: string) {
    super(`Invoice "${invoiceId}" is missing hierarchy context.`);
    this.name = "InvoiceHierarchyContextNotFoundError";
    this.invoiceId = invoiceId;
  }
}

export class BillingAccountNotFoundError extends Error {
  readonly billingAccountId: string;

  constructor(billingAccountId: string) {
    super(`Billing account "${billingAccountId}" was not found.`);
    this.name = "BillingAccountNotFoundError";
    this.billingAccountId = billingAccountId;
  }
}
