import { describe, expect, it } from "vitest";
import {
  createClientConnectInviteToken,
  verifyClientConnectInviteToken,
} from "./client-connect-links.js";

describe("client connect invite tokens", () => {
  it("creates and verifies a signed invite token", () => {
    const token = createClientConnectInviteToken(
      {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
      },
      "test-secret",
    );

    const result = verifyClientConnectInviteToken(
      token,
      "test-secret",
      Date.UTC(2026, 3, 16, 0, 0, 0),
    );

    expect(result).toEqual({
      valid: true,
      claims: {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
      },
    });
  });

  it("rejects expired or tampered tokens", () => {
    const token = createClientConnectInviteToken(
      {
        tenantSlug: "acme-pilot",
        clientName: "Acme Foods",
        exp: Date.UTC(2026, 3, 15, 0, 0, 0),
      },
      "test-secret",
    );

    expect(
      verifyClientConnectInviteToken(token, "test-secret", Date.UTC(2026, 3, 16, 0, 0, 0)),
    ).toEqual({
      valid: false,
      reason: "expired",
    });

    expect(
      verifyClientConnectInviteToken(`${token}x`, "test-secret", Date.UTC(2026, 3, 14, 0, 0, 0)),
    ).toEqual({
      valid: false,
      reason: "signature_mismatch",
    });
  });
});
