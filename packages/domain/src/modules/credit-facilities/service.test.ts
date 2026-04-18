import { describe, expect, it } from "vitest";
import {
  createCreditLineSummary,
  createLoanAlertFromSummary,
  createLoanBalanceSnapshotFromStatement,
  deriveLoanDpdBucket,
} from "./schema.js";

describe("credit facilities schema helpers", () => {
  it("maps DPD into conservative buckets", () => {
    expect(deriveLoanDpdBucket(0)).toBe("current");
    expect(deriveLoanDpdBucket(18)).toBe("days_1_30");
    expect(deriveLoanDpdBucket(47)).toBe("days_31_60");
    expect(deriveLoanDpdBucket(88)).toBe("days_61_90");
    expect(deriveLoanDpdBucket(101)).toBe("days_91_120");
    expect(deriveLoanDpdBucket(180)).toBe("days_120_plus");
  });

  it("builds a credit line summary with explicit money components", () => {
    const summary = createCreditLineSummary({
      id: "summary-1",
      createdAt: "2026-04-08T00:00:00.000Z",
      creditFacilityId: "facility-1",
      currency: "PHP",
      limitAmountCents: 10_000_000_00,
      principalOutstandingCents: 6_500_000_00,
      accruedInterestCents: 120_000_00,
      accruedDstCents: 15_000_00,
      accruedPenaltyCents: 5_000_00,
      totalPaidCents: 2_000_000_00,
      daysPastDue: 12,
      nextDueDate: "2026-04-15",
    });

    expect(summary.totalOutstandingCents).toBe(6_640_000_00);
    expect(summary.availableToDrawCents).toBe(3_500_000_00);
    expect(summary.daysPastDueBucket).toBe("days_1_30");
    expect(summary.utilizationRatio).toBe(0.65);
  });

  it("creates a balance snapshot from a lender statement without losing charges", () => {
    const snapshot = createLoanBalanceSnapshotFromStatement({
      id: "snapshot-1",
      createdAt: "2026-04-08T00:00:00.000Z",
      creditFacilityId: "facility-1",
      currency: "PHP",
      facilityLimitCents: 20_000_000_00,
      statement: {
        closingBalanceCents: 7_250_000_00,
        principalDueCents: 7_000_000_00,
        interestDueCents: 180_000_00,
        dstDueCents: 20_000_00,
        penaltyDueCents: 50_000_00,
        daysPastDue: 35,
        daysPastDueBucket: "days_31_60",
      },
    });

    expect(snapshot.totalOutstandingCents).toBe(7_250_000_00);
    expect(snapshot.availableToDrawCents).toBe(13_000_000_00);
    expect(snapshot.accruedPenaltyCents).toBe(50_000_00);
    expect(snapshot.daysPastDueBucket).toBe("days_31_60");
  });

  it("raises alerts for overdue and near-limit facilities", () => {
    const overdue = createLoanAlertFromSummary({
      id: "alert-1",
      createdAt: "2026-04-08T00:00:00.000Z",
      creditFacilityId: "facility-1",
      summary: {
        daysPastDue: 42,
        utilizationRatio: 0.72,
        nextDueDate: "2026-04-02",
      },
    });
    const nearLimit = createLoanAlertFromSummary({
      id: "alert-2",
      createdAt: "2026-04-08T00:00:00.000Z",
      creditFacilityId: "facility-2",
      summary: {
        daysPastDue: 0,
        utilizationRatio: 0.93,
        nextDueDate: "2026-04-15",
      },
    });

    expect(overdue?.severity).toBe("critical");
    expect(nearLimit?.title).toBe("Facility nearing full utilization");
  });
});
