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

type QuickBooksEnvironment = "production" | "sandbox";
type QuickBooksConnectionHealth =
  | "connected"
  | "refresh_expiring"
  | "reconnect_required";

type QuickBooksConnectConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  defaultEnvironment: QuickBooksEnvironment;
};

type QuickBooksTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
};

type ConnectSession = {
  state: string;
  tenantSlug: string;
  returnTo: string;
  environment: QuickBooksEnvironment;
  requestedRealmId?: string;
  createdAt: string;
};

export type QuickBooksTenantConnection = {
  id: string;
  tenantSlug: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  companyName?: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string;
  connectedAt: string;
  updatedAt: string;
};

export type QuickBooksConnectionSummary = {
  id: string;
  tenantSlug: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  companyName?: string;
  connectedAt: string;
  updatedAt: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string;
  connectionHealth: QuickBooksConnectionHealth;
  needsReconnect: boolean;
  reconnectReason?: string;
};

export type QuickBooksConnectSetupStatus = {
  configured: boolean;
  missingEnvKeys: string[];
  redirectUri: string;
  defaultEnvironment: QuickBooksEnvironment;
};

type CompleteConnectResult = {
  returnTo: string;
  connection: QuickBooksTenantConnection;
};

type QuickBooksConnectionStore = {
  save(connection: QuickBooksTenantConnection): void;
  get(tenantSlug: string): QuickBooksTenantConnection | undefined;
};

type QuickBooksConnectionRow = {
  id: string;
  tenantSlug: string;
  realmId: string;
  environment: QuickBooksEnvironment;
  companyName?: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string;
  connectedAt: string;
  updatedAt: string;
};

class InMemoryQuickBooksConnectionStore implements QuickBooksConnectionStore {
  private readonly connections = new Map<string, QuickBooksTenantConnection>();

  save(connection: QuickBooksTenantConnection) {
    this.connections.set(connection.tenantSlug, connection);
  }

  get(tenantSlug: string) {
    return this.connections.get(tenantSlug);
  }
}

class PostgresQuickBooksConnectionStore implements QuickBooksConnectionStore {
  constructor(private readonly databaseUrl: string) {}

  save(connection: QuickBooksTenantConnection) {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO quickbooks_oauth_connection (
          tenant_slug,
          connection_id,
          realm_id,
          environment,
          company_name,
          access_token,
          refresh_token,
          access_token_expires_at,
          refresh_token_expires_at,
          connected_at,
          updated_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(connection.tenantSlug)}',
          '${quoteLiteral(connection.id)}',
          '${quoteLiteral(connection.realmId)}',
          '${quoteLiteral(connection.environment)}',
          ${connection.companyName ? `'${quoteLiteral(connection.companyName)}'` : "NULL"},
          '${quoteLiteral(connection.accessToken)}',
          ${connection.refreshToken ? `'${quoteLiteral(connection.refreshToken)}'` : "NULL"},
          '${quoteLiteral(connection.accessTokenExpiresAt)}'::timestamptz,
          ${connection.refreshTokenExpiresAt ? `'${quoteLiteral(connection.refreshTokenExpiresAt)}'::timestamptz` : "NULL"},
          '${quoteLiteral(connection.connectedAt)}'::timestamptz,
          '${quoteLiteral(connection.updatedAt)}'::timestamptz,
          '${jsonLiteral({ provider: "quickbooks_online" })}'::jsonb
        )
        ON CONFLICT (tenant_slug)
        DO UPDATE SET
          connection_id = EXCLUDED.connection_id,
          realm_id = EXCLUDED.realm_id,
          environment = EXCLUDED.environment,
          company_name = EXCLUDED.company_name,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          access_token_expires_at = EXCLUDED.access_token_expires_at,
          refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
          connected_at = EXCLUDED.connected_at,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  get(tenantSlug: string) {
    const rows = queryJsonRows<QuickBooksConnectionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            connection_id AS "id",
            tenant_slug AS "tenantSlug",
            realm_id AS "realmId",
            environment,
            company_name AS "companyName",
            access_token AS "accessToken",
            refresh_token AS "refreshToken",
            access_token_expires_at AS "accessTokenExpiresAt",
            refresh_token_expires_at AS "refreshTokenExpiresAt",
            connected_at AS "connectedAt",
            updated_at AS "updatedAt"
          FROM quickbooks_oauth_connection
          WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
          LIMIT 1
        ) q
      `,
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      tenantSlug: row.tenantSlug,
      realmId: row.realmId,
      environment: row.environment,
      ...(row.companyName ? { companyName: row.companyName } : {}),
      accessToken: row.accessToken,
      ...(row.refreshToken ? { refreshToken: row.refreshToken } : {}),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      ...(row.refreshTokenExpiresAt
        ? { refreshTokenExpiresAt: row.refreshTokenExpiresAt }
        : {}),
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
    };
  }
}

class QuickBooksConnectionService {
  private readonly auditLogger = new InMemoryAuditLogger();
  private readonly sessions = new Map<string, ConnectSession>();

  constructor(private readonly store: QuickBooksConnectionStore) {}

  getConnectSetupStatus(): QuickBooksConnectSetupStatus {
    const env = loadEnv() as unknown as Record<string, string | number | undefined>;
    const clientId = readEnv(env.INTEGRATION_QUICKBOOKS_CLIENT_ID);
    const clientSecret = readEnv(env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET);
    const redirectUri =
      readEnv(env.INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI) ??
      `http://127.0.0.1:${readEnv(env.API_PORT) ?? "3001"}/v1/integrations/quickbooks/callback`;
    const defaultEnvironment =
      normalizeEnvironment(readEnv(env.INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT)) ??
      "production";
    const missingEnvKeys = [
      ...(clientId ? [] : ["INTEGRATION_QUICKBOOKS_CLIENT_ID"]),
      ...(clientSecret ? [] : ["INTEGRATION_QUICKBOOKS_CLIENT_SECRET"]),
    ];

    return {
      configured: missingEnvKeys.length === 0,
      missingEnvKeys,
      redirectUri,
      defaultEnvironment,
    };
  }

  getConnectConfig(): QuickBooksConnectConfig | undefined {
    const setup = this.getConnectSetupStatus();
    if (!setup.configured) {
      return undefined;
    }

    const env = loadEnv() as unknown as Record<string, string | number | undefined>;

    return {
      clientId: readEnv(env.INTEGRATION_QUICKBOOKS_CLIENT_ID)!,
      clientSecret: readEnv(env.INTEGRATION_QUICKBOOKS_CLIENT_SECRET)!,
      redirectUri: setup.redirectUri,
      defaultEnvironment: setup.defaultEnvironment,
    };
  }

  createConnectSession(input: {
    tenantSlug: string;
    returnTo: string;
    environment?: string;
    realmId?: string;
  }) {
    const config = this.getConnectConfig();
    if (!config) {
      return undefined;
    }

    const state = randomUUID();
    const environment = normalizeEnvironment(input.environment) ?? config.defaultEnvironment;
    const session: ConnectSession = {
      state,
      tenantSlug: input.tenantSlug,
      returnTo: input.returnTo,
      environment,
      ...(input.realmId?.trim() ? { requestedRealmId: input.realmId.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(state, session);

    const authorizationUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: "com.intuit.quickbooks.accounting openid profile email offline_access",
      state,
    }).toString();

    return {
      state,
      authorizationUrl: authorizationUrl.toString(),
      environment,
    };
  }

  async completeConnectSession(input: {
    state: string;
    code: string;
    realmId?: string;
  }): Promise<CompleteConnectResult> {
    const config = this.getConnectConfig();
    if (!config) {
      throw new Error("QuickBooks customer connection is not configured.");
    }

    const session = this.sessions.get(input.state);
    if (!session) {
      throw new Error("QuickBooks connection session was not found or has expired.");
    }
    this.sessions.delete(input.state);

    const realmId =
      input.realmId?.trim() ||
      session.requestedRealmId ||
      readEnv(
        (loadEnv() as unknown as Record<string, string | number | undefined>)
          .INTEGRATION_QUICKBOOKS_REALM_ID,
      );
    if (!realmId) {
      throw new Error("QuickBooks callback did not include a realmId.");
    }

    const tokenPayload = await exchangeAuthorizationCode(config, input.code);
    if (!tokenPayload.access_token) {
      throw new Error("QuickBooks authorization did not return an access token.");
    }

    const companyName = await resolveCompanyName({
      accessToken: tokenPayload.access_token,
      realmId,
      environment: session.environment,
    }).catch(() => undefined);

    const existing = this.store.get(session.tenantSlug);
    const now = new Date();
    const connection: QuickBooksTenantConnection = {
      id: existing?.id ?? `quickbooks_connection_${randomUUID()}`,
      tenantSlug: session.tenantSlug,
      realmId,
      environment: session.environment,
      ...(companyName ? { companyName } : {}),
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token
        ? { refreshToken: tokenPayload.refresh_token }
        : existing?.refreshToken
          ? { refreshToken: existing.refreshToken }
          : {}),
      accessTokenExpiresAt: new Date(
        now.getTime() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      ...(typeof tokenPayload.x_refresh_token_expires_in === "number"
        ? {
            refreshTokenExpiresAt: new Date(
              now.getTime() + tokenPayload.x_refresh_token_expires_in * 1000,
            ).toISOString(),
          }
        : existing?.refreshTokenExpiresAt
          ? { refreshTokenExpiresAt: existing.refreshTokenExpiresAt }
          : {}),
      connectedAt: existing?.connectedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.store.save(connection);

    await this.auditLogger.log(buildAuditContext("quickbooks_connect_callback"), {
      action: "integration.quickbooks_connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        tenantSlug: connection.tenantSlug,
        realmId: connection.realmId,
        environment: connection.environment,
      },
    });

    return {
      returnTo: session.returnTo,
      connection,
    };
  }

  getConnection(tenantSlug: string) {
    return this.store.get(tenantSlug);
  }

  getConnectionSummary(tenantSlug: string): QuickBooksConnectionSummary | undefined {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    const health = assessConnectionHealth(connection);
    return {
      id: connection.id,
      tenantSlug: connection.tenantSlug,
      realmId: connection.realmId,
      environment: connection.environment,
      ...(connection.companyName ? { companyName: connection.companyName } : {}),
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      ...(connection.refreshTokenExpiresAt
        ? { refreshTokenExpiresAt: connection.refreshTokenExpiresAt }
        : {}),
      connectionHealth: health.connectionHealth,
      needsReconnect: health.needsReconnect,
      ...(health.reconnectReason ? { reconnectReason: health.reconnectReason } : {}),
    };
  }

  async getAccessToken(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    const health = assessConnectionHealth(connection);
    if (health.needsReconnect && health.connectionHealth === "reconnect_required") {
      throw new Error(
        health.reconnectReason ??
          "QuickBooks connection needs to be reconnected before tokens can be refreshed.",
      );
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
      throw new Error("QuickBooks customer connection is not configured.");
    }

    const tokenPayload = await refreshAccessToken(config, connection.refreshToken);
    if (!tokenPayload.access_token) {
      throw new Error("QuickBooks token refresh did not return an access token.");
    }

    const refreshed: QuickBooksTenantConnection = {
      ...connection,
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token
        ? { refreshToken: tokenPayload.refresh_token }
        : {}),
      accessTokenExpiresAt: new Date(
        Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      ...(typeof tokenPayload.x_refresh_token_expires_in === "number"
        ? {
            refreshTokenExpiresAt: new Date(
              Date.now() + tokenPayload.x_refresh_token_expires_in * 1000,
            ).toISOString(),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.store.save(refreshed);

    await this.auditLogger.log(buildAuditContext("quickbooks_refresh_token"), {
      action: "integration.quickbooks_token_refreshed",
      entityType: "integration_connection",
      entityId: refreshed.id,
      metadata: {
        tenantSlug: refreshed.tenantSlug,
        realmId: refreshed.realmId,
      },
    });

    return refreshed.accessToken;
  }
}

let service: QuickBooksConnectionService | undefined;

export function getQuickBooksConnectionService() {
  if (!service) {
    service = new QuickBooksConnectionService(createQuickBooksConnectionStore());
  }
  return service;
}

export function resetQuickBooksConnectionServiceForTests() {
  service = undefined;
}

function createQuickBooksConnectionStore(): QuickBooksConnectionStore {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  if (databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)) {
    return new PostgresQuickBooksConnectionStore(databaseUrl);
  }

  return new InMemoryQuickBooksConnectionStore();
}

function assessConnectionHealth(connection: QuickBooksTenantConnection) {
  const refreshExpiry = connection.refreshTokenExpiresAt
    ? Date.parse(connection.refreshTokenExpiresAt)
    : Number.NaN;
  if (Number.isFinite(refreshExpiry) && refreshExpiry <= Date.now() + 24 * 60 * 60 * 1000) {
    return {
      connectionHealth: (refreshExpiry <= Date.now()
        ? "reconnect_required"
        : "refresh_expiring") as QuickBooksConnectionHealth,
      needsReconnect: true,
      reconnectReason:
        refreshExpiry <= Date.now()
          ? "QuickBooks refresh token has expired. Reconnect the company before the next sync."
          : "QuickBooks refresh token expires within 24 hours. Reconnect soon to avoid sync interruption.",
    };
  }

  return {
    connectionHealth: "connected" as const,
    needsReconnect: false,
  };
}

async function exchangeAuthorizationCode(config: QuickBooksConnectConfig, code: string) {
  const response = await runtimeFetch()(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${encodeBasicAuth(config.clientId, config.clientSecret)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`QuickBooks authorization code exchange failed with ${response.status}.`);
  }

  return (await response.json()) as QuickBooksTokenPayload;
}

async function refreshAccessToken(config: QuickBooksConnectConfig, refreshToken: string) {
  const response = await runtimeFetch()(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${encodeBasicAuth(config.clientId, config.clientSecret)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`QuickBooks token refresh failed with ${response.status}.`);
  }

  return (await response.json()) as QuickBooksTokenPayload;
}

async function resolveCompanyName(input: {
  accessToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
}) {
  const baseUrl = getAccountingBaseUrl(input.environment);
  const response = await runtimeFetch()(
    `${baseUrl}/v3/company/${encodeURIComponent(input.realmId)}/companyinfo/${encodeURIComponent(input.realmId)}`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`QuickBooks company info request failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    CompanyInfo?: {
      CompanyName?: string;
      LegalName?: string;
    };
  };

  return body.CompanyInfo?.CompanyName?.trim() || body.CompanyInfo?.LegalName?.trim() || undefined;
}

function getAccountingBaseUrl(environment: QuickBooksEnvironment) {
  return environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

function normalizeEnvironment(value?: string): QuickBooksEnvironment | undefined {
  if (value === "sandbox" || value === "production") {
    return value;
  }

  return undefined;
}

function readEnv(value: string | number | undefined) {
  if (typeof value === "number") {
    return String(value);
  }
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function encodeBasicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

function buildAuditContext(actorId: string): AuditContext {
  return {
    actorId,
    actorType: "system",
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
  };
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
