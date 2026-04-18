import { afterAll, describe, expect, it } from "vitest";

import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("payments API", () => {
  it("ingests a Perfios bank statement and exposes a readiness summary", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/ingestions/bank-statements/perfios",
      payload: {
        parsedStatement: {
          provider: "perfios",
          document: {
            documentId: "doc-bank-api-1",
            fileName: "bank-statement-march.pdf",
            checksum: "sha256-bank-api-1",
            source: "portal",
            uploadedAt: "2026-04-09T08:00:00.000Z",
          },
          raw_payload: {
            requestId: "perfios-request-api-1",
          },
          statement: {
            bank_name: "BDO",
            account_name: "Metro Group",
            account_number_masked: "XXXX-4321",
            statement_period_start: "2026-03-01",
            statement_period_end: "2026-03-31",
            currency: "PHP",
            parser_confidence: 0.93,
          },
          transactions: [
            {
              external_transaction_id: "txn-api-100",
              date: "2026-03-21",
              description: "Customer payment - Metro Group",
              amount: 100000,
              balance: 600000,
              category: "customer_payment",
              parser_confidence: 0.97,
              source_page: 1,
              source_row: 4,
            },
            {
              external_transaction_id: "txn-api-101",
              date: "2026-03-23",
              description: "Unreadable row",
              amount: -25000,
              balance: 575000,
              category: "unclassified",
              parser_confidence: 0.45,
              source_page: 2,
              source_row: 1,
            },
          ],
        },
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-payments-api-1",
          occurredAt: "2026-04-09T09:00:00.000Z",
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.normalizedTransactionCount).toBe(2);
    expect(created.readyTransactionCount).toBe(1);
    expect(created.reviewRequiredTransactionCount).toBe(1);
    expect(created.paymentCandidateCount).toBe(1);
    expect(created.finalPaymentCreationStatus).toBe("pending_matching_and_payment_materialization");

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/ingestions/bank-statements",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items[0]?.statementId).toBe(created.statementId);

    const fetchResponse = await app.inject({
      method: "GET",
      url: `/v1/payments/ingestions/bank-statements/${created.statementId}`,
    });
    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.json().statement.statement_id).toBe(created.statementId);

    const candidateListResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/candidates",
    });
    expect(candidateListResponse.statusCode).toBe(200);
    const candidate = candidateListResponse.json().items[0];
    expect(candidate.status).toBe("ingested_unmatched");
    expect(candidate.settlement_status).toBe("settled");

    const promoteResponse = await app.inject({
      method: "POST",
      url: `/v1/payments/candidates/${candidate.payment_candidate_id}/promote`,
      payload: {
        parentAccountId: "11111111-1111-5111-a111-111111111111",
        billingAccountId: "22222222-2222-5222-a222-222222222222",
        paymentReference: "PAY-API-100",
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-promote-api-1",
          occurredAt: "2026-04-09T09:05:00.000Z",
        },
      },
    });
    expect(promoteResponse.statusCode).toBe(201);
    expect(promoteResponse.json().paymentState).toBe("candidate_match_found");
    expect(promoteResponse.json().settlementStatus).toBe("settled");
  });

  it("holds probable check deposits until clearance before promotion", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/ingestions/bank-statements/perfios",
      payload: {
        parsedStatement: {
          provider: "perfios",
          document: {
            documentId: "doc-bank-api-2",
            fileName: "bank-statement-check.pdf",
            checksum: "sha256-bank-api-2",
            source: "portal",
            uploadedAt: "2026-04-09T08:00:00.000Z",
          },
          raw_payload: {
            requestId: "perfios-request-api-2",
          },
          statement: {
            bank_name: "BDO",
            account_name: "Metro Group",
            account_number_masked: "XXXX-4321",
            statement_period_start: "2026-03-01",
            statement_period_end: "2026-03-31",
            currency: "PHP",
            parser_confidence: 0.93,
          },
          transactions: [
            {
              external_transaction_id: "txn-api-200",
              date: "2026-03-22",
              cheque_number: "CHK-200",
              description: "Check deposit from customer",
              amount: 75000,
              balance: 675000,
              category: "customer_payment",
              parser_confidence: 0.97,
              source_page: 1,
              source_row: 5,
            },
          ],
        },
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-payments-api-2",
          occurredAt: "2026-04-09T10:00:00.000Z",
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().readyTransactionCount).toBe(0);
    expect(createResponse.json().reviewRequiredTransactionCount).toBe(0);

    const candidateListResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/candidates",
    });
    const candidate = candidateListResponse
      .json()
      .items.find((item: { payment_reference?: string }) => item.payment_reference === "CHK-200");
    expect(candidate?.settlement_status).toBe("pending_clearance");
    expect(candidate?.review_reason_codes).toContain("pending_check_clearance");

    const promoteResponse = await app.inject({
      method: "POST",
      url: `/v1/payments/candidates/${candidate.payment_candidate_id}/promote`,
      payload: {
        parentAccountId: "11111111-1111-5111-a111-111111111111",
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-promote-api-2",
          occurredAt: "2026-04-09T10:05:00.000Z",
        },
      },
    });
    expect(promoteResponse.statusCode).toBe(409);
    expect(promoteResponse.json().blockingReasons).toContain("settlement_status_pending_clearance");
  });

  it("accepts raw CSV uploads for bank statement ingestion", async () => {
    const csv = [
      "Date,Cheque Number,Description,Amount,Balance,Category",
      "2026-03-21,,Customer payment - Metro Group,100000,600000,customer_payment",
      "2026-03-22,CHK-101,Check deposit from customer,75000,675000,customer_payment",
      ",,Bad row,,500000,unclassified",
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/ingestions/bank-statements/file",
      headers: {
        "content-type": "text/csv",
        "x-file-name": "bank-transactions.csv",
        "x-upload-id": "bank-upload-1",
      },
      payload: Buffer.from(csv, "utf8"),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.uploadId).toBe("bank-upload-1");
    expect(body.sheetName).toBe("CSV");
    expect(body.normalizedTransactionCount).toBe(2);
    expect(body.paymentCandidateCount).toBe(2);
    expect(body.heldRows).toEqual([{ rowNumber: 4, reason: "Missing or invalid transaction date." }]);
  });
});
