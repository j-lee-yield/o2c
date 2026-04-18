import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envSchema, type AppEnv } from "./schema.js";

export const loadEnv = (source?: NodeJS.ProcessEnv): AppEnv => {
  const mergedSource = source
    ? source
    : { ...loadDotEnvFiles(process.cwd()), ...process.env };
  return envSchema.parse(mergedSource);
};

function loadDotEnvFiles(startDir: string): Record<string, string> {
  const envDir = findEnvDirectory(startDir);
  if (!envDir) {
    return {};
  }

  const fileNames =
    process.env.NODE_ENV === "test" ? [".env", ".env.test"] : [".env"];

  return fileNames.reduce<Record<string, string>>((acc, fileName) => {
    const filePath = join(envDir, fileName);
    if (!existsSync(filePath)) {
      return acc;
    }

    return { ...acc, ...parseDotEnv(readFileSync(filePath, "utf8")) };
  }, {});
}

function findEnvDirectory(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    if (existsSync(join(currentDir, ".env"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

function parseDotEnv(contents: string): Record<string, string> {
  return contents.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      return acc;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value =
      rawValue.startsWith("\"") && rawValue.endsWith("\"")
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;

    return key.length > 0 ? { ...acc, [key]: value } : acc;
  }, {});
}
