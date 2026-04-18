import { providerEnvironmentCatalog } from "@o2c/contracts";
export function buildIntegrationProviderEnvConfig(env) {
    return Object.entries(providerEnvironmentCatalog).reduce((catalog, [provider, config]) => {
        const requiredValues = config.credentials.requiredKeys.reduce((values, key) => {
            const value = env[key];
            if (typeof value === "string" || typeof value === "number") {
                values[key] = value;
            }
            return values;
        }, {});
        const optionalValues = (config.credentials.optionalKeys ?? []).reduce((values, key) => {
            const value = env[key];
            if (typeof value === "string" || typeof value === "number") {
                values[key] = value;
            }
            return values;
        }, {});
        catalog[provider] = {
            ...config,
            enabled: config.credentials.requiredKeys.every((key) => key in requiredValues),
            values: {
                ...requiredValues,
                ...optionalValues,
            },
        };
        return catalog;
    }, {});
}
//# sourceMappingURL=integrations.js.map