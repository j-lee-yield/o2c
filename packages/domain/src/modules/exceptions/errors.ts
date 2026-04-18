import type { ExceptionKind } from "./schema.js";

export class CollectionAutomationBlockedByExceptionError extends Error {
  readonly exceptionId: string;
  readonly exceptionKind: ExceptionKind;
  readonly invoiceIds: string[];

  constructor(params: { exceptionId: string; exceptionKind: ExceptionKind; invoiceIds: string[] }) {
    super(
      `Collections automation is paused by exception "${params.exceptionId}" of type "${params.exceptionKind}".`
    );
    this.name = "CollectionAutomationBlockedByExceptionError";
    this.exceptionId = params.exceptionId;
    this.exceptionKind = params.exceptionKind;
    this.invoiceIds = params.invoiceIds;
  }
}
