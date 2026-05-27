import {
  createEmailOutcome,
  type CommunicationAttempt,
  type CommunicationProviderSendResult,
  type EmailDraftResult,
  type EmailFailureMetadata,
  type EmailOutcome,
  type EmailReplyMetadata,
  type EmailProviderAdapter,
} from "@o2c/domain";
import { GmailApiStubAdapter } from "./communication-providers.js";

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchResponseLike>;

export interface GmailAccessTokenProvider {
  getAccessToken(input: { senderIdentityId: string }): Promise<string>;
}

export interface GmailApiAdapterDependencies {
  accessTokenProvider: GmailAccessTokenProvider;
  fetchImpl?: FetchLike;
  now?: () => string;
}

interface GmailAttachment {
  fileName: string;
  mimeType?: string;
  contentBase64: string;
}

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
  messages?: GmailMessageResponse[];
};

export class GmailApiAdapter
  extends GmailApiStubAdapter
  implements EmailProviderAdapter
{
  private readonly fetchImpl: FetchLike;
  private readonly now: () => string;

  constructor(private readonly deps: GmailApiAdapterDependencies) {
    super();
    this.fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async sendEmail(input: {
    attempt: CommunicationAttempt;
  }): Promise<CommunicationProviderSendResult> {
    const accessToken = await this.resolveAccessToken(input.attempt);
    const payload = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: "/gmail/v1/users/me/messages/send",
      method: "POST",
      body: {
        raw: encodeMimeMessage(
          buildMimeMessage({
            fromEmail: input.attempt.senderEmail,
            fromDisplayName: input.attempt.senderDisplayName,
            toEmail: input.attempt.recipient.email,
            toDisplayName: input.attempt.recipient.displayName,
            ccEmails: readCcEmails(input.attempt),
            subjectLine: input.attempt.subjectLine,
            bodyText: input.attempt.bodyPreview,
            attachments: readAttachments(input.attempt),
          }),
        ),
      },
    });

    return toSendResult(input.attempt, payload, this.now());
  }

  async createDraft(input: {
    attempt: CommunicationAttempt;
  }): Promise<EmailDraftResult> {
    const accessToken = await this.resolveAccessToken(input.attempt);
    const payload = await this.gmailRequest<{ id?: string; message?: GmailMessageResponse }>({
      accessToken,
      path: "/gmail/v1/users/me/drafts",
      method: "POST",
      body: {
        message: {
          raw: encodeMimeMessage(
            buildMimeMessage({
              fromEmail: input.attempt.senderEmail,
              fromDisplayName: input.attempt.senderDisplayName,
              toEmail: input.attempt.recipient.email,
              toDisplayName: input.attempt.recipient.displayName,
              ccEmails: readCcEmails(input.attempt),
              subjectLine: input.attempt.subjectLine,
              bodyText: input.attempt.bodyPreview,
              attachments: readAttachments(input.attempt),
            }),
          ),
        },
      },
    });

    return {
      attemptId: input.attempt.id,
      providerDraftId: payload.id,
      providerMessageId: payload.message?.id,
      providerThreadId: payload.message?.threadId,
      providerConversationId: payload.message?.threadId,
      createdAt: this.now(),
      metadata: {
        provider: "gmail",
        live: true,
      },
    };
  }

  async replyToThread(input: {
    attempt: CommunicationAttempt;
    providerThreadId: string;
    replyToProviderMessageId?: string;
  }): Promise<CommunicationProviderSendResult> {
    const accessToken = await this.resolveAccessToken(input.attempt);
    const replyReference = input.replyToProviderMessageId
      ? await this.fetchMessageReference(accessToken, input.replyToProviderMessageId)
      : undefined;

    const payload = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: "/gmail/v1/users/me/messages/send",
      method: "POST",
      body: {
        threadId: input.providerThreadId,
        raw: encodeMimeMessage(
          buildMimeMessage({
            fromEmail: input.attempt.senderEmail,
            fromDisplayName: input.attempt.senderDisplayName,
            toEmail: input.attempt.recipient.email,
            toDisplayName: input.attempt.recipient.displayName,
            subjectLine: input.attempt.subjectLine ?? replyReference?.subjectLine,
            bodyText: input.attempt.bodyPreview,
            inReplyToMessageId: replyReference?.internetMessageId,
            referencesMessageId: replyReference?.internetMessageId,
            attachments: readAttachments(input.attempt),
          }),
        ),
      },
    });

    return toSendResult(input.attempt, payload, this.now());
  }

  async forwardMessage(input: {
    attempt: CommunicationAttempt;
    providerMessageId: string;
  }): Promise<CommunicationProviderSendResult> {
    const accessToken = await this.resolveAccessToken(input.attempt);
    const original = await this.fetchMessageReference(accessToken, input.providerMessageId);
    const forwardBody = [
      input.attempt.bodyPreview?.trim() ? input.attempt.bodyPreview.trim() : undefined,
      "--- Forwarded message ---",
      original.fromEmail ? `From: ${original.fromEmail}` : undefined,
      original.subjectLine ? `Subject: ${original.subjectLine}` : undefined,
      original.snippet ? `Snippet: ${original.snippet}` : undefined,
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n");

    const payload = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: "/gmail/v1/users/me/messages/send",
      method: "POST",
      body: {
        raw: encodeMimeMessage(
          buildMimeMessage({
            fromEmail: input.attempt.senderEmail,
            fromDisplayName: input.attempt.senderDisplayName,
            toEmail: input.attempt.recipient.email,
            toDisplayName: input.attempt.recipient.displayName,
            subjectLine:
              input.attempt.subjectLine ??
              (original.subjectLine ? prefixForwardSubject(original.subjectLine) : "Fwd"),
            bodyText: forwardBody,
            attachments: readAttachments(input.attempt),
          }),
        ),
      },
    });

    return toSendResult(input.attempt, payload, this.now());
  }

  async fetchDeliveryStatus(input: {
    providerMessageId: string;
  }): Promise<EmailOutcome[]> {
    const accessToken = await this.resolveAccessTokenFromProviderMessage(input.providerMessageId);
    const gmailMessageId = parseProviderMessageId(input.providerMessageId).gmailMessageId;
    const payload = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: `/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=metadata`,
      method: "GET",
    });
    const occurredAt = payload.internalDate
      ? new Date(Number(payload.internalDate)).toISOString()
      : this.now();

    return [
      createEmailOutcome({
        id: `email_outcome:gmail:${input.providerMessageId}:${occurredAt}`,
        communicationAttemptId: input.providerMessageId,
        occurredAt,
        delivered: Boolean(payload.labelIds?.includes("SENT")),
        opened: false,
        replied: false,
        bounced: false,
        linkClicked: false,
        attachmentsSent: [],
        docsRequested: false,
        extractedRemittanceSignal: false,
        metadata: {
          provider: "gmail",
          labelIds: payload.labelIds ?? [],
        },
      }),
    ];
  }

  async fetchReplyMetadata(input: {
    providerMessageId: string;
  }): Promise<EmailReplyMetadata[]> {
    const accessToken = await this.resolveAccessTokenFromProviderMessage(input.providerMessageId);
    const originalMessage = parseProviderMessageId(input.providerMessageId);
    const original = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: `/gmail/v1/users/me/messages/${encodeURIComponent(
        originalMessage.gmailMessageId,
      )}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=From&metadataHeaders=Subject`,
      method: "GET",
    });
    if (!original.threadId) {
      return [];
    }

    const thread = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: `/gmail/v1/users/me/threads/${encodeURIComponent(
        original.threadId,
      )}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=From&metadataHeaders=Subject`,
      method: "GET",
    });
    const originalTimestamp = Number(original.internalDate ?? 0);

    return (thread.messages ?? [])
      .filter((message) => message.id && message.id !== originalMessage.gmailMessageId)
      .filter((message) => Number(message.internalDate ?? 0) >= originalTimestamp)
      .map((message) => ({
        providerMessageId: message.id
          ? `${originalMessage.senderIdentityId}:${message.id}`
          : "unknown",
        providerThreadId: message.threadId,
        providerConversationId: message.threadId,
        replyToProviderMessageId: input.providerMessageId,
        fromEmail: extractEmailAddress(readHeader(message, "From")),
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : undefined,
        metadata: {
          provider: "gmail",
          subjectLine: readHeader(message, "Subject"),
        },
      }));
  }

  async fetchBounceFailureMetadata(_input: {
    providerMessageId: string;
  }): Promise<EmailFailureMetadata[]> {
    return [];
  }

  private async fetchMessageReference(accessToken: string, providerMessageId: string) {
    const parsed = parseProviderMessageId(providerMessageId);
    const payload = await this.gmailRequest<GmailMessageResponse>({
      accessToken,
      path: `/gmail/v1/users/me/messages/${encodeURIComponent(
        parsed.gmailMessageId,
      )}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=From&metadataHeaders=Subject`,
      method: "GET",
    });

    return {
      providerMessageId,
      threadId: payload.threadId,
      internetMessageId: readHeader(payload, "Message-Id"),
      fromEmail: extractEmailAddress(readHeader(payload, "From")),
      subjectLine: readHeader(payload, "Subject"),
      snippet: payload.snippet,
    };
  }

  private async gmailRequest<T>(input: {
    accessToken: string;
    path: string;
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  }): Promise<T> {
    const response = await this.fetchImpl(`https://gmail.googleapis.com${input.path}`, {
      method: input.method,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        ...(input.body ? { "content-type": "application/json; charset=utf-8" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Gmail API request failed with ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  private async resolveAccessToken(attempt: CommunicationAttempt) {
    const senderIdentityId = attempt.senderIdentityId;
    if (!senderIdentityId) {
      throw new Error("Gmail send requires a connected sender identity.");
    }

    return this.deps.accessTokenProvider.getAccessToken({ senderIdentityId });
  }

  private async resolveAccessTokenFromProviderMessage(providerMessageId: string) {
    const parsed = parseProviderMessageId(providerMessageId);
    if (!parsed.senderIdentityId) {
      throw new Error("Gmail provider message metadata is missing the sender identity prefix.");
    }
    return this.deps.accessTokenProvider.getAccessToken({
      senderIdentityId: parsed.senderIdentityId,
    });
  }
}

function toSendResult(
  attempt: CommunicationAttempt,
  payload: GmailMessageResponse,
  acceptedAt: string,
): CommunicationProviderSendResult {
  return {
    attemptId: attempt.id,
    providerMessageId: payload.id ? `${attempt.senderIdentityId}:${payload.id}` : undefined,
    providerThreadId: payload.threadId,
    providerConversationId: payload.threadId,
    acceptedAt,
    metadata: {
      provider: "gmail",
      live: true,
    },
  };
}

function buildMimeMessage(input: {
  fromEmail?: string;
  fromDisplayName?: string;
  toEmail?: string;
  toDisplayName?: string;
  ccEmails?: string[];
  subjectLine?: string;
  bodyText?: string;
  inReplyToMessageId?: string;
  referencesMessageId?: string;
  attachments?: GmailAttachment[];
}) {
  if (!input.fromEmail) {
    throw new Error("Connected Gmail sender email is required.");
  }
  if (!input.toEmail) {
    throw new Error("Recipient email is required.");
  }

  const attachments = input.attachments ?? [];
  const bodyText = input.bodyText?.trim() ? input.bodyText.trim() : "Sent from Yield AROS.";

  const lines = [
    `From: ${formatMailbox(input.fromEmail, input.fromDisplayName)}`,
    `To: ${formatMailbox(input.toEmail, input.toDisplayName)}`,
    ...(input.ccEmails && input.ccEmails.length > 0 ? [`Cc: ${input.ccEmails.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subjectLine ?? "Yield AROS message")}`,
    "MIME-Version: 1.0",
    ...(input.inReplyToMessageId ? [`In-Reply-To: ${input.inReplyToMessageId}`] : []),
    ...(input.referencesMessageId ? [`References: ${input.referencesMessageId}`] : []),
  ];

  if (attachments.length === 0) {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: 8bit");
    lines.push("");
    lines.push(bodyText);
    lines.push("");
    return lines.join("\r\n");
  }

  const boundary = `yield-aros-${Math.random().toString(16).slice(2)}`;
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(bodyText);
  lines.push("");

  for (const attachment of attachments) {
    lines.push(`--${boundary}`);
    lines.push(
      `Content-Type: ${attachment.mimeType?.trim() || "application/octet-stream"}; name="${escapeAttachmentName(attachment.fileName)}"`,
    );
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(
      `Content-Disposition: attachment; filename="${escapeAttachmentName(attachment.fileName)}"`,
    );
    lines.push("");
    lines.push(wrapBase64(attachment.contentBase64));
    lines.push("");
  }

  lines.push(`--${boundary}--`);
  lines.push("");

  return lines.join("\r\n");
}

function readCcEmails(attempt: CommunicationAttempt): string[] {
  const metadata = attempt.metadata as { ccEmails?: unknown } | undefined;
  if (!Array.isArray(metadata?.ccEmails)) {
    return [];
  }

  return metadata.ccEmails.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0,
  );
}

function readAttachments(attempt: CommunicationAttempt): GmailAttachment[] {
  const metadata = attempt.metadata as { attachments?: unknown } | undefined;
  if (!metadata?.attachments || !Array.isArray(metadata.attachments)) {
    return [];
  }

  return metadata.attachments.flatMap((attachment) => {
    if (!attachment || typeof attachment !== "object") {
      return [];
    }

    const candidate = attachment as {
      fileName?: unknown;
      mimeType?: unknown;
      contentBase64?: unknown;
    };

    if (
      typeof candidate.fileName !== "string" ||
      candidate.fileName.trim().length === 0 ||
      typeof candidate.contentBase64 !== "string" ||
      candidate.contentBase64.trim().length === 0
    ) {
      return [];
    }

    return [
      {
        fileName: candidate.fileName.trim(),
        mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType.trim() : undefined,
        contentBase64: candidate.contentBase64.replace(/\s+/g, ""),
      },
    ];
  });
}

function formatMailbox(email: string, displayName?: string) {
  return displayName ? `"${displayName.replace(/"/g, '\\"')}" <${email}>` : email;
}

function encodeMimeMessage(message: string) {
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return value.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function escapeAttachmentName(value: string) {
  return value.replace(/"/g, '\\"');
}

function readHeader(payload: GmailMessageResponse, name: string) {
  return payload.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
    ?.value;
}

function extractEmailAddress(value?: string) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function prefixForwardSubject(subjectLine: string) {
  return /^fwd:/i.test(subjectLine) ? subjectLine : `Fwd: ${subjectLine}`;
}

function parseProviderMessageId(providerMessageId: string) {
  const separatorIndex = providerMessageId.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      senderIdentityId: undefined,
      gmailMessageId: providerMessageId,
    };
  }

  return {
    senderIdentityId: providerMessageId.slice(0, separatorIndex),
    gmailMessageId: providerMessageId.slice(separatorIndex + 1),
  };
}
