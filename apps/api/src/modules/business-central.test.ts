import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetBusinessCentralConnectionServiceForTests } from "../bootstrap/business-central-connection-service.js";

process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID ??= "bc-client";
process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET ??= "bc-secret";
process.env.INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI ??=
  "http://127.0.0.1:3001/v1/integrations/business-central/callback";

const TEST_TENANT = process.env.DEFAULT_TENANT_SLUG ?? "test-tenant";

function mockJsonFetch(responses: Array<unknown>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeIdToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
  return `header.${encoded}.signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBusinessCentralConnectionServiceForTests();
});

describe("business central integration API", () => {
  it("returns OAuth errors back to the original client connect page", async () => {
    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}`,
    });

    expect(connect.statusCode).toBe(302);
    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}` +
        `&error=invalid_client&error_description=${encodeURIComponent("Microsoft sign-in failed.")}`,
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      "http://127.0.0.1:3000/connect/accounting?token=signed-token&bc=error&message=Microsoft+sign-in+failed.",
    );

    await app.close();
  });

  it("supports company selection when the authorized account can access multiple companies", async () => {
    mockJsonFetch([
      {
        access_token: "bc-access-token",
        refresh_token: "bc-refresh-token",
        expires_in: 3600,
        id_token: makeIdToken({
          tid: "tenant-guid-1",
          preferred_username: "controller@contoso.com",
        }),
      },
      {
        value: [
          { id: "company-1", displayName: "Contoso Holding" },
          { id: "company-2", displayName: "Contoso Manufacturing" },
        ],
      },
    ]);

    const app = buildApiApp();

    const connect = await app.inject({
      method: "GET",
      url:
        `/v1/integrations/business-central/connect?tenantSlug=${encodeURIComponent(TEST_TENANT)}` +
        `&returnTo=${encodeURIComponent("http://127.0.0.1:3000/connect/accounting?token=signed-token")}` +
        `&environment=production&loginHint=${encodeURIComponent("controller@contoso.com")}` +
        `&domainHint=${encodeURIComponent("contoso.com")}`,
    });

    expect(connect.statusCode).toBe(302);
    expect(connect.headers.location).toContain("login.microsoftonline.com");
    expect(connect.headers.location).toContain("login_hint=controller%40contoso.com");
    expect(connect.headers.location).toContain("domain_hint=contoso.com");

    const redirectUrl = new URL(connect.headers.location ?? "");
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/callback?state=${encodeURIComponent(state ?? "")}&code=auth-code-1`,
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("bcConnectState=");

    const callbackTarget = new URL(callback.headers.location ?? "");
    const selectionState = callbackTarget.searchParams.get("bcConnectState");
    expect(selectionState).toBeTruthy();

    const selection = await app.inject({
      method: "GET",
      url: `/v1/integrations/business-central/connect/${encodeURIComponent(selectionState ?? "")}`,
    });

    expect(selection.statusCode).toBe(200);
    expect(selection.json()).toMatchObject({
      status: "select_company",
      selection: {
        state: selectionState,
        environment: "production",
        loginHint: "controller@contoso.com",
        domainHint: "contoso.com",
        companies: [
          { id: "company-1", name: "Contoso Holding" },
          { id: "company-2", name: "Contoso Manufacturing" },
        ],
      },
    });

    const finalize = await app.inject({
      method: "POST",
      url: "/v1/integrations/business-central/connect/select",
      payload: {
        state: selectionState,
        companyId: "company-2",
      },
    });

    expect(finalize.statusCode).toBe(200);
    expect(finalize.json()).toMatchObject({
      status: "connected",
      connection: {
        tenantSlug: TEST_TENANT,
        companyId: "company-2",
        companyName: "Contoso Manufacturing",
        tenantId: "tenant-guid-1",
        tenantLabel: "controller@contoso.com",
      },
    });

    const connection = await app.inject({
      method: "GET",
      url: "/v1/integrations/business-central/connection",
    });

    expect(connection.statusCode).toBe(200);
    expect(connection.json()).toMatchObject({
      status: {
        kind: "customer_connected",
        companyName: "Contoso Manufacturing",
        environment: "production",
      },
      connection: {
        tenantSlug: TEST_TENANT,
        companyId: "company-2",
        companyName: "Contoso Manufacturing",
      },
    });

    await app.close();
  });
});
