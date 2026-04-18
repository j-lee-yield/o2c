import { describe, expect, it } from "vitest";

import { InMemoryAuditLogger } from "@o2c/audit";
import type { ConnectorConnectionReference, FieldMappingSet } from "@o2c/contracts";

import {
  createIntegrationSyncOrchestrator,
  createMockIntegrationConnector,
  InMemoryIdempotencyStore,
  InMemoryIntegrationJobStore,
  InMemoryIntegrationLogStore,
  InMemoryIntegrationWritebackStageStore,
  UnsupportedSyncCapabilityError,
} from "./integration-sync.js";

const auditContext = {
  actorId: "system",
  actorType: "automation" as const,
  correlationId: "integration-test",
  occurredAt: "2026-03-26T00:00:00.000Z",
};

const quickBooksConnection: ConnectorConnectionReference = {
  connectionId: "conn-quickbooks",
  tenantId: "tenant-1",
  provider: "quickbooks_online",
  credentialReference: "vault://quickbooks",
};

describe("integration sync framework", () => {
  it("maps pulled provider records into canonical fields", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const orchestrator = createIntegrationSyncOrchestrator(
      [
        createMockIntegrationConnector({
          provider: "quickbooks_online",
          pullResult: {
            records: [
              {
                object: "customers",
                externalId: "cust-1",
                sourceFingerprint: "fingerprint-1",
                values: {
                  customer: {
                    name: " Acme Trading ",
                    currency: "php",
                  },
                },
              },
            ],
          },
        }),
      ],
      {
        auditLogger,
        jobStore: new InMemoryIntegrationJobStore(),
        logStore: new InMemoryIntegrationLogStore(),
        stageStore: new InMemoryIntegrationWritebackStageStore(),
        idempotencyStore: new InMemoryIdempotencyStore(),
        now: () => "2026-03-26T01:00:00.000Z",
      },
    );
    const mapping: FieldMappingSet = {
      mappingId: "customer-import",
      provider: "quickbooks_online",
      object: "customers",
      rules: [
        {
          sourceField: "customer.name",
          targetField: "displayName",
          required: true,
          transform: "trim",
        },
        {
          sourceField: "customer.currency",
          targetField: "currency",
          transform: "uppercase",
        },
      ],
    };
    const job = await orchestrator.createSyncJob({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      direction: "pull",
      object: "customers",
    });

    const result = await orchestrator.executePullJob({
      job,
      connection: quickBooksConnection,
      auditContext,
      mapping,
    });

    expect(result.mappedRecords).toEqual([
      expect.objectContaining({
        externalId: "cust-1",
        values: {
          displayName: "Acme Trading",
          currency: "PHP",
        },
      }),
    ]);
    expect(result.job.status).toBe("succeeded");
    expect(auditLogger.events.at(-1)?.event.action).toBe("integration.pull_succeeded");
  });

  it("deduplicates repeated writeback stages using idempotency keys", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const connectorCalls: string[] = [];
    const orchestrator = createIntegrationSyncOrchestrator(
      [
        createMockIntegrationConnector({
          provider: "quickbooks_online",
          onPush: async (request) => {
            connectorCalls.push(request.stage.idempotencyKey);

            return {
              stageId: request.stage.stageId,
              target: request.stage.target,
              externalId: request.stage.sourceEntityId,
              status: "written",
            };
          },
        }),
      ],
      {
        auditLogger,
        jobStore: new InMemoryIntegrationJobStore(),
        logStore: new InMemoryIntegrationLogStore(),
        stageStore: new InMemoryIntegrationWritebackStageStore(),
        idempotencyStore: new InMemoryIdempotencyStore(),
        now: () => "2026-03-26T02:00:00.000Z",
      },
    );
    const stage = await orchestrator.stageWriteback({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      target: "notes",
      sourceEntityId: "invoice-1",
      idempotencyKey: "tenant-1:invoice-1:note-1",
      payload: {
        noteText: "Customer requested call back.",
      },
    });
    const firstJob = await orchestrator.createSyncJob({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      direction: "push",
      object: "notes",
    });
    const secondJob = await orchestrator.createSyncJob({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      direction: "push",
      object: "notes",
    });

    const firstResult = await orchestrator.executePushJob({
      job: firstJob,
      connection: quickBooksConnection,
      stage,
      auditContext,
    });
    const secondResult = await orchestrator.executePushJob({
      job: secondJob,
      connection: quickBooksConnection,
      stage,
      auditContext,
    });

    expect(firstResult.stage.status).toBe("pushed");
    expect(secondResult.stage.status).toBe("pushed");
    expect(secondResult.log.duplicateCount).toBe(1);
    expect(connectorCalls).toEqual(["tenant-1:invoice-1:note-1"]);
    expect(auditLogger.events.map(({ event }) => event.action)).toContain("integration.push_deduplicated");
  });

  it("logs writeback staging when audit context is provided", async () => {
    const auditLogger = new InMemoryAuditLogger();
    const orchestrator = createIntegrationSyncOrchestrator(
      [createMockIntegrationConnector({ provider: "quickbooks_online" })],
      {
        auditLogger,
        jobStore: new InMemoryIntegrationJobStore(),
        logStore: new InMemoryIntegrationLogStore(),
        stageStore: new InMemoryIntegrationWritebackStageStore(),
        idempotencyStore: new InMemoryIdempotencyStore(),
        now: () => "2026-03-26T03:00:00.000Z",
      },
    );

    const stage = await orchestrator.stageWriteback({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      target: "notes",
      sourceEntityId: "invoice-2",
      payload: { noteText: "Escalated for pilot review." },
      auditContext,
    });

    expect(stage.status).toBe("staged");
    expect(auditLogger.events.at(-1)?.event.action).toBe("integration.writeback_staged");
  });

  it("reuses an existing sync job when the same idempotent request is enqueued twice", async () => {
    const orchestrator = createIntegrationSyncOrchestrator(
      [createMockIntegrationConnector({ provider: "quickbooks_online" })],
      {
        auditLogger: new InMemoryAuditLogger(),
        jobStore: new InMemoryIntegrationJobStore(),
        logStore: new InMemoryIntegrationLogStore(),
        stageStore: new InMemoryIntegrationWritebackStageStore(),
        idempotencyStore: new InMemoryIdempotencyStore(),
        now: () => "2026-03-26T04:00:00.000Z",
      },
    );

    const firstJob = await orchestrator.createSyncJob({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      direction: "pull",
      object: "invoices",
      cursor: "cursor-1",
    });
    const secondJob = await orchestrator.createSyncJob({
      tenantId: "tenant-1",
      connectionId: quickBooksConnection.connectionId,
      provider: "quickbooks_online",
      direction: "pull",
      object: "invoices",
      cursor: "cursor-1",
    });

    expect(secondJob.jobId).toBe(firstJob.jobId);
    expect(secondJob.idempotencyKey).toBe(firstJob.idempotencyKey);
  });

  it("rejects staging writebacks for providers that do not support the target", async () => {
    const orchestrator = createIntegrationSyncOrchestrator(
      [createMockIntegrationConnector({ provider: "google_sheets" })],
      {
        auditLogger: new InMemoryAuditLogger(),
        jobStore: new InMemoryIntegrationJobStore(),
        logStore: new InMemoryIntegrationLogStore(),
        stageStore: new InMemoryIntegrationWritebackStageStore(),
        idempotencyStore: new InMemoryIdempotencyStore(),
        now: () => "2026-03-26T05:00:00.000Z",
      },
    );

    await expect(
      orchestrator.stageWriteback({
        tenantId: "tenant-1",
        connectionId: "conn-sheets",
        provider: "google_sheets",
        target: "notes",
        sourceEntityId: "invoice-3",
        payload: { noteText: "Unsupported writeback target." },
      }),
    ).rejects.toBeInstanceOf(UnsupportedSyncCapabilityError);
  });
});
