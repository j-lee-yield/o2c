import { afterAll, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/o2c_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DEFAULT_TENANT_SLUG = "test-tenant";
process.env.JWT_ISSUER = "test-issuer";
process.env.JWT_AUDIENCE = "test-audience";
process.env.JWT_PUBLIC_KEY = "test-public-key";
process.env.JWT_PRIVATE_KEY = "test-private-key";

const { buildApiApp } = await import("./app.js");

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("gmail integration routes", () => {
  it("returns a configuration error when Gmail OAuth is not configured", async () => {
    const previousClientId = process.env.INTEGRATION_GMAIL_CONNECT_CLIENT_ID;
    const previousClientSecret = process.env.INTEGRATION_GMAIL_CONNECT_CLIENT_SECRET;
    const previousRedirectUri = process.env.INTEGRATION_GMAIL_CONNECT_REDIRECT_URI;
    process.env.INTEGRATION_GMAIL_CONNECT_CLIENT_ID = "";
    process.env.INTEGRATION_GMAIL_CONNECT_CLIENT_SECRET = "";
    process.env.INTEGRATION_GMAIL_CONNECT_REDIRECT_URI = "";

    const response = await app.inject({
      method: "GET",
      url: "/v1/integrations/email/gmail/connect",
      query: {
        returnTo: "http://127.0.0.1:3000/integrations",
      },
    });

    restoreEnvValue("INTEGRATION_GMAIL_CONNECT_CLIENT_ID", previousClientId);
    restoreEnvValue("INTEGRATION_GMAIL_CONNECT_CLIENT_SECRET", previousClientSecret);
    restoreEnvValue("INTEGRATION_GMAIL_CONNECT_REDIRECT_URI", previousRedirectUri);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("not configured");
  });
});

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
