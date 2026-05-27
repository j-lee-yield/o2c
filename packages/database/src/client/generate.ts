import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  coreDomainSchemaVersion,
  enumDefinitions,
  coreTables as coreDomainTables
} from "../schema/core-domain.js";

export type SchemaSnapshot = {
  version: string;
  enums: typeof enumDefinitions;
  tables: Record<string, string[]>;
}

export function buildSchemaSnapshot(): SchemaSnapshot {
  const tables = Object.fromEntries(
    coreDomainTables.map((table) => [table.name, Object.keys(table.columns)])
  );

  return {
    version: coreDomainSchemaVersion,
    enums: enumDefinitions,
    tables
  };
}

export function renderSchemaSnapshotModule(snapshot: SchemaSnapshot, generatedAt: string): string {
  return `export const generatedAt = ${JSON.stringify(generatedAt)};

export const schemaSnapshot = ${JSON.stringify(snapshot, null, 2)} as const;

export type GeneratedSchemaSnapshot = typeof schemaSnapshot;
`;
}

export function writeSchemaSnapshot(outputPath: string, generatedAt: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderSchemaSnapshotModule(buildSchemaSnapshot(), generatedAt));
}

const main = (): void => {
  const outputPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../generated/schema-snapshot.ts"
  );
  const generatedAt = new Date().toISOString();
  writeSchemaSnapshot(outputPath, generatedAt);
  const snapshot = buildSchemaSnapshot();
  console.info(`Generated schema snapshot at ${outputPath}`);
  console.info(`Schema version: ${snapshot.version}`);
  console.info(`Enums: ${Object.keys(snapshot.enums).join(", ")}`);
  console.info(`Tables: ${Object.keys(snapshot.tables).join(", ")}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
