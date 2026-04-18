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

export type SapBusinessOneConnectConfig = {
  baseUrl: string;
  companyDatabase: string;
  username: string;
  password: string;
  language?: string;
};

export type SapBusinessOneTenantConnection = {
  id: string;
  tenantSlug: string;
  baseUrl: string;
  companyDatabase: string;
  username: string;
  sessionId: string;
  routeId?: string;
  companyName?: string;
  sessionTimeoutMinutes?: number;
  connectedAt: string;
  updatedAt: string;
};

export type SapBusinessOneConnectionSummary = SapBusinessOneTenantConnection;

export type SapBusinessOneConnectionTestResult = {
  baseUrl: string;
  companyDatabase: string;
  companyName?: string;
  sessionTimeoutMinutes?: number;
};

export type SapBusinessOneSyncRunRecord = {
  runId: string;
  tenantSlug: string;
  triggerSource: "manual" | "scheduled" | "reconnect";
  syncScope: Array<"invoices" | "customers" | "payments">;
  status: "running" | "succeeded" | "failed";
  invoicesSyncedCount: number;
  customersSyncedCount: number;
  paymentsSyncedCount: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
};

type CompleteConnectResult = {
  returnTo: string;
  connection: SapBusinessOneTenantConnection;
};

type SapBusinessOneAuthenticationResult = {
  sessionId: string;
  routeId?: string;
  sessionTimeoutMinutes?: number;
  cookies: string;
};

type SapBusinessOneConnectionStore = {
  save(connection: SapBusinessOneTenantConnection, config: SapBusinessOneConnectConfig): void;
  get(tenantSlug: string): SapBusinessOneTenantConnection | undefined;
  getConfig(tenantSlug: string): SapBusinessOneConnectConfig | undefined;
};

type SapBusinessOneSyncRunStore = {
  save(run: SapBusinessOneSyncRunRecord): void;
  getLatest(tenantSlug: string): SapBusinessOneSyncRunRecord | undefined;
  listRecent(tenantSlug: string, limit: number): SapBusinessOneSyncRunRecord[];
};

type SapBusinessOneConnectionRow = {
  id: string;
  tenantSlug: string;
  baseUrl: string;
  companyDatabase: string;
  username: string;
  password: string;
  language?: string;
  sessionId: string;
  routeId?: string;
  companyName?: string;
  sessionTimeoutMinutes?: number;
  connectedAt: string;
  updatedAt: string;
};

type SapBusinessOneSyncRunRow = {
  runId: string;
  tenantSlug: string;
  triggerSource: "manual" | "scheduled" | "reconnect";
  syncScope?: Array<"invoices" | "customers" | "payments">;
  status: "running" | "succeeded" | "failed";
  invoicesSyncedCount: number;
  customersSyncedCount: number;
  paymentsSyncedCount: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
};

class InMemorySapBusinessOneConnectionStore implements SapBusinessOneConnectionStore {
  private readonly connections = new Map<string, SapBusinessOneTenantConnection>();
  private readonly configs = new Map<string, SapBusinessOneConnectConfig>();

  save(connection: SapBusinessOneTenantConnection, config: SapBusinessOneConnectConfig) {
    this.connections.set(connection.tenantSlug, connection);
    this.configs.set(connection.tenantSlug, config);
  }

  get(tenantSlug: string) {
    return this.connections.get(tenantSlug);
  }

  getConfig(tenantSlug: string) {
    return this.configs.get(tenantSlug);
  }
}

class PostgresSapBusinessOneConnectionStore implements SapBusinessOneConnectionStore {
  constructor(private readonly databaseUrl: string) {}

  save(connection: SapBusinessOneTenantConnection, config: SapBusinessOneConnectConfig) {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO sap_business_one_connection (
          tenant_slug,
          connection_id,
          base_url,
          company_database,
          username,
          password,
          language,
          session_id,
          route_id,
          company_name,
          session_timeout_minutes,
          connected_at,
          updated_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(connection.tenantSlug)}',
          '${quoteLiteral(connection.id)}',
          '${quoteLiteral(config.baseUrl)}',
          '${quoteLiteral(config.companyDatabase)}',
          '${quoteLiteral(config.username)}',
          '${quoteLiteral(config.password)}',
          ${config.language ? `'${quoteLiteral(config.language)}'` : "NULL"},
          '${quoteLiteral(connection.sessionId)}',
          ${connection.routeId ? `'${quoteLiteral(connection.routeId)}'` : "NULL"},
          ${connection.companyName ? `'${quoteLiteral(connection.companyName)}'` : "NULL"},
          ${connection.sessionTimeoutMinutes !== undefined ? connection.sessionTimeoutMinutes : "NULL"},
          '${quoteLiteral(connection.connectedAt)}'::timestamptz,
          '${quoteLiteral(connection.updatedAt)}'::timestamptz,
          '${jsonLiteral({ provider: "sap_business_one" })}'::jsonb
        )
        ON CONFLICT (tenant_slug)
        DO UPDATE SET
          connection_id = EXCLUDED.connection_id,
          base_url = EXCLUDED.base_url,
          company_database = EXCLUDED.company_database,
          username = EXCLUDED.username,
          password = EXCLUDED.password,
          language = EXCLUDED.language,
          session_id = EXCLUDED.session_id,
          route_id = EXCLUDED.route_id,
          company_name = EXCLUDED.company_name,
          session_timeout_minutes = EXCLUDED.session_timeout_minutes,
          connected_at = EXCLUDED.connected_at,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  get(tenantSlug: string) {
    const row = this.getRow(tenantSlug);
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      tenantSlug: row.tenantSlug,
      baseUrl: row.baseUrl,
      companyDatabase: row.companyDatabase,
      username: row.username,
      sessionId: row.sessionId,
      ...(row.routeId ? { routeId: row.routeId } : {}),
      ...(row.companyName ? { companyName: row.companyName } : {}),
      ...(row.sessionTimeoutMinutes !== undefined
        ? { sessionTimeoutMinutes: row.sessionTimeoutMinutes }
        : {}),
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
    };
  }

  getConfig(tenantSlug: string) {
    const row = this.getRow(tenantSlug);
    if (!row) {
      return undefined;
    }

    return {
      baseUrl: row.baseUrl,
      companyDatabase: row.companyDatabase,
      username: row.username,
      password: row.password,
      ...(row.language ? { language: row.language } : {}),
    };
  }

  private getRow(tenantSlug: string) {
    const rows = queryJsonRows<SapBusinessOneConnectionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            connection_id AS "id",
            tenant_slug AS "tenantSlug",
            base_url AS "baseUrl",
            company_database AS "companyDatabase",
            username,
            password,
            language,
            session_id AS "sessionId",
            route_id AS "routeId",
            company_name AS "companyName",
            session_timeout_minutes AS "sessionTimeoutMinutes",
            connected_at AS "connectedAt",
            updated_at AS "updatedAt"
          FROM sap_business_one_connection
          WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
          LIMIT 1
        ) q
      `,
    );

    return rows[0];
  }
}

class InMemorySapBusinessOneSyncRunStore implements SapBusinessOneSyncRunStore {
  private readonly runs = new Map<string, SapBusinessOneSyncRunRecord[]>();

  save(run: SapBusinessOneSyncRunRecord) {
    const existing = this.runs.get(run.tenantSlug) ?? [];
    const next = [run, ...existing.filter((item) => item.runId !== run.runId)];
    this.runs.set(run.tenantSlug, next.slice(0, 20));
  }

  getLatest(tenantSlug: string) {
    return this.runs.get(tenantSlug)?.[0];
  }

  listRecent(tenantSlug: string, limit: number) {
    return (this.runs.get(tenantSlug) ?? []).slice(0, limit);
  }
}

class PostgresSapBusinessOneSyncRunStore implements SapBusinessOneSyncRunStore {
  constructor(private readonly databaseUrl: string) {}

  save(run: SapBusinessOneSyncRunRecord) {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO sap_business_one_sync_run (
          run_id,
          tenant_slug,
          trigger_source,
          sync_scope,
          status,
          invoices_synced_count,
          customers_synced_count,
          payments_synced_count,
          error_message,
          started_at,
          completed_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(run.runId)}',
          '${quoteLiteral(run.tenantSlug)}',
          '${quoteLiteral(run.triggerSource)}',
          '${jsonLiteral(run.syncScope)}'::jsonb,
          '${quoteLiteral(run.status)}',
          ${run.invoicesSyncedCount},
          ${run.customersSyncedCount},
          ${run.paymentsSyncedCount},
          ${run.errorMessage ? `'${quoteLiteral(run.errorMessage)}'` : "NULL"},
          '${quoteLiteral(run.startedAt)}'::timestamptz,
          ${run.completedAt ? `'${quoteLiteral(run.completedAt)}'::timestamptz` : "NULL"},
          '${jsonLiteral(run.metadata)}'::jsonb
        )
        ON CONFLICT (run_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          invoices_synced_count = EXCLUDED.invoices_synced_count,
          customers_synced_count = EXCLUDED.customers_synced_count,
          payments_synced_count = EXCLUDED.payments_synced_count,
          error_message = EXCLUDED.error_message,
          completed_at = EXCLUDED.completed_at,
          metadata = EXCLUDED.metadata
      `,
    );
  }

  getLatest(tenantSlug: string) {
    return this.listRecent(tenantSlug, 1)[0];
  }

  listRecent(tenantSlug: string, limit: number) {
    const rows = queryJsonRows<SapBusinessOneSyncRunRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            run_id AS "runId",
            tenant_slug AS "tenantSlug",
            trigger_source AS "triggerSource",
            sync_scope AS "syncScope",
            status,
            invoices_synced_count AS "invoicesSyncedCount",
            customers_synced_count AS "customersSyncedCount",
            payments_synced_count AS "paymentsSyncedCount",
            error_message AS "errorMessage",
            started_at AS "startedAt",
            completed_at AS "completedAt",
            metadata
          FROM sap_business_one_sync_run
          WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
          ORDER BY started_at DESC
          LIMIT ${Math.max(limit, 1)}
        ) q
      `,
    );

    return rows.map((row) => ({
      runId: row.runId,
      tenantSlug: row.tenantSlug,
      triggerSource: row.triggerSource,
      syncScope: row.syncScope ?? [],
      status: row.status,
      invoicesSyncedCount: row.invoicesSyncedCount,
      customersSyncedCount: row.customersSyncedCount,
      paymentsSyncedCount: row.paymentsSyncedCount,
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
      startedAt: row.startedAt,
      ...(row.completedAt ? { completedAt: row.completedAt } : {}),
      metadata: row.metadata ?? {},
    }));
  }
}

class SapBusinessOneConnectionService {
  private readonly auditLogger = new InMemoryAuditLogger();

  constructor(
    private readonly store: SapBusinessOneConnectionStore,
    private readonly syncRunStore: SapBusinessOneSyncRunStore,
  ) {}

  async testConnection(input: {
    credentials: SapBusinessOneConnectConfig;
  }): Promise<SapBusinessOneConnectionTestResult> {
    const sanitized = sanitizeConfig(input.credentials);
    const authentication = await authenticateWithSapBusinessOne(sanitized);
    const companyName = await resolveSapBusinessOneCompanyName(
      sanitized,
      authentication.cookies,
    ).catch(() => undefined);

    return {
      baseUrl: sanitized.baseUrl,
      companyDatabase: sanitized.companyDatabase,
      ...(companyName ? { companyName } : {}),
      ...(authentication.sessionTimeoutMinutes !== undefined
        ? { sessionTimeoutMinutes: authentication.sessionTimeoutMinutes }
        : {}),
    };
  }

  async connectTenant(input: {
    tenantSlug: string;
    returnTo: string;
    credentials: SapBusinessOneConnectConfig;
  }): Promise<CompleteConnectResult> {
    const sanitized = sanitizeConfig(input.credentials);
    const authentication = await authenticateWithSapBusinessOne(sanitized);
    const companyName = await resolveSapBusinessOneCompanyName(
      sanitized,
      authentication.cookies,
    ).catch(() => undefined);
    const now = new Date().toISOString();
    const existing = this.store.get(input.tenantSlug);
    const connection: SapBusinessOneTenantConnection = {
      id: existing?.id ?? `sap_business_one_connection_${randomUUID()}`,
      tenantSlug: input.tenantSlug,
      baseUrl: sanitized.baseUrl,
      companyDatabase: sanitized.companyDatabase,
      username: sanitized.username,
      sessionId: authentication.sessionId,
      ...(authentication.routeId ? { routeId: authentication.routeId } : {}),
      ...(companyName ? { companyName } : {}),
      ...(authentication.sessionTimeoutMinutes !== undefined
        ? { sessionTimeoutMinutes: authentication.sessionTimeoutMinutes }
        : {}),
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };

    this.store.save(connection, sanitized);

    await this.auditLogger.log(buildAuditContext("sap_business_one_connect"), {
      action: "integration.sap_business_one_connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        tenantSlug: connection.tenantSlug,
        companyDatabase: connection.companyDatabase,
      },
    });

    return {
      returnTo: input.returnTo,
      connection,
    };
  }

  getConnectionSummary(tenantSlug: string) {
    return this.store.get(tenantSlug);
  }

  getRuntimeConfig(tenantSlug: string) {
    return this.store.getConfig(tenantSlug);
  }

  async getAuthenticatedRequestContext(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    return {
      baseUrl: connection.baseUrl,
      cookieHeader: buildSapBusinessOneCookieHeader(connection),
    };
  }

  async refreshSession(tenantSlug: string) {
    const config = this.store.getConfig(tenantSlug);
    const existing = this.store.get(tenantSlug);
    if (!config || !existing) {
      return undefined;
    }

    const authentication = await authenticateWithSapBusinessOne(config);
    const refreshed: SapBusinessOneTenantConnection = {
      ...existing,
      sessionId: authentication.sessionId,
      ...(authentication.routeId ? { routeId: authentication.routeId } : { routeId: undefined }),
      ...(authentication.sessionTimeoutMinutes !== undefined
        ? { sessionTimeoutMinutes: authentication.sessionTimeoutMinutes }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.store.save(refreshed, config);
    return refreshed;
  }

  recordSyncRun(run: SapBusinessOneSyncRunRecord) {
    this.syncRunStore.save(run);
  }

  getLatestSyncRun(tenantSlug: string) {
    return this.syncRunStore.getLatest(tenantSlug);
  }

  listRecentSyncRuns(tenantSlug: string, limit = 5) {
    return this.syncRunStore.listRecent(tenantSlug, limit);
  }
}

let service: SapBusinessOneConnectionService | undefined;

export function getSapBusinessOneConnectionService() {
  if (!service) {
    const databaseUrl = createDatabaseClientConfig().connectionString;
    const persistent = databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl);
    service = new SapBusinessOneConnectionService(
      persistent
        ? new PostgresSapBusinessOneConnectionStore(databaseUrl)
        : new InMemorySapBusinessOneConnectionStore(),
      persistent
        ? new PostgresSapBusinessOneSyncRunStore(databaseUrl)
        : new InMemorySapBusinessOneSyncRunStore(),
    );
  }

  return service;
}

export function resetSapBusinessOneConnectionServiceForTests() {
  service = undefined;
}

async function authenticateWithSapBusinessOne(
  config: SapBusinessOneConnectConfig,
): Promise<SapBusinessOneAuthenticationResult> {
  const response = await runtimeFetch()(`${config.baseUrl}/b1s/v1/Login`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      CompanyDB: config.companyDatabase,
      UserName: config.username,
      Password: config.password,
      ...(config.language ? { Language: config.language } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`SAP Business One authentication failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    SessionId?: string;
    SessionTimeout?: number;
  };
  const cookies = readCookieHeader(response);
  const sessionId = body.SessionId?.trim() || readCookieValue(cookies, "B1SESSION");
  if (!sessionId) {
    throw new Error("SAP Business One authentication did not return a session.");
  }

  return {
    sessionId,
    ...(readCookieValue(cookies, "ROUTEID")
      ? { routeId: readCookieValue(cookies, "ROUTEID") }
      : {}),
    ...(typeof body.SessionTimeout === "number"
      ? { sessionTimeoutMinutes: body.SessionTimeout }
      : {}),
    cookies,
  };
}

async function resolveSapBusinessOneCompanyName(
  config: SapBusinessOneConnectConfig,
  cookies: string,
) {
  const response = await runtimeFetch()(
    `${config.baseUrl}/b1s/v1/CompanyService_GetCompanyInfo`,
    {
      method: "POST",
      headers: {
        cookie: cookies,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(`SAP Business One company info request failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    CompanyName?: string;
    CompanyDB?: string;
  };
  return body.CompanyName?.trim() || body.CompanyDB?.trim() || config.companyDatabase;
}

function sanitizeConfig(input: SapBusinessOneConnectConfig): SapBusinessOneConnectConfig {
  return {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    companyDatabase: input.companyDatabase.trim(),
    username: input.username.trim(),
    password: input.password,
    ...(input.language?.trim() ? { language: input.language.trim() } : {}),
  };
}

function buildAuditContext(action: string): AuditContext {
  return {
    requestId: `${action}_${randomUUID()}`,
    actor: {
      id: "sap_business_one_connector",
      type: "system",
    },
    occurredAt: new Date().toISOString(),
  };
}

function readCookieHeader(response: {
  headers?: {
    get(name: string): string | null;
    getSetCookie?: () => string[];
  };
}) {
  const setCookieHeaders = response.headers?.getSetCookie?.() ?? [];
  return setCookieHeaders.length > 0
    ? setCookieHeaders.join("; ")
    : response.headers?.get("set-cookie") ?? "";
}

function readCookieValue(cookieHeader: string, key: string) {
  const match = cookieHeader.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1]?.trim();
}

export function buildSapBusinessOneCookieHeader(connection: {
  sessionId: string;
  routeId?: string;
}) {
  return [
    `B1SESSION=${connection.sessionId}`,
    ...(connection.routeId ? [`ROUTEID=${connection.routeId}`] : []),
  ].join("; ");
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ) => Promise<{
    ok: boolean;
    status: number;
    headers: {
      get(name: string): string | null;
      getSetCookie?: () => string[];
    };
    json(): Promise<unknown>;
  }>;
}
