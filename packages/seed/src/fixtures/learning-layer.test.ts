import { describe, expect, it } from "vitest";

import {
  buildLearningLayerDemoScenarios,
  buildLearningLayerSeedBundle,
} from "./learning-layer.js";

describe("learning layer seed bundle", () => {
  it("provides explainable multi-channel-ready learning fixtures", () => {
    const bundle = buildLearningLayerSeedBundle();

    expect(bundle.communicationAttempts[0]?.channel).toBe("email");
    expect(bundle.communicationAttempts[1]?.status).toBe("blocked");
    expect(bundle.callOutcomes[0]?.operatorReviewRequired).toBe(true);
    expect(bundle.channelBehaviorProfiles[0]?.channel).toBe("email");
    expect(bundle.learningEvents.length).toBeGreaterThan(0);
    expect(bundle.accountBehaviorProfiles[0]?.preferredChannel).toBe("email");
    expect(bundle.accountBehaviorProfiles[0]?.safetyFlags.doNotSms).toBe(true);
    expect(bundle.contactBehaviorProfiles[0]?.evidenceSummary.feedbackCount).toBe(1);
    expect(bundle.operatorFeedback[0]?.appliesToFutureScoring).toBe(true);
    expect(bundle.nextBestActionScores[0]?.recommendedAction).toBe("hold_for_review");
    expect(bundle.nextBestActionScores[0]?.hardSafetyBlocks).toContain("no_sms_if_opt_out_exists");
  });

  it("provides concise demo scenarios for learning-aware operator surfaces", () => {
    const scenarios = buildLearningLayerDemoScenarios();

    expect(scenarios.length).toBeGreaterThan(1);
    expect(scenarios[0]?.workspace.accountPaymentBehaviorSummary.summary).toBeTypeOf("string");
    expect(scenarios[0]?.collections.nextBestActionScore.channelReasonSummaries.length).toBeGreaterThan(0);
    expect(scenarios[0]?.collections.nextBestActionScore.rankedRecommendations[0]?.reasonSummary).toBeTypeOf("string");
    expect(scenarios[1]?.workspace.accountPaymentBehaviorSummary.sparseFallback).toBe(true);
    expect(scenarios[1]?.cashApplication.matchConfidenceExplanation.reasonSummary).toContain("payer proof");
  });
});
