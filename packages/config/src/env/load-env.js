import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envSchema } from "./schema.js";
export const loadEnv = (source) => {
    const mergedSource = source
        ? source
        : { ...loadDotEnvFiles(process.cwd()), ...process.env };
    return envSchema.parse(mergedSource);
};
function loadDotEnvFiles(startDir) {
    const envDir = findEnvDirectory(startDir);
    if (!envDir) {
        return {};
    }
    const fileNames = process.env.NODE_ENV === "test" ? [".env", ".env.test"] : [".env"];
    return fileNames.reduce((acc, fileName) => {
        const filePath = join(envDir, fileName);
        if (!existsSync(filePath)) {
            return acc;
        }
        return { ...acc, ...parseDotEnv(readFileSync(filePath, "utf8")) };
    }, {});
}
function findEnvDirectory(startDir) {
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
function parseDotEnv(contents) {
    return contents.split(/\r?\n/).reduce((acc, line) => {
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
        const value = rawValue.startsWith("\"") && rawValue.endsWith("\"")
            ? rawValue.slice(1, -1)
            : rawValue.startsWith("'") && rawValue.endsWith("'")
                ? rawValue.slice(1, -1)
                : rawValue;
        return key.length > 0 ? { ...acc, [key]: value } : acc;
    }, {});
}
//# sourceMappingURL=load-env.js.map