import { afterEach, describe, expect, it } from "vitest";
import { buildApiApp } from "../app.js";
import { resetClientConnectInviteStoreForTests } from "./client-connect-invites.js";

afterEach(() => {
  resetClientConnectInviteStoreForTests();
});

describe("client connect invite API", () => {
  it("creates, resolves, lists, and cancels an invite with controller permissions", async () => {
    const app = buildApiApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/integrations/client-connect-invites",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller",
      },
      payload: {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      invite?: { inviteId?: string; token?: string; status?: string };
    };
    expect(created.invite?.status).toBe("active");
    expect(created.invite?.token).toBeTruthy();

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/integrations/client-connect-invites?tenantSlug=acme-pilot",
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller",
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      items: [
        {
          tenantSlug: "acme-pilot",
          clientName: "Acme Foods",
          status: "active",
        },
      ],
    });

    const resolveResponse = await app.inject({
      method: "GET",
      url: `/v1/integrations/client-connect-invites/resolve?token=${encodeURIComponent(created.invite?.token ?? "")}`,
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.json()).toMatchObject({
      invite: {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
        status: "active",
      },
      claims: {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
      },
    });

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/integrations/client-connect-invites/${created.invite?.inviteId}/cancel`,
      headers: {
        "x-principal-id": "web_console",
        "x-principal-roles": "controller",
      },
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({
      invite: {
        status: "cancelled",
      },
    });

    const cancelledResolveResponse = await app.inject({
      method: "GET",
      url: `/v1/integrations/client-connect-invites/resolve?token=${encodeURIComponent(created.invite?.token ?? "")}`,
    });
    expect(cancelledResolveResponse.statusCode).toBe(403);

    await app.close();
  });

  it("rejects invite creation without elevated operator roles", async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations/client-connect-invites",
      headers: {
        "x-principal-id": "collector_api",
        "x-principal-roles": "ar_collector",
      },
      payload: {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
