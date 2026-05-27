export interface RetellCreatePhoneCallRequest {
  from_number: string;
  to_number: string;
  override_agent_id?: string;
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RetellCreatePhoneCallResponse {
  call_type?: "phone_call";
  from_number?: string;
  to_number?: string;
  direction?: "inbound" | "outbound";
  call_id: string;
  agent_id?: string;
  agent_version?: number;
  call_status?: "registered" | "not_connected" | "ongoing" | "ended" | "error";
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

type RetellCallStatus = NonNullable<RetellCreatePhoneCallResponse["call_status"]>;

export type RetellCallRecord = RetellCreatePhoneCallResponse & Record<string, unknown>;

export interface RetellOutboundCallClient {
  createOutboundPhoneCall(
    payload: RetellCreatePhoneCallRequest
  ): Promise<RetellCreatePhoneCallResponse>;
}

export interface RetellCallHistoryClient {
  retrieveCall(callId: string): Promise<RetellCallRecord>;
  listCalls(payload?: Record<string, unknown>): Promise<RetellCallRecord[]>;
}

export interface RetellClientConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class RetellConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetellConfigurationError";
  }
}

export class RetellProviderError extends Error {
  readonly statusCode: number;
  readonly providerBody: string;

  constructor(statusCode: number, providerBody: string, message?: string) {
    super(message ?? `Retell provider request failed with status ${statusCode}.`);
    this.name = "RetellProviderError";
    this.statusCode = statusCode;
    this.providerBody = providerBody;
  }
}

export class RetellHttpClient implements RetellOutboundCallClient, RetellCallHistoryClient {
  private readonly baseUrl: string;

  constructor(private readonly config: RetellClientConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.retellai.com").replace(/\/$/, "");
  }

  async createOutboundPhoneCall(
    payload: RetellCreatePhoneCallRequest
  ): Promise<RetellCreatePhoneCallResponse> {
    if (!this.config.apiKey) {
      throw new RetellConfigurationError("RETELL_API_KEY is required to create Retell calls.");
    }

    const responseText = await this.sendRetellRequest("/v2/create-phone-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return parseRetellResponse(responseText);
  }

  async retrieveCall(callId: string): Promise<RetellCallRecord> {
    if (!this.config.apiKey) {
      throw new RetellConfigurationError("RETELL_API_KEY is required to retrieve Retell calls.");
    }

    const responseText = await this.sendRetellRequest(
      `/v2/get-call/${encodeURIComponent(callId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        }
      }
    );

    return parseRetellCallRecord(responseText);
  }

  async listCalls(payload: Record<string, unknown> = {}): Promise<RetellCallRecord[]> {
    if (!this.config.apiKey) {
      throw new RetellConfigurationError("RETELL_API_KEY is required to list Retell calls.");
    }

    const responseText = await this.sendRetellRequest("/v2/list-calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const parsed = JSON.parse(responseText) as unknown;
    if (!Array.isArray(parsed)) {
      throw new RetellProviderError(502, responseText);
    }

    return parsed.map((entry) => parseRetellCallRecord(JSON.stringify(entry)));
  }

  private async sendRetellRequest(path: string, init: RequestInit): Promise<string> {
    let response: {
      ok: boolean;
      status: number;
      text(): Promise<string>;
    };

    try {
      response = (await fetch(`${this.baseUrl}${path}`, init)) as unknown as {
        ok: boolean;
        status: number;
        text(): Promise<string>;
      };
    } catch (error) {
      const message = readErrorMessage(error);
      throw new RetellProviderError(
        502,
        JSON.stringify({
          error: "retell_network_error",
          message,
          baseUrl: this.baseUrl
        }),
        `Retell provider request failed before receiving a response: ${message}.`
      );
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new RetellProviderError(response.status, responseText);
    }

    return responseText;
  }
}

function parseRetellResponse(responseText: string): RetellCreatePhoneCallResponse {
  const parsed = JSON.parse(responseText) as Record<string, unknown>;
  const callId = typeof parsed.call_id === "string" ? parsed.call_id : undefined;
  if (!callId) {
    throw new RetellProviderError(502, responseText);
  }

  return {
    call_id: callId,
    ...(parsed.call_type === "phone_call" ? { call_type: parsed.call_type } : {}),
    ...(typeof parsed.from_number === "string" ? { from_number: parsed.from_number } : {}),
    ...(typeof parsed.to_number === "string" ? { to_number: parsed.to_number } : {}),
    ...(parsed.direction === "inbound" || parsed.direction === "outbound"
      ? { direction: parsed.direction }
      : {}),
    ...(typeof parsed.agent_id === "string" ? { agent_id: parsed.agent_id } : {}),
    ...(typeof parsed.agent_version === "number" ? { agent_version: parsed.agent_version } : {}),
    ...(isRetellCallStatus(parsed.call_status) ? { call_status: parsed.call_status } : {}),
    ...(isRecord(parsed.metadata) ? { metadata: parsed.metadata } : {}),
    ...(isStringRecord(parsed.retell_llm_dynamic_variables)
      ? { retell_llm_dynamic_variables: parsed.retell_llm_dynamic_variables }
      : {})
  };
}

function parseRetellCallRecord(responseText: string): RetellCallRecord {
  const parsed = JSON.parse(responseText) as Record<string, unknown>;
  const base = parseRetellResponse(responseText);
  return {
    ...parsed,
    ...base
  };
}

function isRetellCallStatus(value: unknown): value is RetellCallStatus {
  return (
    value === "registered" ||
    value === "not_connected" ||
    value === "ongoing" ||
    value === "ended" ||
    value === "error"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Retell network error";
}
