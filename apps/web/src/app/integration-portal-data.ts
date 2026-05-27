import { loadEnv } from "@o2c/config";
import type {
  BusinessCentralCompanySelection,
  ClientConnectInviteData,
  ClientConnectInviteRecord,
  IntegrationInspectorPageData,
  IntegrationInspectorProvider,
  IntegrationPortalBanner,
  IntegrationPortalData,
  OdooDatabaseSelection,
} from "./integration-portal.js";

interface InspectorApiResponse {
  tenantSlug?: string;
  providers?: IntegrationInspectorProvider[];
}

interface ResolveInviteResponse {
  invite?: {
    inviteId?: string;
    tenantSlug?: string;
    clientName?: string;
    status?: string;
  };
  claims?: {
    tenantSlug?: string;
    clientName?: string;
    exp?: number;
  };
  message?: string;
  reason?: string;
}

interface InviteListApiResponse {
  items?: InviteListItem[];
}

interface InviteListItem {
  inviteId: string;
  tenantSlug: string;
  clientName: string;
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  cancelledAt?: string;
  createdByActorId: string;
  createdByActorRole: string;
  cancelledByActorId?: string;
  cancelledByActorRole?: string;
}

export interface ClientConnectAccessState {
  allowed: boolean;
  title?: string;
  message?: string;
  token?: string;
  claims?: {
    tenantSlug: string;
    clientName: string;
    exp?: number;
  };
  inviteId?: string;
}

export async function loadIntegrationPortalData(input: {
  tenantSlug: string;
  clientName: string;
  token: string;
  quickbooksStatus?: string | undefined;
  businessCentralStatus?: string | undefined;
  sapStatus?: string | undefined;
  sapMessage?: string | undefined;
  quickbooksMessage?: string | undefined;
  businessCentralMessage?: string | undefined;
  odooStatus?: string | undefined;
  odooMessage?: string | undefined;
  companyName?: string | undefined;
  odooConnectState?: string | undefined;
  businessCentralConnectState?: string | undefined;
}): Promise<IntegrationPortalData> {
  const providers = applyPortalStatusOverrides(
    await loadInspectorProviders(input.tenantSlug),
    input,
  );
  const banner = buildBanner(input);
  const odooSelection = input.odooConnectState
    ? await loadOdooDatabaseSelection(input.odooConnectState)
    : undefined;
  const businessCentralSelection = input.businessCentralConnectState
    ? await loadBusinessCentralCompanySelection(input.businessCentralConnectState)
    : undefined;

  return {
    tenantSlug: input.tenantSlug,
    clientName: input.clientName,
    providers,
    inspectorPath: `/integrations/inspector?token=${encodeURIComponent(input.token)}`,
    token: input.token,
    ...(banner ? { banner } : {}),
    ...(odooSelection ? { odooSelection } : {}),
    ...(businessCentralSelection ? { businessCentralSelection } : {}),
  };
}

function applyPortalStatusOverrides(
  providers: IntegrationInspectorProvider[],
  input: {
    quickbooksStatus?: string | undefined;
    businessCentralStatus?: string | undefined;
    sapStatus?: string | undefined;
    odooStatus?: string | undefined;
    companyName?: string | undefined;
  },
) {
  return providers.map((provider) => {
    const requestedStatus =
      provider.provider === "quickbooks"
        ? input.quickbooksStatus
        : provider.provider === "business-central"
          ? input.businessCentralStatus
          : provider.provider === "sap-business-one"
            ? input.sapStatus
            : input.odooStatus;

    if (requestedStatus !== "connected" && requestedStatus !== "error") {
      return provider;
    }

    if (requestedStatus === "connected") {
      return {
        ...provider,
        connectionStatus: "connected" as const,
        lifecycleState:
          provider.summary.invoiceCount > 0 ||
          provider.summary.customerCount > 0 ||
          provider.summary.paymentCount > 0
            ? "validation_succeeded"
            : "connected_pending_validation",
        detail: connectedDetail(provider.provider),
        ...(input.companyName?.trim() ? { companyName: input.companyName.trim() } : {}),
      };
    }

    return {
      ...provider,
      connectionStatus: "error" as const,
      lifecycleState: "connection_error",
    };
  });
}

export async function loadIntegrationInspectorPageData(input: {
  tenantSlug: string;
  clientName: string;
  token: string;
}): Promise<IntegrationInspectorPageData> {
  return {
    tenantSlug: input.tenantSlug,
    clientName: input.clientName,
    providers: await loadInspectorProviders(input.tenantSlug),
    portalPath: `/connect/accounting?token=${encodeURIComponent(input.token)}`,
  };
}

export async function validateClientConnectAccess(
  token: string | undefined,
): Promise<ClientConnectAccessState> {
  if (!token || token.trim().length === 0) {
    return {
      allowed: false,
      title: "Missing access link",
      message:
        "This customer portal requires a generated invite link. Create a new link from the internal invite page before sharing it.",
    };
  }

  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return {
      allowed: false,
      title: "Invite service unavailable",
      message: "The client connect invite service could not be reached.",
    };
  }

  try {
    const url = new URL(joinUrl(apiBaseUrl, "/v1/integrations/client-connect-invites/resolve"));
    url.searchParams.set("token", token.trim());
    const response = await runtimeFetch(url.toString());
    const body = (await response.json().catch(() => ({}))) as ResolveInviteResponse;
    if (!response.ok) {
      return {
        allowed: false,
        ...mapAccessFailure(body.reason, body.message),
      };
    }

    const tenantSlug = body.claims?.tenantSlug?.trim() || body.invite?.tenantSlug?.trim();
    const clientName = body.claims?.clientName?.trim() || body.invite?.clientName?.trim();
    if (!tenantSlug || !clientName) {
      return {
        allowed: false,
        title: "This invite link is not valid",
        message: "The link could not be matched to a client invite record.",
      };
    }

    return {
      allowed: true,
      token: token.trim(),
      ...(body.invite?.inviteId ? { inviteId: body.invite.inviteId } : {}),
      claims: {
        tenantSlug,
        clientName,
        ...(typeof body.claims?.exp === "number" ? { exp: body.claims.exp } : {}),
      },
    };
  } catch {
    return {
      allowed: false,
      title: "Invite service unavailable",
      message: "The client connect invite service could not be reached.",
    };
  }
}

export function buildClientConnectInviteData(input: {
  tenantSlug?: string | undefined;
  clientName?: string | undefined;
  inviteId?: string | undefined;
  portalLink?: string | undefined;
  inspectorLink?: string | undefined;
  statusMessage?: string | undefined;
  errorMessage?: string | undefined;
  invites?: InviteListItem[] | undefined;
  baseUrl: string;
}): ClientConnectInviteData {
  const tenantSlug = normalizeTenantSlug(input.tenantSlug);
  const clientName = normalizeClientName(input.clientName, tenantSlug);
  return {
    tenantSlug,
    clientName,
    ...(input.inviteId ? { inviteId: input.inviteId } : {}),
    ...(input.portalLink ? { portalLink: input.portalLink } : {}),
    ...(input.inspectorLink ? { inspectorLink: input.inspectorLink } : {}),
    ...(input.statusMessage ? { statusMessage: input.statusMessage } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    invites: (input.invites ?? []).map((invite) => mapInviteRecord(invite)),
  };
}

export async function loadClientConnectInvites(input: {
  tenantSlug?: string | undefined;
  principalId?: string | undefined;
  principalRoles?: string | undefined;
}): Promise<InviteListItem[]> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return [];
  }

  try {
    const url = new URL(joinUrl(apiBaseUrl, "/v1/integrations/client-connect-invites"));
    if (input.tenantSlug?.trim()) {
      url.searchParams.set("tenantSlug", input.tenantSlug.trim());
    }
    const response = await runtimeFetch(url.toString(), {
      headers: buildPrincipalHeaders(input.principalId, input.principalRoles),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as InviteListApiResponse;
    return Array.isArray(body.items) ? body.items : [];
  } catch {
    return [];
  }
}

async function loadInspectorProviders(tenantSlug: string) {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return buildFallbackProviders(tenantSlug);
  }

  try {
    const url = new URL(joinUrl(apiBaseUrl, "/v1/integrations/inspector"));
    url.searchParams.set("tenantSlug", tenantSlug);
    const response = await runtimeFetch(url.toString());
    if (!response.ok) {
      return buildFallbackProviders(tenantSlug);
    }

    const body = (await response.json()) as InspectorApiResponse;
    return Array.isArray(body.providers) && body.providers.length > 0
      ? body.providers
      : buildFallbackProviders(tenantSlug);
  } catch {
    return buildFallbackProviders(tenantSlug);
  }
}

async function loadOdooDatabaseSelection(
  state: string,
): Promise<OdooDatabaseSelection | undefined> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return undefined;
  }

  try {
    const response = await runtimeFetch(
      joinUrl(apiBaseUrl, `/v1/integrations/odoo/connect/${encodeURIComponent(state)}`),
    );
    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as {
      selection?: {
        state?: string;
        baseUrl?: string;
        username?: string;
        databases?: string[];
      };
    };
    const selection = body.selection;
    if (
      !selection ||
      typeof selection.state !== "string" ||
      typeof selection.baseUrl !== "string" ||
      typeof selection.username !== "string" ||
      !Array.isArray(selection.databases)
    ) {
      return undefined;
    }

    return {
      state: selection.state,
      baseUrl: selection.baseUrl,
      username: selection.username,
      databases: selection.databases.filter((value): value is string => typeof value === "string"),
    };
  } catch {
    return undefined;
  }
}

async function loadBusinessCentralCompanySelection(
  state: string,
): Promise<BusinessCentralCompanySelection | undefined> {
  const apiBaseUrl = resolveApiBaseUrl();
  const runtimeFetch = getRuntimeFetch();
  if (!apiBaseUrl || !runtimeFetch) {
    return undefined;
  }

  try {
    const response = await runtimeFetch(
      joinUrl(apiBaseUrl, `/v1/integrations/business-central/connect/${encodeURIComponent(state)}`),
    );
    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as {
      selection?: {
        state?: string;
        environment?: string;
        loginHint?: string;
        domainHint?: string;
        companies?: Array<{ id?: string; name?: string }>;
      };
    };
    const selection = body.selection;
    if (
      !selection ||
      typeof selection.state !== "string" ||
      typeof selection.environment !== "string" ||
      !Array.isArray(selection.companies)
    ) {
      return undefined;
    }

    return {
      state: selection.state,
      environment: selection.environment,
      ...(typeof selection.loginHint === "string" ? { loginHint: selection.loginHint } : {}),
      ...(typeof selection.domainHint === "string" ? { domainHint: selection.domainHint } : {}),
      companies: selection.companies
        .filter(
          (company): company is { id: string; name?: string } =>
            Boolean(company && typeof company.id === "string"),
        )
        .map((company) => ({
          id: company.id,
          name:
            typeof company.name === "string" && company.name.trim().length > 0
              ? company.name.trim()
              : company.id,
        })),
    };
  } catch {
    return undefined;
  }
}

function buildBanner(input: {
  quickbooksStatus?: string | undefined;
  businessCentralStatus?: string | undefined;
  sapStatus?: string | undefined;
  sapMessage?: string | undefined;
  quickbooksMessage?: string | undefined;
  businessCentralMessage?: string | undefined;
  odooStatus?: string | undefined;
  odooMessage?: string | undefined;
  companyName?: string | undefined;
}): IntegrationPortalBanner | undefined {
  if (input.quickbooksStatus === "connected" || input.quickbooksStatus === "error") {
    return {
      provider: "quickbooks",
      status: input.quickbooksStatus,
      message:
        input.quickbooksMessage?.trim() ||
        (input.quickbooksStatus === "connected"
          ? `${input.companyName?.trim() || "QuickBooks company"} connected successfully.`
          : "QuickBooks connection did not finish."),
    };
  }

  if (
    input.businessCentralStatus === "connected" ||
    input.businessCentralStatus === "error" ||
    input.businessCentralStatus === "info"
  ) {
    return {
      provider: "business-central",
      status: input.businessCentralStatus,
      message:
        input.businessCentralMessage?.trim() ||
        (input.businessCentralStatus === "connected"
          ? `${input.companyName?.trim() || "Business Central company"} connected successfully.`
          : input.businessCentralStatus === "info"
            ? "Business Central disconnected."
            : "Business Central connection did not finish."),
    };
  }

  if (input.sapStatus === "connected" || input.sapStatus === "error") {
    return {
      provider: "sap-business-one",
      status: input.sapStatus,
      message:
        input.sapMessage?.trim() ||
        (input.sapStatus === "connected"
          ? `${input.companyName?.trim() || "SAP Business One company"} connected successfully.`
          : "SAP Business One connection did not finish."),
    };
  }

  if (input.odooStatus === "connected" || input.odooStatus === "error") {
    return {
      provider: "odoo",
      status: input.odooStatus,
      message:
        input.odooMessage?.trim() ||
        (input.odooStatus === "connected"
          ? `${input.companyName?.trim() || "Odoo company"} connected successfully.`
          : "Odoo connection did not finish."),
    };
  }

  return undefined;
}

function connectedDetail(provider: IntegrationInspectorProvider["provider"]) {
  switch (provider) {
    case "quickbooks":
      return "QuickBooks records are available for inspection.";
    case "business-central":
      return "Business Central invoice data is available for inspection.";
    case "sap-business-one":
      return "SAP Business One data is available for inspection.";
    case "odoo":
      return "Odoo accounting data is available for inspection.";
  }
}

function buildFallbackProviders(tenantSlug: string): IntegrationInspectorProvider[] {
  return [
    {
      provider: "quickbooks",
      label: "QuickBooks Online",
      tenantSlug,
      connectionStatus: "not_connected",
      detail: "No QuickBooks company is connected for this tenant yet.",
      pulledObjects: ["invoices", "customers", "contacts", "payments"],
      summary: buildEmptySummary(),
      raw: {},
      lifecycleState: "invite_created",
      validationStatus: "pending",
    },
    {
      provider: "business-central",
      label: "Business Central",
      tenantSlug,
      connectionStatus: "not_connected",
      detail: "No Business Central company is connected for this tenant yet.",
      pulledObjects: ["invoices"],
      summary: buildEmptySummary(),
      raw: {},
      lifecycleState: "invite_created",
      validationStatus: "pending",
    },
    {
      provider: "sap-business-one",
      label: "SAP Business One",
      tenantSlug,
      connectionStatus: "not_connected",
      detail: "No SAP Business One company is connected for this tenant yet.",
      pulledObjects: ["invoices", "customers", "payments"],
      summary: buildEmptySummary(),
      raw: {},
      lifecycleState: "invite_created",
      validationStatus: "pending",
    },
    {
      provider: "odoo",
      label: "Odoo",
      tenantSlug,
      connectionStatus: "not_connected",
      detail: "No Odoo database is connected for this tenant yet.",
      pulledObjects: ["invoices"],
      summary: buildEmptySummary(),
      raw: {},
      lifecycleState: "invite_created",
      validationStatus: "pending",
    },
  ];
}

function buildEmptySummary() {
  return {
    invoiceCount: 0,
    customerCount: 0,
    contactCount: 0,
    paymentCount: 0,
    totalInvoiceAmountCents: 0,
    totalOpenInvoiceAmountCents: 0,
    totalPaymentAmountCents: 0,
    totalUnappliedPaymentAmountCents: 0,
    currencyCodes: [],
  };
}

function mapInviteRecord(invite: InviteListItem): ClientConnectInviteRecord {
  return {
    inviteId: invite.inviteId,
    tenantSlug: invite.tenantSlug,
    clientName: invite.clientName,
    status: invite.status,
    createdAtLabel: formatTimestamp(invite.createdAt),
    updatedAtLabel: formatTimestamp(invite.updatedAt),
    ...(invite.lastUsedAt ? { lastUsedAtLabel: formatTimestamp(invite.lastUsedAt) } : {}),
    ...(invite.cancelledAt ? { cancelledAtLabel: formatTimestamp(invite.cancelledAt) } : {}),
    createdByLabel: `${invite.createdByActorId} (${invite.createdByActorRole})`,
    ...(invite.cancelledByActorId
      ? {
          cancelledByLabel: `${invite.cancelledByActorId} (${invite.cancelledByActorRole ?? "unknown"})`,
        }
      : {}),
  };
}

function normalizeTenantSlug(value?: string) {
  return value?.trim() || loadEnv().DEFAULT_TENANT_SLUG;
}

function normalizeClientName(value: string | undefined, tenantSlug: string) {
  return value?.trim() || tenantSlug.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapAccessFailure(reason?: string, message?: string): { title: string; message: string } {
  switch (reason) {
    case "missing":
      return {
        title: "Missing access link",
        message:
          message ??
          "This customer portal requires a generated invite link. Create a new link from the invite page before sharing it.",
      };
    case "expired":
      return {
        title: "This invite link has expired",
        message: message ?? "Generate a fresh link before asking the client to retry the connection.",
      };
    case "cancelled":
      return {
        title: "This invite link has been cancelled",
        message: message ?? "Generate a new link before asking the client to retry the connection.",
      };
    case "not_found":
    case "malformed":
    case "signature_mismatch":
    default:
      return {
        title: "This invite link is not valid",
        message:
          message ??
          "The link appears incomplete, modified, or no longer recognized. Generate a fresh link and resend it to the client.",
      };
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildPrincipalHeaders(principalId?: string, principalRoles?: string) {
  const headers: Record<string, string> = {};
  if (principalId?.trim()) {
    headers["x-principal-id"] = principalId.trim();
  }
  if (principalRoles?.trim()) {
    headers["x-principal-roles"] = principalRoles.trim();
  }
  return headers;
}

function resolveApiBaseUrl() {
  const explicitBaseUrl = readEnv("O2C_API_BASE_URL");
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const env = loadEnv();
  const host = env.API_HOST === "0.0.0.0" ? "127.0.0.1" : env.API_HOST;
  return `http://${host}:${env.API_PORT}`;
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}

function readEnv(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name]?.trim();
}

function getRuntimeFetch():
  | ((
      input: string,
      init?: { headers?: Record<string, string> }
    ) => Promise<Response>)
  | undefined {
  return (globalThis as unknown as {
    fetch?: (
      input: string,
      init?: { headers?: Record<string, string> }
    ) => Promise<Response>;
  }).fetch;
}
