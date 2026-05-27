import { afterAll, describe, expect, it } from "vitest";

import { buildApiApp } from "./app.js";

const originalEnableDemoData = process.env.ENABLE_DEMO_DATA;
process.env.ENABLE_DEMO_DATA = "true";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
  if (originalEnableDemoData === undefined) {
    delete process.env.ENABLE_DEMO_DATA;
  } else {
    process.env.ENABLE_DEMO_DATA = originalEnableDemoData;
  }
});

describe("operator console API", () => {
  it("returns a full operator console payload for the web app", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/operator-console",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.generatedAt).toBeTypeOf("string");
    expect(payload.commandCenterSource.label).toBe("Live operator console API");
    expect(payload.invoiceIndex.summary.totalInvoices).toBeGreaterThan(0);
    expect(payload.metrics.length).toBeGreaterThan(0);
    expect(payload.dashboardSummaryCards.length).toBe(5);
    expect(payload.homeSetupChecklist.items.length).toBeGreaterThan(0);
    expect(payload.homeTaskSummary.views).toHaveLength(3);
    expect(payload.outreachIntelligence.contextSummary.accountName).toBeTypeOf("string");
    expect(payload.outreachIntelligence.contextSummary.accountName).toBe(payload.accountWorkspace.accountName);
    expect(payload.outreachIntelligence.contextSummary.billingAccountId).toBe(
      payload.accountWorkspace.billingAccountId,
    );
    expect(payload.outreachIntelligence.contextSummary.contextSources.length).toBeGreaterThan(0);
    expect(payload.controlCenter.workflows.length).toBeGreaterThan(0);
    expect(payload.controlCenter.providerPreview.providerType).toBeTypeOf("string");
    expect(payload.outreachIntelligence.emailDraft.subjectSuggestions.length).toBeGreaterThan(0);
    expect(payload.outreachIntelligence.voiceAgent.safeTalkingPoints.length).toBeGreaterThan(0);
    expect(payload.outreachIntelligence.smsDraft.variants.length).toBeGreaterThan(0);
    expect(["preview_only", "email_execution_ready"]).toContain(
      payload.outreachIntelligence.previewMode,
    );
    expect(
      payload.homeTaskSummary.views.reduce(
        (sum: number, view: { items: Array<unknown> }) => sum + view.items.length,
        0,
      ),
    ).toBeGreaterThan(0);
    expect(payload.homeCollectionsMetrics.actionPath).toBe("/collections");
    expect(payload.homeSnapshotMetrics.actionPath).toBe("/invoices");
    expect(
      payload.homeTaskSummary.views
        .find((view: { id: string }) => view.id === "by_task_type")
        ?.items.some((item: { id: string }) => item.id === "deductions_tasks")
    ).toBe(true);
    expect(
      payload.homeTaskSummary.views
        .find((view: { id: string }) => view.id === "by_task_type")
        ?.items.some((item: { id: string }) => item.id === "org_credit_line_tasks")
    ).toBe(true);
    expect(payload.homeAgingBalance.buckets.length).toBe(5);
    expect(payload.invoiceAgingAnalytics.buckets.length).toBe(5);
    expect(payload.overdueExposure.overdueInvoiceCount).toBeGreaterThanOrEqual(0);
    expect(payload.collectibleVsDisputed.collectibleOpenAmountCents).toBeGreaterThanOrEqual(0);
    expect(payload.linkedPaymentRemittanceStatus.paymentsAwaitingReviewCount).toBeGreaterThanOrEqual(0);
    expect(payload.exceptionCounts.totalOpen).toBeGreaterThanOrEqual(0);
    expect(payload.customerIndex.length).toBeGreaterThan(0);
    expect(payload.customerProfile.tabs.map((item: { label: string }) => item.label)).toContain("Overview");
    expect(payload.customerProfile.overviewSummary.hierarchySummary).toBeTypeOf("string");
    expect(payload.accountProfileSummaries.length).toBeGreaterThan(0);
    expect(payload.nextActionSummaryCards.length).toBe(3);
    expect(payload.collectionsQueue.length).toBeGreaterThan(0);
    expect(payload.collectionsQueue[0]?.learning?.preferredChannelRecommendation?.reasonSummary).toBeTypeOf("string");
    expect(
      payload.collectionsQueue.every(
        (item: { learning?: { nextBestActionScore?: unknown } }) => item.learning?.nextBestActionScore,
      ),
    ).toBe(true);
    expect(payload.collectionsQueue[0]?.learning?.nextBestActionScore?.rankedRecommendations?.[0]?.reasonSummary).toBeTypeOf("string");
    expect(payload.accountWorkspace.learning?.accountPaymentBehaviorSummary?.summary).toBeTypeOf("string");
    expect(payload.invoiceDetail.linkedStatuses.length).toBeGreaterThan(0);
    expect(payload.paymentsQueue.length).toBeGreaterThan(0);
    expect(payload.cashApplicationQueue.highlightedPayment?.matches[0]?.learning?.matchConfidenceExplanation?.reasonSummary).toBeTypeOf("string");
    expect(payload.cashApplicationQueue.summary.needsReview).toBeGreaterThanOrEqual(0);
    expect(payload.loanDashboard.facilityCount).toBeGreaterThan(0);
    expect(payload.creditFacilities.length).toBeGreaterThan(0);
    expect(payload.loanStatementDetail.paymentApplications.length).toBeGreaterThan(0);
    expect(payload.loanRepaymentHistory.length).toBeGreaterThan(0);
    expect(payload.loanAlerts.length).toBeGreaterThan(0);
    expect(payload.loanTasks.length).toBeGreaterThan(0);
    expect(payload.taskQueue.length).toBeGreaterThan(0);
    expect(payload.taskQueue.map((item: { status: string }) => item.status)).toEqual(
      expect.arrayContaining(["completed", "closed"]),
    );
    const joshTask = payload.taskQueue.find(
      (item: { customerName: string; composeEmail?: { draft?: { body?: string } } }) =>
        item.customerName === "Josh",
    );
    expect(joshTask?.composeEmail?.draft?.body).toContain("JOSH-INV-1001");
    expect(payload.exceptionsQueue[0]?.learning?.exceptionPlaybookRecommendation?.nextStep).toBeTypeOf("string");
    expect(payload.approvalsQueue.length).toBeGreaterThan(0);
    expect(
      payload.screenInventory.some((item: { screen: string }) => item.screen === "Org credit line dashboard (demo)")
    ).toBe(true);
    expect(payload.screenInventory.some((item: { screen: string }) => item.screen === "Collections queue")).toBe(true);
  });
});
