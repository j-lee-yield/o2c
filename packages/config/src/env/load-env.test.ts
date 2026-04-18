import { describe, expect, it } from "vitest";
import { buildIntegrationProviderEnvConfig } from "./integrations.js";
import { loadEnv } from "./load-env.js";

describe("loadEnv", () => {
  it("parses runtime configuration with defaults", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/o2c",
      REDIS_URL: "redis://localhost:6379",
      DEFAULT_TENANT_SLUG: "acme",
      JWT_ISSUER: "issuer",
      JWT_AUDIENCE: "audience",
      JWT_PUBLIC_KEY: "public",
      JWT_PRIVATE_KEY: "private"
    });

    expect(env.API_PORT).toBe(3001);
    expect(env.WORKER_CONCURRENCY).toBe(5);
  });

  it("builds provider runtime config and flags enabled integrations with complete credentials", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/o2c",
      REDIS_URL: "redis://localhost:6379",
      DEFAULT_TENANT_SLUG: "acme",
      JWT_ISSUER: "issuer",
      JWT_AUDIENCE: "audience",
      JWT_PUBLIC_KEY: "public",
      JWT_PRIVATE_KEY: "private",
      INTEGRATION_QUICKBOOKS_CLIENT_ID: "qb-client",
      INTEGRATION_QUICKBOOKS_CLIENT_SECRET: "qb-secret",
      INTEGRATION_EMAIL_HOST: "imap.example.com",
    });
    const providerEnv = buildIntegrationProviderEnvConfig(env);

    expect(providerEnv.quickbooks_online.enabled).toBe(true);
    expect(providerEnv.quickbooks_online.values).toMatchObject({
      INTEGRATION_QUICKBOOKS_CLIENT_ID: "qb-client",
      INTEGRATION_QUICKBOOKS_CLIENT_SECRET: "qb-secret",
    });
    expect(providerEnv.email_inbox.enabled).toBe(false);
  });
});
