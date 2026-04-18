import { createHmac, timingSafeEqual } from "node:crypto";

export interface ClientConnectInviteClaims {
  tenantSlug: string;
  clientName: string;
  exp?: number;
}

export type ClientConnectInviteVerificationResult =
  | {
      valid: true;
      claims: ClientConnectInviteClaims;
    }
  | {
      valid: false;
      reason: "missing" | "malformed" | "signature_mismatch" | "expired";
    };

export function createClientConnectInviteToken(
  claims: ClientConnectInviteClaims,
  secret: string,
): string {
  const normalizedClaims: ClientConnectInviteClaims = {
    tenantSlug: claims.tenantSlug.trim(),
    clientName: claims.clientName.trim(),
    ...(typeof claims.exp === "number" ? { exp: claims.exp } : {}),
  };
  const payload = base64UrlEncode(JSON.stringify(normalizedClaims));
  const signature = createSignature(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyClientConnectInviteToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): ClientConnectInviteVerificationResult {
  if (!token || token.trim().length === 0) {
    return { valid: false, reason: "missing" };
  }

  const [payload, signature] = token.trim().split(".");
  if (!payload || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSignature = createSignature(payload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: "signature_mismatch" };
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<ClientConnectInviteClaims>;
    if (
      typeof parsed.tenantSlug !== "string" ||
      parsed.tenantSlug.trim().length === 0 ||
      typeof parsed.clientName !== "string" ||
      parsed.clientName.trim().length === 0 ||
      (parsed.exp !== undefined && typeof parsed.exp !== "number")
    ) {
      return { valid: false, reason: "malformed" };
    }

    if (typeof parsed.exp === "number" && parsed.exp <= now) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      claims: {
        tenantSlug: parsed.tenantSlug.trim(),
        clientName: parsed.clientName.trim(),
        ...(typeof parsed.exp === "number" ? { exp: parsed.exp } : {}),
      },
    };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}

function createSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
