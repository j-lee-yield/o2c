import type { CommunicationChannel } from "./communications.js";
export interface ChannelReasonSummary {
    channel: CommunicationChannel;
    summary: string;
}
export interface RankedActionRecommendationDisplay {
    action: string;
    score: number;
    channel?: CommunicationChannel;
    blockedBySafety: boolean;
    reasonSummary: string;
}
export interface NextBestActionDisplay {
    action: string;
    score: number;
    channel?: CommunicationChannel;
    reasonSummary: string;
    channelReasonSummaries: ChannelReasonSummary[];
    rankedRecommendations: RankedActionRecommendationDisplay[];
    sparseFallback: boolean;
}
export interface PaymentBehaviorSummaryDisplay {
    summary: string;
    sparseFallback: boolean;
}
export interface PreferredContactRecommendationDisplay {
    contactName: string;
    contactMethod?: string;
    reasonSummary: string;
    sparseFallback: boolean;
}
export interface PreferredChannelRecommendationDisplay {
    channel: CommunicationChannel;
    reasonSummary: string;
    sparseFallback: boolean;
}
export interface PreferredSendTimingDisplay {
    label: string;
    reasonSummary: string;
    sparseFallback: boolean;
}
export interface DocumentBundleRecommendationDisplay {
    label: string;
    reasonSummary: string;
    sparseFallback: boolean;
}
export interface PtpReliabilityIndicatorDisplay {
    level: "high" | "medium" | "low" | "unknown";
    reasonSummary: string;
}
export interface MatchConfidenceExplanationDisplay {
    label: string;
    reasonSummary: string;
}
export interface ExceptionPlaybookRecommendationDisplay {
    playbookLabel: string;
    nextStep: string;
    reasonSummary: string;
}
export interface LearningWorkspaceSummary {
    accountPaymentBehaviorSummary: PaymentBehaviorSummaryDisplay;
    preferredContactRecommendation: PreferredContactRecommendationDisplay;
    preferredChannelRecommendation: PreferredChannelRecommendationDisplay;
    preferredSendTiming: PreferredSendTimingDisplay;
    documentBundleRecommendation: DocumentBundleRecommendationDisplay;
    ptpReliabilityIndicator: PtpReliabilityIndicatorDisplay;
    nextBestActionScore: NextBestActionDisplay;
}
export interface LearningCollectionsSummary {
    preferredContactRecommendation: PreferredContactRecommendationDisplay;
    preferredChannelRecommendation: PreferredChannelRecommendationDisplay;
    preferredSendTiming: PreferredSendTimingDisplay;
    documentBundleRecommendation: DocumentBundleRecommendationDisplay;
    ptpReliabilityIndicator: PtpReliabilityIndicatorDisplay;
    nextBestActionScore: NextBestActionDisplay;
}
export interface LearningCashApplicationSummary {
    matchConfidenceExplanation: MatchConfidenceExplanationDisplay;
}
export interface LearningExceptionSummary {
    exceptionPlaybookRecommendation: ExceptionPlaybookRecommendationDisplay;
}
export interface LearningDemoScenario {
    id: string;
    accountName: string;
    billingAccountId: string;
    workspace: LearningWorkspaceSummary;
    collections: LearningCollectionsSummary;
    cashApplication: LearningCashApplicationSummary;
    exception: LearningExceptionSummary;
}
//# sourceMappingURL=learning-ui.d.ts.map