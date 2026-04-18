export class UnsupportedCollectionsNegotiationError extends Error {
  readonly requestType: "discount" | "settlement" | "payment_plan";

  constructor(requestType: "discount" | "settlement" | "payment_plan") {
    super(`Collections phase 1 does not allow AI to handle ${requestType} requests.`);
    this.name = "UnsupportedCollectionsNegotiationError";
    this.requestType = requestType;
  }
}

export class CollectionApprovalRequiredError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super(`Collections action requires approval because "${reasonCode}" was triggered.`);
    this.name = "CollectionApprovalRequiredError";
    this.reasonCode = reasonCode;
  }
}

export class CollectionBlockedError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super(`Collections action is blocked because "${reasonCode}" was triggered.`);
    this.name = "CollectionBlockedError";
    this.reasonCode = reasonCode;
  }
}
