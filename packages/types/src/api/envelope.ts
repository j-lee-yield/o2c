import type { TenantContext } from "../tenancy/tenant.js";

export type ApiRequestEnvelope<TPayload> = {
  context: TenantContext;
  payload: TPayload;
};

export type ApiResponseEnvelope<TData> = {
  data: TData;
  meta: {
    requestId: string;
    timestamp: string;
  };
};

