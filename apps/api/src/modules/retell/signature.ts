import { createHmac, timingSafeEqual } from "node:crypto";

export interface RetellSignatureVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string;
  body: unknown;
  secret?: string;
}

export type RetellSignatureVerificationResult =
  | { verified: true; skipped: boolean; reason?: string }
  | { verified: false; skipped: false; reason: string };

export function verifyRetellCustomFunctionSignature(
  input: RetellSignatureVerificationInput
): RetellSignatureVerificationResult {
  if (!input.secret) {
    return { verified: true, skipped: true, reason: "signature_secret_not_configured" };
  }

  const providedSignature = readHeader(input.headers, [
    "x-retell-signature",
    "retell-signature",
    "x-signature"
  ]);
  if (!providedSignature) {
    return { verified: false, skipped: false, reason: "missing_signature" };
  }

  const timestamp = readHeader(input.headers, [
    "x-retell-timestamp",
    "retell-timestamp",
    "x-timestamp"
  ]);
  const serializedBody =
    input.rawBody ?? (typeof input.body === "string" ? input.body : JSON.stringify(input.body ?? {}));
  const webhookStyleMatch = parseWebhookStyleSignature(providedSignature);
  if (webhookStyleMatch) {
    const isValidWebhookStyle = signatureMatches({
      payload: `${serializedBody}${webhookStyleMatch.timestamp}`,
      secret: input.secret!,
      providedSignature: webhookStyleMatch.digest,
      format: "hex_only"
    });

    return isValidWebhookStyle
      ? { verified: true, skipped: false }
      : { verified: false, skipped: false, reason: "signature_mismatch" };
  }
  const signedPayloads = timestamp
    ? [`${timestamp}.${serializedBody}`, `${timestamp}:${serializedBody}`, serializedBody]
    : [serializedBody];

  const isValid = signedPayloads.some((payload) =>
    signatureMatches({
      payload,
      secret: input.secret!,
      providedSignature
    })
  );

  return isValid
    ? { verified: true, skipped: false }
    : { verified: false, skipped: false, reason: "signature_mismatch" };
}

function signatureMatches(input: {
  payload: string;
  secret: string;
  providedSignature: string;
  format?: "hex_only" | "hex_or_base64";
}): boolean {
  const digestHex = createHmac("sha256", input.secret).update(input.payload).digest("hex");
  const normalized = input.providedSignature.replace(/^sha256=/i, "").trim();

  if (input.format === "hex_only") {
    return timingSafeCompare(normalized, digestHex);
  }

  const digestBase64 = createHmac("sha256", input.secret).update(input.payload).digest("base64");
  return timingSafeCompare(normalized, digestHex) || timingSafeCompare(normalized, digestBase64);
}

function timingSafeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  names: string[]
): string | undefined {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
    if (Array.isArray(value)) {
      const first = value.find((entry) => entry.trim().length > 0);
      if (first) {
        return first;
      }
      continue;
    }
    if (value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function parseWebhookStyleSignature(
  signature: string
): { timestamp: string; digest: string } | undefined {
  const match = /^v=(\d+),d=([a-f0-9]+)$/i.exec(signature.trim());
  if (!match) {
    return undefined;
  }
  const [, timestamp, digest] = match;
  if (!timestamp || !digest) {
    return undefined;
  }
  return { timestamp, digest };
}
