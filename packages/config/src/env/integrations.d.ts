import type { ProviderEnvironmentConfig } from "@o2c/contracts";
import type { AppEnv } from "./schema.js";
export type ProviderRuntimeEnvConfig = ProviderEnvironmentConfig & {
    enabled: boolean;
    values: Record<string, string | number>;
};
export declare function buildIntegrationProviderEnvConfig(env: Partial<AppEnv>): Record<ProviderEnvironmentConfig["provider"], ProviderRuntimeEnvConfig>;
//# sourceMappingURL=integrations.d.ts.map