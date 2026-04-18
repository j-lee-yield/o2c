import { randomUUID } from "node:crypto";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import { InMemoryAuditLogger, type AuditContext } from "@o2c/audit";

export type OdooConnectConfig = {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
  companyId?: string | undefined;
  defaultJournalId?: string | undefined;
  defaultProductId?: string | undefined;
};

export type OdooConnectDraft = Omit<OdooConnectConfig, "database">;

type ConnectSession = {
  tenantSlug: string;
  returnTo: string;
  createdAt: string;
};

export type OdooTenantConnection = {
  id: string;
  tenantSlug: string;
  baseUrl: string;
  database: string;
  username: string;
  uid: number;
  companyId?: string;
  companyName?: string;
  defaultJournalId?: string;
  defaultProductId?: string;
  connectedAt: string;
  updatedAt: string;
};

type OdooConnectionRow = {
  id: string;
  tenantSlug: string;
  baseUrl: string;
  database: string;
  username: string;
  password: string;
  uid: number;
  companyId?: string;
  companyName?: string;
  defaultJournalId?: string;
  defaultProductId?: string;
  connectedAt: string;
  updatedAt: string;
};

type CompleteConnectResult = {
  returnTo: string;
  connection: OdooTenantConnection;
};

export type OdooDatabaseSelection = {
  state: string;
  tenantSlug: string;
  returnTo: string;
  baseUrl: string;
  username: string;
  databases: string[];
  createdAt: string;
};

export type OdooConnectResult =
  | {
      kind: "connected";
      returnTo: string;
      connection: OdooTenantConnection;
    }
  | {
      kind: "select_database";
      selection: OdooDatabaseSelection;
    };

type OdooConnectionStore = {
  save(connection: OdooTenantConnection, config: OdooConnectConfig): void;
  get(tenantSlug: string): OdooTenantConnection | undefined;
  getConfig(tenantSlug: string): OdooConnectConfig | undefined;
};

class InMemoryOdooConnectionStore implements OdooConnectionStore {
  private readonly connections = new Map<string, OdooTenantConnection>();
  private readonly configs = new Map<string, OdooConnectConfig>();

  save(connection: OdooTenantConnection, config: OdooConnectConfig) {
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

class PostgresOdooConnectionStore implements OdooConnectionStore {
  constructor(private readonly databaseUrl: string) {}

  save(connection: OdooTenantConnection, config: OdooConnectConfig) {
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO odoo_connection (
          tenant_slug,
          connection_id,
          base_url,
          database,
          username,
          password,
          uid,
          company_id,
          company_name,
          default_journal_id,
          default_product_id,
          connected_at,
          updated_at,
          metadata
        )
        VALUES (
          '${quoteLiteral(connection.tenantSlug)}',
          '${quoteLiteral(connection.id)}',
          '${quoteLiteral(config.baseUrl)}',
          '${quoteLiteral(config.database)}',
          '${quoteLiteral(config.username)}',
          '${quoteLiteral(config.password)}',
          ${connection.uid},
          ${connection.companyId ? `'${quoteLiteral(connection.companyId)}'` : "NULL"},
          ${connection.companyName ? `'${quoteLiteral(connection.companyName)}'` : "NULL"},
          ${config.defaultJournalId ? `'${quoteLiteral(config.defaultJournalId)}'` : "NULL"},
          ${config.defaultProductId ? `'${quoteLiteral(config.defaultProductId)}'` : "NULL"},
          '${quoteLiteral(connection.connectedAt)}'::timestamptz,
          '${quoteLiteral(connection.updatedAt)}'::timestamptz,
          '${jsonLiteral({ provider: "odoo" })}'::jsonb
        )
        ON CONFLICT (tenant_slug)
        DO UPDATE SET
          connection_id = EXCLUDED.connection_id,
          base_url = EXCLUDED.base_url,
          database = EXCLUDED.database,
          username = EXCLUDED.username,
          password = EXCLUDED.password,
          uid = EXCLUDED.uid,
          company_id = EXCLUDED.company_id,
          company_name = EXCLUDED.company_name,
          default_journal_id = EXCLUDED.default_journal_id,
          default_product_id = EXCLUDED.default_product_id,
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
      database: row.database,
      username: row.username,
      uid: row.uid,
      ...(row.companyId ? { companyId: row.companyId } : {}),
      ...(row.companyName ? { companyName: row.companyName } : {}),
      ...(row.defaultJournalId ? { defaultJournalId: row.defaultJournalId } : {}),
      ...(row.defaultProductId ? { defaultProductId: row.defaultProductId } : {}),
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
      database: row.database,
      username: row.username,
      password: row.password,
      ...(row.companyId ? { companyId: row.companyId } : {}),
      ...(row.defaultJournalId ? { defaultJournalId: row.defaultJournalId } : {}),
      ...(row.defaultProductId ? { defaultProductId: row.defaultProductId } : {}),
    };
  }

  private getRow(tenantSlug: string) {
    const rows = queryJsonRows<OdooConnectionRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            connection_id AS "id",
            tenant_slug AS "tenantSlug",
            base_url AS "baseUrl",
            database,
            username,
            password,
            uid,
            company_id AS "companyId",
            company_name AS "companyName",
            default_journal_id AS "defaultJournalId",
            default_product_id AS "defaultProductId",
            connected_at AS "connectedAt",
            updated_at AS "updatedAt"
          FROM odoo_connection
          WHERE tenant_slug = '${quoteLiteral(tenantSlug)}'
          LIMIT 1
        ) q
      `,
    );
    return rows[0];
  }
}

class OdooConnectionService {
  private readonly auditLogger = new InMemoryAuditLogger();
  private readonly pendingSessions = new Map<string, ConnectSession>();
  private readonly pendingConfigs = new Map<string, OdooConnectConfig>();
  private readonly pendingDatabaseSelections = new Map<
    string,
    ConnectSession & { credentials: OdooConnectDraft; databases: string[] }
  >();

  constructor(private readonly store: OdooConnectionStore) {}

  beginConnect(input: {
    tenantSlug: string;
    returnTo: string;
    credentials: OdooConnectConfig;
  }) {
    const state = randomUUID();
    this.pendingSessions.set(state, {
      tenantSlug: input.tenantSlug,
      returnTo: input.returnTo,
      createdAt: new Date().toISOString(),
    });
    this.pendingConfigs.set(state, sanitizeConfig(input.credentials));
    return { state };
  }

  async completeConnectSession(input: { state: string }): Promise<CompleteConnectResult> {
    const session = this.pendingSessions.get(input.state);
    const config = this.pendingConfigs.get(input.state);
    if (!session || !config) {
      throw new Error("Odoo connection session was not found or has expired.");
    }

    this.pendingSessions.delete(input.state);
    this.pendingConfigs.delete(input.state);

    const uid = await authenticateWithOdoo(config);
    if (!uid) {
      throw new Error("Odoo authentication failed.");
    }

    const company = await resolveOdooCompany(config, uid);
    const now = new Date().toISOString();
    const existing = this.store.get(session.tenantSlug);
    const connection: OdooTenantConnection = {
      id: existing?.id ?? randomUUID(),
      tenantSlug: session.tenantSlug,
      baseUrl: config.baseUrl,
      database: config.database,
      username: config.username,
      uid,
      ...(company?.id ? { companyId: String(company.id) } : {}),
      ...(company?.name ? { companyName: company.name } : {}),
      ...(config.defaultJournalId ? { defaultJournalId: config.defaultJournalId } : {}),
      ...(config.defaultProductId ? { defaultProductId: config.defaultProductId } : {}),
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };

    this.store.save(connection, config);

    await this.auditLogger.log(buildAuditContext("odoo_connect_callback"), {
      action: "integration.odoo_connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: {
        tenantSlug: connection.tenantSlug,
        ...(connection.companyId ? { companyId: connection.companyId } : {}),
      },
    });

    return {
      returnTo: session.returnTo,
      connection,
    };
  }

  async connectTenant(input: {
    tenantSlug: string;
    returnTo: string;
    credentials: OdooConnectDraft & { database?: string | undefined };
  }): Promise<OdooConnectResult> {
    const sanitized = sanitizeDraft(input.credentials);
    if (input.credentials.database?.trim()) {
      const result = await this.connectTenantWithDatabase({
        tenantSlug: input.tenantSlug,
        returnTo: input.returnTo,
        credentials: {
          ...sanitized,
          database: input.credentials.database,
        },
      });

      return {
        kind: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      };
    }

    const databases = await discoverOdooDatabases(sanitized.baseUrl);
    if (databases.length === 0) {
      throw new Error(
        "We could not discover any Odoo databases for this URL. Ask your Odoo admin for the database name or enable database listing.",
      );
    }

    if (databases.length === 1) {
      const database = databases[0]!;
      const result = await this.connectTenantWithDatabase({
        tenantSlug: input.tenantSlug,
        returnTo: input.returnTo,
        credentials: {
          ...sanitized,
          database,
        },
      });

      return {
        kind: "connected",
        returnTo: result.returnTo,
        connection: result.connection,
      };
    }

    const state = randomUUID();
    const createdAt = new Date().toISOString();
    this.pendingDatabaseSelections.set(state, {
      tenantSlug: input.tenantSlug,
      returnTo: input.returnTo,
      createdAt,
      credentials: sanitized,
      databases,
    });

    return {
      kind: "select_database",
      selection: {
        state,
        tenantSlug: input.tenantSlug,
        returnTo: input.returnTo,
        baseUrl: sanitized.baseUrl,
        username: sanitized.username,
        databases,
        createdAt,
      },
    };
  }

  getPendingDatabaseSelection(state: string): OdooDatabaseSelection | undefined {
    const pending = this.pendingDatabaseSelections.get(state);
    if (!pending) {
      return undefined;
    }

    return {
      state,
      tenantSlug: pending.tenantSlug,
      returnTo: pending.returnTo,
      baseUrl: pending.credentials.baseUrl,
      username: pending.credentials.username,
      databases: pending.databases,
      createdAt: pending.createdAt,
    };
  }

  async completeDatabaseSelection(input: {
    state: string;
    database: string;
  }): Promise<CompleteConnectResult> {
    const pending = this.pendingDatabaseSelections.get(input.state);
    if (!pending) {
      throw new Error("Odoo database selection session was not found or has expired.");
    }

    const database = input.database.trim();
    if (!pending.databases.includes(database)) {
      throw new Error("Selected Odoo database is not available for this login session.");
    }

    this.pendingDatabaseSelections.delete(input.state);
    return this.connectTenantWithDatabase({
      tenantSlug: pending.tenantSlug,
      returnTo: pending.returnTo,
      credentials: {
        ...pending.credentials,
        database,
      },
    });
  }

  getConnectionSummary(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    if (!connection) {
      return undefined;
    }

    return {
      id: connection.id,
      tenantSlug: connection.tenantSlug,
      baseUrl: connection.baseUrl,
      database: connection.database,
      username: connection.username,
      uid: connection.uid,
      companyId: connection.companyId,
      companyName: connection.companyName,
      defaultJournalId: connection.defaultJournalId,
      defaultProductId: connection.defaultProductId,
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
    };
  }

  async getAuthenticatedConnection(tenantSlug: string) {
    const connection = this.store.get(tenantSlug);
    const config = this.store.getConfig(tenantSlug);
    if (!connection || !config) {
      return undefined;
    }

    const uid = await authenticateWithOdoo(config);
    if (!uid) {
      throw new Error("Odoo authentication failed.");
    }

    const refreshed: OdooTenantConnection = {
      ...connection,
      uid,
      updatedAt: new Date().toISOString(),
    };
    this.store.save(refreshed, config);

    return {
      connection: refreshed,
      config,
    };
  }

  private async connectTenantWithDatabase(input: {
    tenantSlug: string;
    returnTo: string;
    credentials: OdooConnectConfig;
  }) {
    const { state } = this.beginConnect(input);
    return this.completeConnectSession({ state });
  }
}

let service: OdooConnectionService | undefined;

export function getOdooConnectionService() {
  if (!service) {
    const db = createDatabaseClientConfig();
    const store =
      db.connectionString && isDatabaseAvailable(db.connectionString)
        ? new PostgresOdooConnectionStore(db.connectionString)
        : new InMemoryOdooConnectionStore();
    service = new OdooConnectionService(store);
  }
  return service;
}

export function resetOdooConnectionServiceForTests() {
  service = undefined;
}

async function discoverOdooDatabases(baseUrl: string) {
  try {
    const response = await runtimeFetch()(buildJsonRpcUrl(baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "db",
          method: "list",
          args: [],
        },
        id: randomUUID(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Odoo database discovery failed with ${response.status}.`);
    }

    const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) {
      throw new Error(body.error.message ?? "Odoo database discovery failed.");
    }

    if (!Array.isArray(body.result)) {
      return [];
    }

    return [
      ...new Set(
        body.result.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        ),
      ),
    ];
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Odoo discovery error.";
    throw new Error(
      `Automatic Odoo database discovery failed. Enter the database name manually and try again. ${detail}`,
    );
  }
}

async function authenticateWithOdoo(config: OdooConnectConfig) {
  const response = await runtimeFetch()(buildJsonRpcUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "login",
        args: [config.database, config.username, config.password],
      },
      id: randomUUID(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo authentication request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { result?: number; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "Odoo authentication failed.");
  }

  return typeof body.result === "number" ? body.result : undefined;
}

async function resolveOdooCompany(config: OdooConnectConfig, uid: number) {
  if (config.companyId) {
    const [company] = await executeKw<{ id: number; name?: string }>(
      config,
      uid,
      "res.company",
      "read",
      [[Number(config.companyId)], ["name"]],
    );
    return company;
  }

  const [user] = await executeKw<{ company_id?: [number, string] }>(
    config,
    uid,
    "res.users",
    "read",
    [[uid], ["company_id"]],
  );

  if (!user?.company_id) {
    return undefined;
  }

  return {
    id: user.company_id[0],
    name: user.company_id[1],
  };
}

async function executeKw<T>(
  config: OdooConnectConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
): Promise<T[]> {
  const response = await runtimeFetch()(buildJsonRpcUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          config.database,
          uid,
          config.password,
          model,
          method,
          args,
          ...(kwargs ? [kwargs] : []),
        ],
      },
      id: randomUUID(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo ${model}.${method} request failed with ${response.status}.`);
  }

  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `Odoo ${model}.${method} request failed.`);
  }

  return Array.isArray(body.result) ? (body.result as T[]) : [];
}

function buildAuditContext(correlationId: string): AuditContext {
  return {
    actorId: "integration_console",
    actorType: "system",
    correlationId,
    occurredAt: new Date().toISOString(),
  };
}

function buildJsonRpcUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/jsonrpc`;
}

function sanitizeConfig(input: OdooConnectConfig): OdooConnectConfig {
  return {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    database: input.database.trim(),
    username: input.username.trim(),
    password: input.password,
    ...(input.companyId?.trim() ? { companyId: input.companyId.trim() } : {}),
    ...(input.defaultJournalId?.trim()
      ? { defaultJournalId: input.defaultJournalId.trim() }
      : {}),
    ...(input.defaultProductId?.trim()
      ? { defaultProductId: input.defaultProductId.trim() }
      : {}),
  };
}

function sanitizeDraft(input: OdooConnectDraft): OdooConnectDraft {
  return {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    username: input.username.trim(),
    password: input.password,
    ...(input.companyId?.trim() ? { companyId: input.companyId.trim() } : {}),
    ...(input.defaultJournalId?.trim()
      ? { defaultJournalId: input.defaultJournalId.trim() }
      : {}),
    ...(input.defaultProductId?.trim()
      ? { defaultProductId: input.defaultProductId.trim() }
      : {}),
  };
}

function runtimeFetch() {
  return globalThis.fetch as unknown as (
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}
