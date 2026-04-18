import { afterAll, describe, expect, it } from "vitest";

import { makeRemittanceEmailInput } from "@o2c/testkit";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("remittance ingestion API", () => {
  it("creates a remittance ingestion record from an email payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/remittances/ingestions",
      payload: {
        source: makeRemittanceEmailInput(),
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-api-1",
          occurredAt: "2026-03-26T00:00:00.000Z"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.outcome.route).toBe("link_payment_candidate");
    expect(body.record.state).toBe("linked_to_payment");
    expect(body.record.attachmentDocumentIds).toEqual(["doc-remit-email-1"]);
  });

  it("supports fetching and orphan-checking an ingested remittance", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/remittances/ingestions",
      payload: {
        source: makeRemittanceEmailInput({
          sourceId: "email-msg-orphan",
          receivedAt: "2026-03-20T08:00:00.000Z",
          bodyText: "Unable to identify the invoices in this payment advice."
        }),
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-api-2",
          occurredAt: "2026-03-26T00:00:00.000Z"
        }
      }
    });
    const created = createResponse.json();

    const fetchResponse = await app.inject({
      method: "GET",
      url: `/v1/remittances/${created.outcome.remittanceId}`
    });
    expect(fetchResponse.statusCode).toBe(200);

    const orphanResponse = await app.inject({
      method: "POST",
      url: `/v1/remittances/${created.outcome.remittanceId}/orphan-check`,
      payload: {
        auditContext: {
          actorId: "api-test",
          actorType: "system",
          correlationId: "corr-api-3",
          occurredAt: "2026-03-26T00:00:00.000Z"
        },
        asOf: "2026-03-22T09:00:00.000Z"
      }
    });

    expect(orphanResponse.statusCode).toBe(200);
    const orphaned = orphanResponse.json();
    expect(orphaned.orphaned).toBe(true);
    expect(orphaned.record.state).toBe("orphaned");
  });
});
