export type CommunicationChannel = "email" | "sms" | "call";
export type CommunicationProvider = "internal" | "twilio" | "vapi" | "retell" | "elevenlabs" | "other";
export type CommunicationIntentType = "reminder" | "overdue_follow_up" | "request_remittance" | "resend_documents" | "ptp_follow_up" | "escalation" | "exception_resolution";
export interface CommunicationAttemptPayload {
    id: string;
    channel: CommunicationChannel;
    provider: CommunicationProvider;
    direction: "outbound" | "inbound";
    intentType: CommunicationIntentType;
    status: "queued" | "sent" | "delivered" | "opened" | "clicked" | "replied" | "failed" | "bounced" | "connected" | "missed" | "voicemail_left" | "completed" | "blocked";
    recipient: {
        email?: string;
        phoneNumber?: string;
        displayName?: string;
        verified: boolean;
    };
    invoiceIds: string[];
    subjectLine?: string;
    contentTemplateKey?: string;
    bodyPreview?: string;
    blockedReasons: string[];
    metadata: Record<string, unknown>;
}
export interface EmailOutcomePayload {
    communicationAttemptId: string;
    delivered: boolean;
    opened: boolean;
    replied: boolean;
    bounced: boolean;
    linkClicked: boolean;
    attachmentsSent: string[];
    docsRequested: boolean;
    extractedPtp?: {
        promisedAmountCents?: number;
        promisedDate?: string;
    };
    extractedRemittanceSignal: boolean;
    metadata: Record<string, unknown>;
}
export interface SmsOutcomePayload {
    communicationAttemptId: string;
    delivered: boolean;
    replied: boolean;
    clicked: boolean;
    optOutReceived: boolean;
    extractedPtp?: {
        promisedAmountCents?: number;
        promisedDate?: string;
    };
    extractedRemittanceSignal: boolean;
    metadata: Record<string, unknown>;
}
export interface CallOutcomePayload {
    communicationAttemptId: string;
    answered: boolean;
    durationSeconds?: number;
    disposition: "connected" | "missed" | "voicemail_left" | "wrong_contact" | "callback_requested" | "operator_review_required";
    promisedAmountCents?: number;
    promisedDate?: string;
    transcriptUri?: string;
    transcriptSummary?: string;
    transcriptSegments: Array<{
        speaker: "agent" | "customer" | "unknown";
        startedAtSeconds?: number;
        text: string;
    }>;
    sentimentLabel?: "positive" | "neutral" | "negative";
    operatorReviewRequired: boolean;
    metadata: Record<string, unknown>;
}
//# sourceMappingURL=communications.d.ts.map