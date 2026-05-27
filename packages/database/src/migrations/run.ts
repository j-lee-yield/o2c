import { loadEnv } from "@o2c/config";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type MigrationFile = {
  id: string;
  fileName: string;
  absolutePath: string;
  sql: string;
}

export type MigrationPlan = {
  databaseUrl: string;
  generatedAt: string;
  migrations: MigrationFile[];
}

export type AppliedMigrationRecord = {
  id: string;
  fileName: string;
  status: "applied" | "skipped";
}

export function discoverMigrationFiles(migrationsDir: string): MigrationFile[] {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => {
      const absolutePath = resolve(migrationsDir, fileName);
      return {
        id: fileName.replace(/\.sql$/, ""),
        fileName,
        absolutePath,
        sql: readFileSync(absolutePath, "utf8").trim()
      };
    });
}

export function buildMigrationPlan(databaseUrl: string, migrationsDir: string): MigrationPlan {
  return {
    databaseUrl,
    generatedAt: new Date().toISOString(),
    migrations: discoverMigrationFiles(migrationsDir)
  };
}

export function renderCombinedMigrationSql(plan: MigrationPlan): string {
  return plan.migrations
    .map(
      (migration) =>
        `-- ${migration.fileName}\n${migration.sql}\n`
    )
    .join("\n");
}

export function defaultPsqlExecutor(args: string[]) {
  const result = spawnSync("psql", args, {
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

export type PsqlExecutor = typeof defaultPsqlExecutor;

export function ensureSchemaMigrationsTable(
  databaseUrl: string,
  execute: PsqlExecutor
): void {
  runPsql(
    execute,
    [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id text PRIMARY KEY,
         file_name text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT NOW()
       );`
    ],
    "Failed to ensure schema_migrations table."
  );
}

export function hasAppliedMigration(
  databaseUrl: string,
  migrationId: string,
  execute: PsqlExecutor
): boolean {
  const sql = `SELECT 1 FROM schema_migrations WHERE id = '${quoteLiteral(migrationId)}' LIMIT 1;`;
  const result = runPsql(
    execute,
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", sql],
    `Failed to inspect migration ${migrationId}.`
  );

  return result.stdout.trim() === "1";
}

export function applyMigrationPlan(
  plan: MigrationPlan,
  execute: PsqlExecutor = defaultPsqlExecutor
): AppliedMigrationRecord[] {
  ensureSchemaMigrationsTable(plan.databaseUrl, execute);

  return plan.migrations.map((migration) => {
    if (hasAppliedMigration(plan.databaseUrl, migration.id, execute)) {
      return {
        id: migration.id,
        fileName: migration.fileName,
        status: "skipped"
      };
    }

    runPsql(
      execute,
      [plan.databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", migration.absolutePath],
      `Failed to apply migration ${migration.fileName}.`
    );
    runPsql(
      execute,
      [
        plan.databaseUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `INSERT INTO schema_migrations (id, file_name) VALUES ('${quoteLiteral(migration.id)}', '${quoteLiteral(
          migration.fileName
        )}') ON CONFLICT (id) DO NOTHING;`
      ],
      `Failed to record migration ${migration.fileName}.`
    );

    return {
      id: migration.id,
      fileName: migration.fileName,
      status: "applied"
    };
  });
}

export function writeMigrationPlanArtifacts(plan: MigrationPlan, outputDir: string): {
  planPath: string;
  sqlPath: string;
} {
  mkdirSync(outputDir, { recursive: true });
  const planPath = resolve(outputDir, "migration-plan.json");
  const sqlPath = resolve(outputDir, "migration-plan.sql");
  writeFileSync(
    planPath,
    JSON.stringify(
      {
        databaseUrl: plan.databaseUrl,
        generatedAt: plan.generatedAt,
        migrations: plan.migrations.map((migration) => ({
          id: migration.id,
          fileName: migration.fileName,
          absolutePath: migration.absolutePath
        }))
      },
      null,
      2
    )
  );
  writeFileSync(sqlPath, renderCombinedMigrationSql(plan));
  return { planPath, sqlPath };
}

const main = (): void => {
  const env = loadEnv();
  const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)));
  const outputDir = resolve(migrationsDir, "../../generated");
  const plan = buildMigrationPlan(env.DATABASE_URL, migrationsDir);
  const artifacts = writeMigrationPlanArtifacts(plan, outputDir);
  const applied = applyMigrationPlan(plan);

  console.info(`Prepared ${plan.migrations.length} migration files for ${env.DATABASE_URL}`);
  console.info(
    `Applied: ${applied.filter((migration) => migration.status === "applied").length}, skipped: ${
      applied.filter((migration) => migration.status === "skipped").length
    }`
  );
  console.info(`Plan: ${artifacts.planPath}`);
  console.info(`Combined SQL: ${artifacts.sqlPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

function runPsql(
  execute: PsqlExecutor,
  args: string[],
  errorMessage: string
) {
  const result = execute(args);
  if (result.status !== 0) {
    throw new Error(
      `${errorMessage} ${result.stderr.trim() || result.stdout.trim() || "Unknown psql error."}`
    );
  }

  return result;
}

function quoteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
