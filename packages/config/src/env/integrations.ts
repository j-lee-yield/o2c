import type { ProviderEnvironmentConfig } from "@o2c/contracts";
import { providerEnvironmentCatalog } from "@o2c/contracts";

import type { AppEnv } from "./schema.js";

export type ProviderRuntimeEnvConfig = ProviderEnvironmentConfig & {
  enabled: boolean;
  values: Record<string, string | number>;
};

export function buildIntegrationProviderEnvConfig(
  env: Partial<AppEnv>,
): Record<ProviderEnvironmentConfig["provider"], ProviderRuntimeEnvConfig> {
  return Object.entries(providerEnvironmentCatalog).reduce<
    Record<ProviderEnvironmentConfig["provider"], ProviderRuntimeEnvConfig>
  >((catalog, [provider, config]) => {
    const requiredValues = config.credentials.requiredKeys.reduce<Record<string, string | number>>(
      (values, key) => {
        const value = env[key as keyof AppEnv];

        if (typeof value === "string" || typeof value === "number") {
          values[key] = value;
        }

        return values;
      },
      {},
    );
    const optionalValues = (config.credentials.optionalKeys ?? []).reduce<
      Record<string, string | number>
    >((values, key) => {
      const value = env[key as keyof AppEnv];

      if (typeof value === "string" || typeof value === "number") {
        values[key] = value;
      }

      return values;
    }, {});

    catalog[provider as ProviderEnvironmentConfig["provider"]] = {
      ...config,
      enabled: config.credentials.requiredKeys.every((key) => key in requiredValues),
      values: {
        ...requiredValues,
        ...optionalValues,
      },
    };

    return catalog;
  }, {} as Record<ProviderEnvironmentConfig["provider"], ProviderRuntimeEnvConfig>);
}
