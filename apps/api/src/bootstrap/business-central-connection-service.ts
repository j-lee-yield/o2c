import { randomUUID } from "node:crypto";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import { InMemoryAuditLogger, type AuditContext } from "@o2c/audit";

type BusinessCentralConnectConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  defaultEnvironment: string;
  baseUrl: string;
};

type BusinessCentralTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
};

type BusinessCentralCompany = {
  id: string;
  name?: string;
  displayName?: string;
};

export type BusinessCentralCompanySelection = {
  state: string;
  tenantSlug: string;
  returnTo: string;
  environment: string;
  loginHint?: string;
  domainHint?: string;
  companies: Array<{
    id: string;
    name: string;
  }>;
  createdAt: string;
};

type ConnectSession = {
  state: string;
  tenantSlug: string;
  returnTo: string;
  environment: string;
  loginHint?: string;
  domainHint?: string;
  requestedCompanyId?: string;
  createdAt: string;
};

export type BusinessCentralTenantConnection = {
  id: string;
  tenantSlug: string;
  tenantId?: string;
  tenantLabel?: string;
  companyId: string;
  companyName?: string;
  environment: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  connectedAt: string;
  updatedAt: string;
};

type BusinessCentralConnectionRow = {
  id: string;
  tenantSlug: string;
  tenantId?: string;
  tenantLabel?: string;
  companyId: string;
  companyName?: string;
  environment: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  connectedAt: string;
  updatedAt: string;
};

type BusinessCentralConnectionStore = {
  save(connection: BusinessCentralTenantConnection): void;
  get(tenantSlug: string): BusinessCentralTenantConnection | undefined;
  delete(tenantSlug: string): BusinessCentralTenantConnection | undefined;
};

type CompleteConnectResult = {
  returnTo: string;
  connection: BusinessCentralTenantConnection;
};

type BusinessCentralConnectResult =
  | {
      kind: "connected";
      returnTo: string;
      connection: BusinessCentralTenantConnection;
    }
  | {
      kind: "select_company";
      selection: BusinessCentralCompanySelection;
    };

type PendingCompanySelection = BusinessCentralCompanySelection & {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  tenantId?: string;
  tenantLabel?: string;
};

class InMemoryBusinessCentralConnectionStore implements BusinessCentralConnectionStore {
  private readonly connections = new Map<string, BusinessCentralTenantConnection>();

  save(connection: BusinessCentralTenantConnection) {
    this.connections.set(connection.tenantSlug, connection);
  }

  get(tenantSlug: string) {
    return this.connections.get(tenantSlug);
  }

  delete(tenantSlug: string) {
    const existing = this.connections.get(tenantSlug);
    if (!existing) {
      return undefined;
    }
    this.connections.delete(tenantSlug);
    return existing;
  }
}

class PostgresBusinessCentralConnectionStore implements BusinessCentralConnectionStore {
  constructor(private readonly databaseUrl: string) {}

  save(connection: BusinessCentralTenantConnection) {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO business_central_oauth_connection (
          tenant_slug,
          connection_id,
          tenant_id,
          tenant_label,
          company_id,
          company_name,
          environment,
          access_token,
          refresh_token,
          access_token_expires_at,
          connected_at,
          updated_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(connection.tenantSlug)}',
          '${quoteLiteral(connection.id)}',
          ${connection.tenantId ? `'${quoteLiteral(connection.tenantId)}'` : "NULL"},
          ${connection.tenantLabel ? `'${quoteLiteral(connection.tenantLabel)}'` : "NULL"},
          '${quoteLiteral(connection.companyId)}',
          ${connection.companyName ? `'${quoteLiteral(connection.companyName)}'` : "NULL"},
          '${quoteLiteral(connection.environment)}',
          '${quoteLiteral(connection.accessToken)}',
          ${connection.refreshToken ? `'${quoteLiteral(connection.refreshToken)}'` : "NULL"},
          '${quoteLiteral(connection.accessTokenExpiresAt)}'::timestamptz,
          '${quoteLiteral(connection.connectedAt)}'::timestamptz,
          '${quoteLiteral(connection.updatedAt)}'::timestamptz,
          '${jsonLiteral({ provider: "business_central" })}'::jsonb
        )
        ON CONFLICT (tenant_slug)
        DO UPDATE SET
          connection_id = EXCLUDED.connection_id,
          tenant_id = EXCLUDED.tenant_id,
          tenant_label = EXCLUDED.tenant_label,
          company_id = EXCLUDED.company_id,
          company_name = EXCLUDED.company_name,
          environment = EXCLUDED.environment,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          access_token_expires_at = EXCLUDED.access_token_expires_at,
          connected_at = EXCLUDED.connected_at,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  get(tenantSlug: string) {
    const rows = queryJsonRows<BusinessCentralConnectionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            connection_id AS "id",
            tenant_slug AS "tenantSlug",
            tenant_id AS "tenantId",
            tenant_label AS "tenantLabel",
            company_id AS "companyId",
            company_name AS "companyName",
            environment,
            access_token AS "accessToken",
            refresh_token AS "refreshToken",
            access_token_expires_at AS "accessTokenExpiresAt",
            connected_at AS "connectedAt",
            updated_at AS "updatedAt"
          FROM business_central_oauth_connection
          WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
          LIMIT 1
        ) q
      `,
    );
    return rows[0];
  }

  delete(tenantSlug: string) {
    const existing = this.get(tenantSlug);
    if (!existing) {
      return undefined;
    }

    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM business_central_oauth_connection
        WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
      `,
    );

    return existing;
  }
}

class BusinessCentralConnectionService {
  private readonly auditLogger = new InMemoryAuditLogger();
  private readonly sessions = new Map<string, ConnectSession>();
  private readonly pendingCompanySelections = new Map<string, PendingCompanySelection>();

  constructor(private readonly store: BusinessCentralConnectionStore) {}

  abandonConnectSession(state: string) {
    const session = this.sessions.get(state);
    if (!session) {
      return undefined;
    }
    this.sessions.delete(state);
    return session;
  }

  getConnectConfig(): BusinessCentralConnectConfig | undefined {
    const env = loadEnv() as unknown as Record<string, string | number | undefined>;
    const clientId = readEnv(env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID);
    const clientSecret = readEnv(env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET);
    const redirectUri = readEnv(env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI);
    if (!clientId || !clientSecret || !redirectUri) {
      return undefined;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      defaultEnvironment:
        readEnv(env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_DEFAULT_ENVIRONMENT) ?? "production",
      baseUrl:
        readEnv(env.INTEGRATION_BUSINESS_CENTRAL_BASE_URL) ??
        "https://api.businesscentral.dynamics.com",
    };
  }

  createConnectSession(input: {
    tenantSlug: string;
    returnTo: string;
    environment?: string;
    loginHint?: string;
    domainHint?: string;
    companyId?: string;
  }) {
    const config = this.getConnectConfig();
    if (!config) {
      return undefined;
    }

    const state = randomUUID();
    const session: ConnectSession = {
      state,
      tenantSlug: input.tenantSlug,
      returnTo: input.returnTo,
      environment: input.environment?.trim() || config.defaultEnvironment,
      ...(input.loginHint?.trim() ? { loginHint: input.loginHint.trim() } : {}),
      ...(input.domainHint?.trim() ? { domainHint: input.domainHint.trim() } : {}),
      ...(input.companyId?.trim() ? { requestedCompanyId: input.companyId.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(state, session);

    const authorizationUrl = new URL(
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      response_mode: "query",
      scope: "openid profile offline_access https://api.businesscentral.dynamics.com/.default",
      state,
      prompt: "select_account",
      ...(session.loginHint ? { login_hint: session.loginHint } : {}),
      ...(session.domainHint ? { domain_hint: session.domainHint } : {}),
    }).toString();

    return {
      state,
      authorizationUrl: authorizationUrl.toString(),
    };
  }

  async completeConnectSession(input: {
    state: string;
    code: string;
  }): Promise<BusinessCentralConnectResult> {
    const config = this.getConnectConfig();
    if (!config) {
      throw new Error("Business Central customer connection is not configured.");
    }

    const session = this.sessions.get(input.state);
    if (!session) {
      throw new Error("Business Central connection session was not found or has expired.");
    }
    this.sessions.delete(input.state);

    const tokenPayload = await exchangeAuthorizationCode(config, input.code);
    if (!tokenPayload.access_token) {
      throw new Error("Business Central authorization did not return an access token.");
    }

    const claims = decodeJwtPayload(tokenPayload.id_token ?? tokenPayload.access_token);
    const companies = await resolveCompanies(
      config.baseUrl,
      session.environment,
      tokenPayload.access_token,
    );
    const selectedCompany =
      (session.requestedCompanyId
        ? companies.find((company) => company.id === session.requestedCompanyId)
        : undefined) ?? (companies.length === 1 ? companies[0] : undefined);

    if (!selectedCompany) {
      const selectionState = randomUUID();
      const now = new Date().toISOString();
      this.pendingCompanySelections.set(selectionState, {
        state: selectionState,
        tenantSlug: session.tenantSlug,
        returnTo: session.returnTo,
        environment: session.environment,
        ...(session.loginHint ? { loginHint: session.loginHint } : {}),
        ...(session.domainHint ? { domainHint: session.domainHint } : {}),
        companies: companies.map((company) => ({
          id: company.id,
          name: getBusinessCentralCompanyLabel(company),
        })),
        accessToken: tokenPayload.access_token,
        ...(tokenPayload.refresh_token ? { refreshToken: tokenPayload.refresh_token } : {}),
        accessTokenExpiresAt: new Date(
          Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
        ).toISOString(),
        ...(typeof claims.tid === "string" ? { tenantId: claims.tid } : {}),
        ...(typeof claims.preferred_username === "string"
          ? { tenantLabel: claims.preferred_username }
          : typeof claims.email === "string"
            ? { tenantLabel: claims.email }
            : {}),
        createdAt: now,
      });

      return {
        kind: "select_company",
        selection: this.pendingCompanySelections.get(selectionState)!,
      };
    }

    const now = new Date();
    const existing = this.store.get(session.tenantSlug);
    const connection: BusinessCentralTenantConnection = {
      id: existing?.id ?? randomUUID(),
      tenantSlug: session.tenantSlug,
      ...(typeof claims.tid === "string" ? { tenantId: claims.tid } : {}),
      ...(typeof claims.preferred_username === "string"
        ? { tenantLabel: claims.preferred_username }
        : typeof claims.email === "string"
          ? { tenantLabel: claims.email }
          : {}),
      companyId: selectedCompany.id,
      ...(getBusinessCentralCompanyLabel(selectedCompany)
        ? { companyName: getBusinessCentralCompanyLabel(selectedCompany) }
        : {}),
      environment: session.environment,
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token ? { refreshToken: tokenPayload.refresh_token } : {}),
      accessTokenExpiresAt: new Date(
        now.getTime() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      connectedAt: existing?.connectedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.store.save(connection);

    await this.auditLogger.log(buildAuditContext("bc_connect_callback"), {
      action: "integration.business_central_connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        tenantSlug: connection.tenantSlug,
        companyId: connection.companyId,
        environment: connection.environment,
      },
    });

    return {
      kind: "connected",
      returnTo: session.returnTo,
      connection,
    };
  }

  getPendingCompanySelection(state: string) {
    return this.pendingCompanySelections.get(state);
  }

  completeCompanySelection(input: {
    state: string;
    companyId: string;
  }): CompleteConnectResult {
    const pending = this.pendingCompanySelections.get(input.state);
    if (!pending) {
      throw new Error("Business Central company selection session was not found or has expired.");
    }
    this.pendingCompanySelections.delete(input.state);

    const company = pending.companies.find((item) => item.id === input.companyId);
    if (!company) {
      throw new Error("Selected Business Central company was not found in the authorized list.");
    }

    const existing = this.store.get(pending.tenantSlug);
    const now = new Date().toISOString();
    const connection: BusinessCentralTenantConnection = {
      id: existing?.id ?? randomUUID(),
      tenantSlug: pending.tenantSlug,
      ...(pending.tenantId ? { tenantId: pending.tenantId } : {}),
      ...(pending.tenantLabel ? { tenantLabel: pending.tenantLabel } : {}),
      companyId: company.id,
      ...(company.name.trim() ? { companyName: company.name.trim() } : {}),
      environment: pending.environment,
      accessToken: pending.accessToken,
      ...(pending.refreshToken ? { refreshToken: pending.refreshToken } : {}),
      accessTokenExpiresAt: pending.accessTokenExpiresAt,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };
    this.store.save(connection);

    void this.auditLogger.log(buildAuditContext("bc_connect_company_select"), {
      action: "integration.business_central_connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        tenantSlug: connection.tenantSlug,
        companyId: connection.companyId,
        environment: connection.environment,
      },
    });

    return {
      returnTo: pending.returnTo,
      connection,
    };
  }

  getConnection(tenantSlug: string) {
    return this.store.get(tenantSlug);
  }

  async disconnect(tenantSlug: string) {
    const existing = this.store.delete(tenantSlug);
    if (!existing) {
      return undefined;
    }

    await this.auditLogger.log(buildAuditContext("bc_disconnect"), {
      action: "integration.business_central_disconnected",
      entityType: "integration_connection",
      entityId: existing.id,
      metadata: {
        tenantSlug: existing.tenantSlug,
        companyId: existing.companyId,
        environment: existing.environment,
      },
    });

    return existing;
  }

  async getAccessToken(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    const expiresAt = Date.parse(connection.accessTokenExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      return connection.accessToken;
    }

    const config = this.getConnectConfig();
    if (!config) {
      throw new Error("Business Central customer connection is not configured.");
    }

    const tokenPayload = await refreshAccessToken(config, connection.refreshToken, connection.tenantId);
    if (!tokenPayload.access_token) {
      throw new Error("Business Central token refresh did not return an access token.");
    }

    const refreshedConnection: BusinessCentralTenantConnection = {
      ...connection,
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token ? { refreshToken: tokenPayload.refresh_token } : {}),
      accessTokenExpiresAt: new Date(
        Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.save(refreshedConnection);

    await this.auditLogger.log(buildAuditContext("bc_refresh_token"), {
      action: "integration.business_central_token_refreshed",
      entityType: "integration_connection",
      entityId: refreshedConnection.id,
      metadata: {
        tenantSlug: refreshedConnection.tenantSlug,
      },
    });

    return refreshedConnection.accessToken;
  }

  getConnectionSummary(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    return {
      id: connection.id,
      tenantSlug: connection.tenantSlug,
      tenantId: connection.tenantId,
      tenantLabel: connection.tenantLabel,
      companyId: connection.companyId,
      companyName: connection.companyName,
      environment: connection.environment,
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
    };
  }
}

let service: BusinessCentralConnectionService | undefined;

export function getBusinessCentralConnectionService() {
  if (!service) {
    const db = createDatabaseClientConfig();
    const store =
      db.connectionString && isDatabaseAvailable(db.connectionString)
        ? new PostgresBusinessCentralConnectionStore(db.connectionString)
        : new InMemoryBusinessCentralConnectionStore();
    service = new BusinessCentralConnectionService(store);
  }
  return service;
}

export function resetBusinessCentralConnectionServiceForTests() {
  service = undefined;
}

async function exchangeAuthorizationCode(
  config: BusinessCentralConnectConfig,
  code: string,
) {
  const response = await runtimeFetch()(
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        scope: "openid profile offline_access https://api.businesscentral.dynamics.com/.default",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Business Central authorization code exchange failed with ${response.status}.`);
  }

  return (await response.json()) as BusinessCentralTokenPayload;
}

async function refreshAccessToken(
  config: BusinessCentralConnectConfig,
  refreshToken: string,
  tenantId?: string,
) {
  const authorityTenant = tenantId?.trim() || "organizations";
  const response = await runtimeFetch()(
    `https://login.microsoftonline.com/${authorityTenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        redirect_uri: config.redirectUri,
        scope: "openid profile offline_access https://api.businesscentral.dynamics.com/.default",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Business Central token refresh failed with ${response.status}.`);
  }

  return (await response.json()) as BusinessCentralTokenPayload;
}

async function resolveCompanies(
  baseUrl: string,
  environment: string,
  accessToken: string,
) {
  const response = await runtimeFetch()(`${baseUrl}/v2.0/${environment}/api/v2.0/companies`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Business Central companies request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { value?: BusinessCentralCompany[] };
  const companies = Array.isArray(body.value) ? body.value : [];
  if (companies.length === 0) {
    throw new Error("Business Central returned no accessible companies.");
  }

  return companies;
}

function buildAuditContext(correlationId: string): AuditContext {
  return {
    actorId: "integration_console",
    actorType: "system",
    correlationId,
    occurredAt: new Date().toISOString(),
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const segments = token.split(".");
  if (segments.length < 2) {
    return {};
  }

  const payload = segments[1]
    ?.replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil((segments[1]?.length ?? 0) / 4) * 4, "=");
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readEnv(value: string | number | undefined) {
  return typeof value === "number" ? String(value) : value?.trim();
}

function getBusinessCentralCompanyLabel(company: BusinessCentralCompany) {
  const displayName = company.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const name = company.name?.trim();
  if (name) {
    return name;
  }

  return company.id;
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: URLSearchParams;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
