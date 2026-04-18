import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyMigrationPlan,
  buildMigrationPlan,
  discoverMigrationFiles,
  renderCombinedMigrationSql,
  writeMigrationPlanArtifacts
} from "./run.js";

describe("migration runner", () => {
  it("discovers sql migrations in sorted order", () => {
    const dir = mkdtempSync(join(tmpdir(), "o2c-migrations-"));
    writeFileSync(join(dir, "0002_second.sql"), "SELECT 2;");
    writeFileSync(join(dir, "0001_first.sql"), "SELECT 1;");

    const migrations = discoverMigrationFiles(dir);

    expect(migrations.map((migration) => migration.fileName)).toEqual([
      "0001_first.sql",
      "0002_second.sql"
    ]);
  });

  it("writes plan artifacts for the current migration set", () => {
    const dir = mkdtempSync(join(tmpdir(), "o2c-migrations-"));
    const outputDir = join(dir, "generated");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(dir, "0001_first.sql"), "SELECT 1;");
    const plan = buildMigrationPlan("postgres://demo", dir);

    const artifacts = writeMigrationPlanArtifacts(plan, outputDir);

    expect(readFileSync(artifacts.planPath, "utf8")).toContain('"fileName": "0001_first.sql"');
    expect(readFileSync(artifacts.sqlPath, "utf8")).toContain("-- 0001_first.sql");
    expect(renderCombinedMigrationSql(plan)).toContain("SELECT 1;");
  });

  it("applies only unapplied migrations through the executor", () => {
    const dir = mkdtempSync(join(tmpdir(), "o2c-migrations-"));
    writeFileSync(join(dir, "0001_first.sql"), "SELECT 1;");
    writeFileSync(join(dir, "0002_second.sql"), "SELECT 2;");
    const plan = buildMigrationPlan("postgres://demo", dir);
    const calls: string[][] = [];
    const executor = (args: string[]) => {
      calls.push(args);
      const joined = args.join(" ");
      if (joined.includes("SELECT 1 FROM schema_migrations") && joined.includes("0001_first")) {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (joined.includes("SELECT 1 FROM schema_migrations") && joined.includes("0002_second")) {
        return { status: 0, stdout: "1\n", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };

    const applied = applyMigrationPlan(plan, executor);

    expect(applied).toEqual([
      { id: "0001_first", fileName: "0001_first.sql", status: "applied" },
      { id: "0002_second", fileName: "0002_second.sql", status: "skipped" }
    ]);
    expect(calls.some((args) => args.includes("-f") && args.includes(join(dir, "0001_first.sql")))).toBe(true);
    expect(calls.some((args) => args.includes("-f") && args.includes(join(dir, "0002_second.sql")))).toBe(false);
  });
});
