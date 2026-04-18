import type {
  OutreachExecutionHandoff,
  OutreachPolicyDecision,
  VoiceAgentContextPayload,
} from "@o2c/contracts";

export interface OutreachProviderAdapter<TOutput> {
  channel: "voice_agent" | "sms" | "email";
  provider: string;
  prepareHandoff(input: {
    handoffId: string;
    preparedAt: string;
    output: TOutput;
    policy: OutreachPolicyDecision;
    metadata?: Record<string, unknown>;
  }): OutreachExecutionHandoff;
}

export class RetellVoiceAgentAdapter
  implements OutreachProviderAdapter<VoiceAgentContextPayload>
{
  readonly channel = "voice_agent" as const;
  readonly provider = "retell";

  prepareHandoff(input: {
    handoffId: string;
    preparedAt: string;
    output: VoiceAgentContextPayload;
    policy: OutreachPolicyDecision;
    metadata?: Record<string, unknown>;
  }): OutreachExecutionHandoff {
    return {
      id: input.handoffId,
      channel: this.channel,
      provider: this.provider,
      preparedAt: input.preparedAt,
      readiness: input.policy.channelRestrictions.handoffAllowed ? "handoff_ready" : "preview_only",
      warnings: input.output.warnings,
      payload: {
        agentBrief: input.output.agentBrief,
        conversationGoal: input.output.conversationGoal,
        customerContext: input.output.customerContext,
        receivablesContext: input.output.receivablesContext,
        safeTalkingPoints: input.output.safeTalkingPoints,
        disallowedStatements: input.output.disallowedStatements,
        objectionHandlingGuidance: input.output.objectionHandlingGuidance,
        handoffConditions: input.output.handoffConditions,
        toneGuidance: input.output.toneGuidance,
        postCallOutcomeSchema: input.output.postCallOutcomeSchema,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    };
  }
}
