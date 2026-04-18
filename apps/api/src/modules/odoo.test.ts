import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../app.js";
import { resetOdooConnectionServiceForTests } from "../bootstrap/odoo-connection-service.js";

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

afterEach(() => {
  vi.unstubAllGlobals();
  resetOdooConnectionServiceForTests();
});

describe("odoo integration API", () => {
  it("returns connection status even when Odoo is not configured", async () => {
    const app = buildApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/integrations/odoo/connection",
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status.kind === "not_configured" || payload.status.kind === "customer_connected").toBe(true);
    expect(payload.connection === null || typeof payload.connection === "object").toBe(true);

    await app.close();
  });

  it("auto-connects when database discovery returns exactly one database", async () => {
    mockJsonFetch([
      { result: ["odoo-prod"] },
      { result: 7 },
      { result: [{ company_id: [1, "Acme Group"] }] },
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations/odoo/connect",
      payload: {
        tenantSlug: "tenant-auto",
        returnTo: "http://127.0.0.1:3000/integrations",
        baseUrl: "https://example.odoo.com",
        username: "finance@example.com",
        password: "secret",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "connected",
      connection: {
        tenantSlug: "tenant-auto",
        baseUrl: "https://example.odoo.com",
        database: "odoo-prod",
        username: "finance@example.com",
        companyName: "Acme Group",
      },
    });

    await app.close();
  });

  it("returns a database picker payload when discovery finds multiple databases", async () => {
    mockJsonFetch([{ result: ["odoo-prod", "odoo-sandbox"] }]);

    const app = buildApiApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations/odoo/connect",
      payload: {
        tenantSlug: "tenant-multi",
        returnTo: "http://127.0.0.1:3000/integrations",
        baseUrl: "https://example.odoo.com",
        username: "finance@example.com",
        password: "secret",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("select_database");
    expect(body.selection.databases).toEqual(["odoo-prod", "odoo-sandbox"]);
    expect(body.selection.baseUrl).toBe("https://example.odoo.com");
    expect(body.selection.username).toBe("finance@example.com");

    const lookup = await app.inject({
      method: "GET",
      url: `/v1/integrations/odoo/connect/${body.selection.state}`,
    });

    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toMatchObject({
      status: "select_database",
      selection: {
        state: body.selection.state,
        databases: ["odoo-prod", "odoo-sandbox"],
      },
    });

    await app.close();
  });

  it("connects after the user selects a discovered database", async () => {
    mockJsonFetch([
      { result: ["odoo-prod", "odoo-sandbox"] },
      { result: 21 },
      { result: [{ company_id: [5, "Metro Retail"] }] },
    ]);

    const app = buildApiApp();
    const initial = await app.inject({
      method: "POST",
      url: "/v1/integrations/odoo/connect",
      payload: {
        tenantSlug: "tenant-select",
        returnTo: "http://127.0.0.1:3000/integrations",
        baseUrl: "https://example.odoo.com",
        username: "finance@example.com",
        password: "secret",
      },
    });

    const pending = initial.json();
    const complete = await app.inject({
      method: "POST",
      url: "/v1/integrations/odoo/connect/select",
      payload: {
        state: pending.selection.state,
        database: "odoo-sandbox",
      },
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({
      status: "connected",
      connection: {
        tenantSlug: "tenant-select",
        database: "odoo-sandbox",
        companyName: "Metro Retail",
      },
    });

    await app.close();
  });
});
