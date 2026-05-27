import { spawnSync } from "node:child_process";

export type PostgresCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
}

const postgresCommandMaxBufferBytes = 32 * 1024 * 1024;

export function runPsqlCommand(databaseUrl: string, args: string[]): PostgresCommandResult {
  const result = spawnSync("psql", [databaseUrl, ...args], {
    encoding: "utf8",
    maxBuffer: postgresCommandMaxBufferBytes
  });
  const spawnError = result.error instanceof Error ? result.error.message : "";

  return {
    status: result.status ?? (spawnError ? 1 : null),
    stdout: result.stdout ?? "",
    stderr: spawnError || result.stderr || ""
  };
}

export function executeSqlCommand(databaseUrl: string, sql: string): void {
  const result = runPsqlCommand(databaseUrl, ["-v", "ON_ERROR_STOP=1", "-c", sql]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "psql command failed.");
  }
}

export function queryJsonRows<T>(databaseUrl: string, sql: string): T[] {
  const result = runPsqlCommand(databaseUrl, ["-t", "-A", "-c", sql]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "psql query failed.");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function isDatabaseAvailable(databaseUrl: string): boolean {
  try {
    const result = runPsqlCommand(databaseUrl, ["-Atqc", "SELECT 1;"]);
    return result.status === 0 && result.stdout.trim() === "1";
  } catch {
    return false;
  }
}

export function quoteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function jsonLiteral(value: unknown): string {
  return quoteLiteral(JSON.stringify(value));
}
