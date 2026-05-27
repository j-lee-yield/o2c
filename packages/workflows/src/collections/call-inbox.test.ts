import { describe, expect, it } from "vitest";
import type { CallInboxCallRecord } from "@o2c/contracts";
import { applyCallInboxFilters } from "./call-inbox.js";

describe("call inbox filters", () => {
  it("interprets date ranges in Asia/Manila operator time", () => {
    const manilaMorningRecord = buildCallRecord({
      id: "call-manila-morning",
      startedAt: "2026-05-03T16:30:00.000Z",
    });

    expect(
      applyCallInboxFilters([manilaMorningRecord], {
        dateFrom: "2026-05-04",
        dateTo: "2026-05-04",
      }),
    ).toHaveLength(1);

    expect(
      applyCallInboxFilters([manilaMorningRecord], {
        dateFrom: "2026-05-03",
        dateTo: "2026-05-03",
      }),
    ).toHaveLength(0);
  });
});

function buildCallRecord(input: { id: string; startedAt: string }): CallInboxCallRecord {
  return {
    id: input.id,
    tenantId: "tenant_1",
    provider: "retell",
    providerCallId: input.id,
    customerName: "Manila Customer",
    direction: "outbound",
    status: "completed",
    startedAt: input.startedAt,
    voicemail: false,
    sentiment: "neutral",
    classifications: [],
    invoiceRefs: [],
    transcriptSegments: [],
    taskRefs: [],
    openTasksCount: 0,
    metadata: {},
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
  };
}
