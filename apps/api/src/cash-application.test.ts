import { afterAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("cash application API", () => {
  it("returns the live cash application queue summary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/cash-application/queue",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary.needsReview).toBe(1);
    expect(body.overviewSummary.reviewQueueCount).toBe(1);
    expect(body.reviewRows[0].paymentReference).toBe("PAY-2024-0235");
    expect(body.highlightedPayment.settlementStatus).toBe("settled");
    expect(body.highlightedPayment.sourceBankTransactionIds).toEqual(["bank-txn-cash-payment-1"]);
    expect(body.activeSession.paymentId).toBe("cash_payment_1");
    expect(body.activeSession.writebackPreview.provider).toBe("odoo");
    expect(body.highlightedPayment.paymentReference).toBe("PAY-2024-0235");
  });

  it("requests approval instead of applying a risky suggested match directly", async () => {
    const applyResponse = await app.inject({
      method: "POST",
      url: "/v1/cash-application/cash_payment_1/apply/invoice-0945",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(applyResponse.statusCode).toBe(200);
    expect(applyResponse.json().footerTag).toBe("Approval requested");

    const finalityResponse = await app.inject({
      method: "GET",
      url: "/v1/cash-application/cash_payment_1/finality",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(finalityResponse.statusCode).toBe(200);
    expect(finalityResponse.json().sourceBankTransactionIds).toEqual(["bank-txn-cash-payment-1"]);

    const queueResponse = await app.inject({
      method: "GET",
      url: "/v1/cash-application/queue",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(queueResponse.statusCode).toBe(200);
    const queueBody = queueResponse.json();
    expect(queueBody.summary.needsReview).toBe(1);
    expect(queueBody.activeSession.finalizeFlow.requiresApproval).toBe(true);
  });

  it("blocks collectors from directly applying cash", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/cash-application/cash_payment_1/apply/invoice-0945",
      headers: {
        "x-principal-id": "collector-api",
        "x-principal-roles": "ar_collector",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows controllers to override the residual treatment", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/cash-application/cash_payment_1/residual",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
      payload: {
        residualType: "withholding_under_review",
        note: "Shortfall still needs withholding confirmation.",
      },
    });

    expect(response.statusCode).toBe(200);

    const finalityResponse = await app.inject({
      method: "GET",
      url: "/v1/cash-application/cash_payment_1/finality",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(finalityResponse.statusCode).toBe(200);
    expect(finalityResponse.json().residualActions[0]?.residualType).toBe("withholding_under_review");
  });

  it("stages an Odoo writeback preview for supported cash-only settlements", async () => {
    const previewResponse = await app.inject({
      method: "GET",
      url: "/v1/cash-application/cash_payment_2/writeback-preview?provider=odoo",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json().supportStatus).toBe("supported");

    const stageResponse = await app.inject({
      method: "POST",
      url: "/v1/cash-application/cash_payment_2/writeback/stage?provider=odoo",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller,ar_manager",
      },
    });

    expect(stageResponse.statusCode).toBe(200);
    expect(stageResponse.json().writebackStatus.state).toBe("pending");
  });
});
