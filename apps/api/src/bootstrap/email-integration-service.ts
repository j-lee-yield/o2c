import { randomUUID } from "node:crypto";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { loadEnv } from "@o2c/config";
import {
  createDatabaseClientConfig,
  isDatabaseAvailable,
  PostgresCommunicationAttemptStore,
  PostgresEmailThreadReferenceStore,
  PostgresGmailOauthConnectionStore,
  PostgresImmutableActivityLogStore,
  PostgresSendingIdentityStore,
} from "@o2c/database";
import {
  createDefaultCommunicationProviderRegistry,
  GmailApiAdapter,
  InMemoryEmailThreadReferenceStore,
  InMemorySendingIdentityStore,
  OutboundEmailWorkflowService,
  type GmailAccessTokenProvider,
} from "@o2c/workflows";
import {
  updateSendingIdentityHealth,
  type SendingIdentity,
  type SendingIdentityHealthCheck,
} from "@o2c/domain";
import type { Principal } from "@o2c/auth";

type GmailConnectConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GmailTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  token_type?: string;
};

type GmailConnectSession = {
  state: string;
  returnTo: string;
  createdAt: string;
  requestedEmail?: string;
  makeDefault?: boolean;
  requestedByPrincipalId?: string;
  requestedByPrincipalRoles?: string[];
};

type GmailUserProfile = {
  email?: string;
  name?: string;
};

type GmailMailboxProfile = {
  emailAddress?: string;
};

export type GmailInboxMessage = {
  providerMessageId: string;
  providerThreadId?: string;
  subjectLine?: string;
  fromEmail?: string;
  fromName?: string;
  toEmail?: string;
  snippet?: string;
  bodyText?: string;
  receivedAt?: string;
  labelIds: string[];
  unread: boolean;
  direction: "inbound" | "outbound";
};

export type GmailInboxThread = {
  senderIdentityId: string;
  providerThreadId: string;
  subjectLine?: string;
  snippet?: string;
  participants: string[];
  latestMessageAt?: string;
  unreadCount: number;
  messages: GmailInboxMessage[];
};

type GmailConnectionRecord = {
  senderIdentityId: string;
  senderEmail: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  scopes: string[];
  displayName?: string;
  connectedAt: string;
  updatedAt: string;
};

interface GmailOauthConnectionPersistence {
  save(input: GmailConnectionRecord & {
    requestedByPrincipalId?: string;
    requestedByPrincipalRoles?: string[];
    metadata?: Record<string, unknown>;
  }): void;
  get(senderIdentityId: string): GmailConnectionRecord | undefined;
}

type GmailConnectResult = {
  returnTo: string;
  identity: SendingIdentity;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
};
type ApiFetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: URLSearchParams;
  },
) => Promise<FetchResponseLike>;

type GmailMessageListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  resultSizeEstimate?: number;
};

type GmailMessageDetail = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePayload;
  messages?: GmailMessageDetail[];
};

type GmailMessagePayload = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailMessagePayload[];
};

export class GmailConnectionService implements GmailAccessTokenProvider {
  private readonly sessions = new Map<string, GmailConnectSession>();
  private readonly connections = new Map<string, GmailConnectionRecord>();
  private readonly fetchImpl: ApiFetchLike;
  private readonly connectionStore: GmailOauthConnectionPersistence | undefined;

  constructor(
    private readonly emailService: OutboundEmailWorkflowService,
    input?: { fetchImpl?: ApiFetchLike; connectionStore?: GmailOauthConnectionPersistence },
  ) {
    this.fetchImpl = input?.fetchImpl ?? (fetch as unknown as ApiFetchLike);
    this.connectionStore = input?.connectionStore;
  }

  getConnectConfig(): GmailConnectConfig | undefined {
    const env = loadEnv() as unknown as Record<string, string | number | undefined>;
    const clientId = readEnv(env.INTEGRATION_GMAIL_CONNECT_CLIENT_ID);
    const clientSecret = readEnv(env.INTEGRATION_GMAIL_CONNECT_CLIENT_SECRET);
    const redirectUri = readEnv(env.INTEGRATION_GMAIL_CONNECT_REDIRECT_URI);
    if (!clientId || !clientSecret || !redirectUri) {
      return undefined;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
    };
  }

  createConnectSession(input: {
    returnTo: string;
    requestedEmail?: string;
    makeDefault?: boolean;
    requestedByPrincipalId?: string;
    requestedByPrincipalRoles?: string[];
  }) {
    const config = this.getConnectConfig();
    if (!config) {
      return undefined;
    }

    const state = randomUUID();
    this.sessions.set(state, {
      state,
      returnTo: input.returnTo,
      createdAt: new Date().toISOString(),
      ...(input.requestedEmail ? { requestedEmail: input.requestedEmail } : {}),
      ...(input.makeDefault !== undefined ? { makeDefault: input.makeDefault } : {}),
      ...(input.requestedByPrincipalId
        ? { requestedByPrincipalId: input.requestedByPrincipalId }
        : {}),
      ...(input.requestedByPrincipalRoles
        ? { requestedByPrincipalRoles: input.requestedByPrincipalRoles }
        : {}),
    });

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.readonly",
      ].join(" "),
      state,
      ...(input.requestedEmail ? { login_hint: input.requestedEmail } : {}),
    }).toString();

    return {
      state,
      authorizationUrl: authorizationUrl.toString(),
    };
  }

  async completeConnectSession(input: {
    state: string;
    code: string;
    principal?: Principal;
  }): Promise<GmailConnectResult> {
    const config = this.getConnectConfig();
    if (!config) {
      throw new Error("Gmail connection is not configured.");
    }

    const session = this.sessions.get(input.state);
    if (!session) {
      throw new Error("Gmail connection session was not found or has expired.");
    }
    this.sessions.delete(input.state);

    const tokenPayload = await this.exchangeAuthorizationCode(config, input.code);
    if (!tokenPayload.access_token) {
      throw new Error("Google authorization did not return an access token.");
    }

    const profile = await this.loadUserProfile(tokenPayload.access_token);
    const mailbox = await this.loadMailboxProfile(tokenPayload.access_token);
    const senderEmail = mailbox.emailAddress ?? profile.email ?? session.requestedEmail;
    if (!senderEmail) {
      throw new Error("Google authorization did not return the mailbox email address.");
    }

    const scopes = normalizeScopes(tokenPayload.scope);
    const existingIdentity = this.emailService
      .listSendingIdentities()
      .find(
        (identity) =>
          identity.provider === "gmail" &&
          identity.senderEmail.toLowerCase() === senderEmail.toLowerCase(),
      );
    const now = new Date();
    const identity = this.emailService.connectSendingIdentity({
      ...(existingIdentity ? { id: existingIdentity.id } : {}),
      provider: "gmail",
      authMode: "oauth2",
      senderEmail,
      ...(profile.name ? { displayName: profile.name } : {}),
      ...(session.requestedByPrincipalId
        ? { ownerPrincipalId: session.requestedByPrincipalId }
        : {}),
      ...(session.requestedByPrincipalRoles
        ? { ownerPrincipalRoles: session.requestedByPrincipalRoles }
        : {}),
      scopes,
      isDefault:
        session.makeDefault ?? existingIdentity?.isDefault ?? this.emailService.listSendingIdentities().length === 0,
      connectionStatus: "connected",
      permissionStatus: determinePermissionStatus(scopes),
      healthState: "healthy",
      lastSyncAt: now.toISOString(),
      lastSendCheckAt: now.toISOString(),
      ...(input.principal ? { principal: input.principal } : {}),
    });

    const connectionRecord = {
      senderIdentityId: identity.id,
      senderEmail: identity.senderEmail,
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token ? { refreshToken: tokenPayload.refresh_token } : {}),
      accessTokenExpiresAt: new Date(
        now.getTime() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      scopes,
      ...(profile.name ? { displayName: profile.name } : {}),
      connectedAt: this.connections.get(identity.id)?.connectedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.connections.set(identity.id, connectionRecord);
    this.connectionStore?.save({
      ...connectionRecord,
      ...(session.requestedByPrincipalId
        ? { requestedByPrincipalId: session.requestedByPrincipalId }
        : {}),
      ...(session.requestedByPrincipalRoles
        ? { requestedByPrincipalRoles: session.requestedByPrincipalRoles }
        : {}),
    });

    return {
      returnTo: session.returnTo,
      identity,
    };
  }

  async getAccessToken(input: { senderIdentityId: string }): Promise<string> {
    const connection =
      this.connections.get(input.senderIdentityId) ??
      this.connectionStore?.get(input.senderIdentityId);
    if (!connection) {
      throw new Error("Gmail mailbox connection was not found.");
    }
    this.connections.set(input.senderIdentityId, connection);

    const expiresAt = Date.parse(connection.accessTokenExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
      return connection.accessToken;
    }

    if (!connection.refreshToken) {
      throw new Error("Gmail mailbox connection is stale and requires reconnection.");
    }

    const config = this.getConnectConfig();
    if (!config) {
      throw new Error("Gmail connection is not configured.");
    }

    const tokenPayload = await this.refreshAccessToken(config, connection.refreshToken);
    if (!tokenPayload.access_token) {
      throw new Error("Google token refresh did not return an access token.");
    }

    const refreshed: GmailConnectionRecord = {
      ...connection,
      accessToken: tokenPayload.access_token,
      ...(tokenPayload.refresh_token ? { refreshToken: tokenPayload.refresh_token } : {}),
      accessTokenExpiresAt: new Date(
        Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
      ).toISOString(),
      scopes: normalizeScopes(tokenPayload.scope, connection.scopes),
      updatedAt: new Date().toISOString(),
    };
    this.connections.set(connection.senderIdentityId, refreshed);
    this.connectionStore?.save(refreshed);

    return refreshed.accessToken;
  }

  async validateIdentity(identity: SendingIdentity): Promise<{
    identity: SendingIdentity;
    healthCheck: SendingIdentityHealthCheck;
  }> {
    const checkedAt = new Date().toISOString();
    const connection =
      this.connections.get(identity.id) ?? this.connectionStore?.get(identity.id);
    if (!connection) {
      const updated = updateSendingIdentityHealth(identity, {
        checkedAt,
        status: "failed",
        reasonCodes: ["mailbox_disconnected"],
        actorId: "system_email",
        actorRole: "system",
      });
      const saved = this.emailService.saveSendingIdentity({
        ...updated,
        connectionStatus: "disconnected",
        permissionStatus: "missing",
      });
      return {
        identity: saved,
        healthCheck: {
          status: "failed",
          checkedAt,
          reasonCodes: ["mailbox_disconnected"],
        },
      };
    }

    try {
      const accessToken = await this.getAccessToken({ senderIdentityId: identity.id });
      const mailbox = await this.loadMailboxProfile(accessToken);
      const reasonCodes: string[] = [];
      if (!mailbox.emailAddress) {
        reasonCodes.push("mailbox_profile_unavailable");
      }
      if (mailbox.emailAddress && mailbox.emailAddress.toLowerCase() !== identity.senderEmail) {
        reasonCodes.push("mailbox_sender_mismatch");
      }
      if (!connection.scopes.some((scope) => scope === "https://www.googleapis.com/auth/gmail.send")) {
        reasonCodes.push("permissions_missing");
      }

      const status =
        reasonCodes.length === 0
          ? "healthy"
          : reasonCodes.includes("permissions_missing")
            ? "degraded"
            : "failed";
      const updated = updateSendingIdentityHealth(identity, {
        checkedAt,
        status: status === "healthy" ? "healthy" : status === "degraded" ? "degraded" : "failed",
        reasonCodes,
        actorId: "system_email",
        actorRole: "system",
      });
      const saved = this.emailService.saveSendingIdentity({
        ...updated,
        connectionStatus: status === "failed" ? "disconnected" : "connected",
        permissionStatus: determinePermissionStatus(connection.scopes),
        scopes: connection.scopes,
        lastSyncAt: checkedAt,
      });

      return {
        identity: saved,
        healthCheck: {
          status: status === "healthy" ? "healthy" : status === "degraded" ? "degraded" : "failed",
          checkedAt,
          reasonCodes,
        },
      };
    } catch (error) {
      const updated = updateSendingIdentityHealth(identity, {
        checkedAt,
        status: "failed",
        reasonCodes: ["mailbox_disconnected"],
        actorId: "system_email",
        actorRole: "system",
      });
      const saved = this.emailService.saveSendingIdentity({
        ...updated,
        connectionStatus: "disconnected",
        permissionStatus: identity.permissionStatus,
        metadata: {
          ...identity.metadata,
          validationError: error instanceof Error ? error.message : "Unknown Gmail validation failure.",
        },
      });

      return {
        identity: saved,
        healthCheck: {
          status: "failed",
          checkedAt,
          reasonCodes: ["mailbox_disconnected"],
        },
      };
    }
  }

  async listInboxMessages(input?: {
    senderIdentityId?: string;
    maxResults?: number;
  }): Promise<{
    senderIdentity: SendingIdentity;
    messages: GmailInboxMessage[];
    resultSizeEstimate: number;
  }> {
    const identity = this.resolveInboxIdentity(input?.senderIdentityId);
    const accessToken = await this.getReadableInboxAccessToken(identity);
    const maxResults = Math.min(Math.max(input?.maxResults ?? 20, 1), 50);
    const response = await this.fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=${maxResults}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Gmail inbox list request failed.");
    }

    const payload = (await response.json()) as GmailMessageListResponse;
    const messages = await Promise.all(
      (payload.messages ?? [])
        .filter((message): message is { id: string; threadId?: string } => Boolean(message.id))
        .map(async (message) => this.fetchInboxMessageDetail(accessToken, identity.id, message.id)),
    );

    return {
      senderIdentity: identity,
      messages,
      resultSizeEstimate: payload.resultSizeEstimate ?? messages.length,
    };
  }

  async getInboxThread(input: {
    senderIdentityId?: string;
    providerThreadId: string;
  }): Promise<{
    senderIdentity: SendingIdentity;
    thread: GmailInboxThread;
  }> {
    const identity = this.resolveInboxIdentity(input.senderIdentityId);
    const accessToken = await this.getReadableInboxAccessToken(identity);
    const response = await this.fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
        input.providerThreadId,
      )}?format=full`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Gmail inbox thread request failed.");
    }

    const payload = (await response.json()) as GmailMessageDetail;
    const messages = (payload.messages ?? [])
      .map((message) => this.toInboxMessage(identity.id, message))
      .sort(compareInboxMessagesDesc);
    const latest = messages[0];
    const participants = Array.from(
      new Set(
        messages
          .flatMap((message) => [message.fromEmail, message.toEmail])
          .filter((value): value is string => Boolean(value)),
      ),
    );

    return {
      senderIdentity: identity,
      thread: {
        senderIdentityId: identity.id,
        providerThreadId: input.providerThreadId,
        ...(latest?.subjectLine ? { subjectLine: latest.subjectLine } : {}),
        ...(latest?.snippet ? { snippet: latest.snippet } : {}),
        ...(latest?.receivedAt ? { latestMessageAt: latest.receivedAt } : {}),
        participants,
        unreadCount: messages.filter((message) => message.unread).length,
        messages,
      },
    };
  }

  private async exchangeAuthorizationCode(
    config: GmailConnectConfig,
    code: string,
  ): Promise<GmailTokenPayload> {
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Google token exchange failed.");
    }

    return (await response.json()) as GmailTokenPayload;
  }

  private async refreshAccessToken(
    config: GmailConnectConfig,
    refreshToken: string,
  ): Promise<GmailTokenPayload> {
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Google token refresh failed.");
    }

    return (await response.json()) as GmailTokenPayload;
  }

  private async loadUserProfile(accessToken: string): Promise<GmailUserProfile> {
    const response = await this.fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      return {};
    }
    return (await response.json()) as GmailUserProfile;
  }

  private async loadMailboxProfile(accessToken: string): Promise<GmailMailboxProfile> {
    const response = await this.fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Gmail mailbox profile lookup failed.");
    }
    return (await response.json()) as GmailMailboxProfile;
  }

  private resolveInboxIdentity(senderIdentityId?: string): SendingIdentity {
    const identities = this.emailService
      .listSendingIdentities()
      .filter((identity) => identity.provider === "gmail");
    if (identities.length === 0) {
      throw new Error("Connect a Gmail mailbox before opening Inbox.");
    }

    if (senderIdentityId) {
      const matched = identities.find((identity) => identity.id === senderIdentityId);
      if (!matched) {
        throw new Error(`Gmail sending identity ${senderIdentityId} was not found.`);
      }
      return matched;
    }

    return identities.find((identity) => identity.isDefault) ?? identities[0]!;
  }

  private async getReadableInboxAccessToken(identity: SendingIdentity) {
    const connection = this.connections.get(identity.id) ?? this.connectionStore?.get(identity.id);
    if (!connection) {
      throw new Error("Gmail mailbox connection was not found.");
    }
    const canReadInbox = connection.scopes.some(
      (scope) =>
        scope === "https://www.googleapis.com/auth/gmail.readonly" ||
        scope === "https://www.googleapis.com/auth/gmail.modify",
    );
    if (!canReadInbox) {
      throw new Error("Connected Gmail mailbox does not have inbox read permission.");
    }
    return this.getAccessToken({ senderIdentityId: identity.id });
  }

  private async fetchInboxMessageDetail(
    accessToken: string,
    senderIdentityId: string,
    gmailMessageId: string,
  ) {
    const response = await this.fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
        gmailMessageId,
      )}?format=full`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Gmail inbox message request failed.");
    }

    const payload = (await response.json()) as GmailMessageDetail;
    return this.toInboxMessage(senderIdentityId, payload);
  }

  private toInboxMessage(
    senderIdentityId: string,
    message: GmailMessageDetail,
  ): GmailInboxMessage {
    const fromHeader = readHeaderValue(message, "From");
    const toHeader = readHeaderValue(message, "To");
    const subjectLine = readHeaderValue(message, "Subject");
    const fromEmail = extractEmailAddress(fromHeader);
    const fromName = extractDisplayName(fromHeader);
    const toEmail = extractEmailAddress(toHeader);
    const labelIds = message.labelIds ?? [];
    const bodyText = extractGmailBodyText(message.payload);

    return {
      providerMessageId: message.id ? `${senderIdentityId}:${message.id}` : `${senderIdentityId}:unknown`,
      ...(message.threadId ? { providerThreadId: message.threadId } : {}),
      ...(subjectLine ? { subjectLine } : {}),
      ...(fromEmail ? { fromEmail } : {}),
      ...(fromName ? { fromName } : {}),
      ...(toEmail ? { toEmail } : {}),
      ...(message.snippet ? { snippet: message.snippet } : {}),
      ...(bodyText ? { bodyText } : {}),
      ...(message.internalDate
        ? { receivedAt: new Date(Number(message.internalDate)).toISOString() }
        : {}),
      labelIds,
      unread: labelIds.includes("UNREAD"),
      direction: labelIds.includes("SENT") ? "outbound" : "inbound",
    };
  }
}

let services:
  | {
      emailOutboundService: OutboundEmailWorkflowService;
      gmailConnectionService: GmailConnectionService;
    }
  | undefined;

export function getEmailOutboundService() {
  return initializeEmailServices().emailOutboundService;
}

export function getGmailConnectionService() {
  return initializeEmailServices().gmailConnectionService;
}

function determinePermissionStatus(scopes: string[]): SendingIdentity["permissionStatus"] {
  const hasSend = scopes.includes("https://www.googleapis.com/auth/gmail.send");
  const hasCompose = scopes.includes("https://www.googleapis.com/auth/gmail.compose");
  const hasRead = scopes.includes("https://www.googleapis.com/auth/gmail.readonly");
  if (hasSend && hasCompose && hasRead) {
    return "granted";
  }
  if (hasSend || hasCompose || hasRead) {
    return "partial";
  }
  return "missing";
}

function normalizeScopes(scopeValue?: string, fallback: string[] = []) {
  if (!scopeValue) {
    return [...fallback];
  }
  return scopeValue
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function readEnv(value: string | number | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function initializeEmailServices() {
  if (services) {
    return services;
  }

  const db = createDatabaseClientConfig();
  const shouldUseDatabase =
    db.connectionString.trim().length > 0 && isDatabaseAvailable(db.connectionString);
  const activityStore = shouldUseDatabase
    ? new PostgresImmutableActivityLogStore(db.connectionString)
    : new InMemoryImmutableActivityLogStore();
  const sendingIdentityStore = shouldUseDatabase
    ? new PostgresSendingIdentityStore(db.connectionString)
    : new InMemorySendingIdentityStore();
  const threadStore = shouldUseDatabase
    ? new PostgresEmailThreadReferenceStore(db.connectionString)
    : new InMemoryEmailThreadReferenceStore();
  const communicationAttemptStore = shouldUseDatabase
    ? new PostgresCommunicationAttemptStore(db.connectionString)
    : undefined;
  const gmailOauthStore = shouldUseDatabase
    ? new PostgresGmailOauthConnectionStore(db.connectionString)
    : undefined;

  const accessTokenProvider: GmailAccessTokenProvider = {
    getAccessToken(input) {
      return services!.gmailConnectionService.getAccessToken(input);
    },
  };
  const providerRegistry = createDefaultCommunicationProviderRegistry({
    gmailAdapter: new GmailApiAdapter({
      accessTokenProvider,
    }),
  });
  const emailOutboundService = new OutboundEmailWorkflowService({
    activityStore,
    sendingIdentityStore,
    threadStore,
    ...(communicationAttemptStore ? { communicationAttemptStore } : {}),
    providerRegistry,
    idGenerator: () => randomUUID(),
  });
  const gmailConnectionService = new GmailConnectionService(emailOutboundService, {
    ...(gmailOauthStore ? { connectionStore: gmailOauthStore } : {}),
  });

  services = {
    emailOutboundService,
    gmailConnectionService,
  };

  return services;
}

function readHeaderValue(message: GmailMessageDetail, name: string) {
  return message.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function extractEmailAddress(headerValue?: string) {
  if (!headerValue) {
    return undefined;
  }
  const match = /<([^>]+)>/.exec(headerValue);
  return (match?.[1] ?? headerValue)
    .split(",")[0]
    ?.trim()
    .replace(/^"+|"+$/g, "");
}

function extractDisplayName(headerValue?: string) {
  if (!headerValue) {
    return undefined;
  }
  const match = headerValue.match(/^(.*?)(?:<[^>]+>)?$/)?.[1]?.trim();
  if (!match) {
    return undefined;
  }
  const cleaned = match.replace(/^"+|"+$/g, "").trim();
  return cleaned.length > 0 && cleaned !== headerValue ? cleaned : undefined;
}

function extractGmailBodyText(payload?: GmailMessagePayload): string | undefined {
  if (!payload) {
    return undefined;
  }

  const plainTextParts = collectGmailBodyParts(payload, "text/plain");
  const htmlParts = collectGmailBodyParts(payload, "text/html");
  const decoded =
    plainTextParts.map(decodeGmailBodyPart).find((value) => value.trim().length > 0) ??
    htmlParts
      .map(decodeGmailBodyPart)
      .map(stripHtmlForEmailPreview)
      .find((value) => value.trim().length > 0);

  return decoded?.trim();
}

function collectGmailBodyParts(payload: GmailMessagePayload, mimeType: string): GmailMessagePayload[] {
  const matches: GmailMessagePayload[] = [];
  if (payload.mimeType?.toLowerCase() === mimeType && payload.body?.data) {
    matches.push(payload);
  }
  for (const part of payload.parts ?? []) {
    matches.push(...collectGmailBodyParts(part, mimeType));
  }
  return matches;
}

function decodeGmailBodyPart(payload: GmailMessagePayload): string {
  const data = payload.body?.data;
  if (!data) {
    return "";
  }

  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtmlForEmailPreview(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

function compareInboxMessagesDesc(left: GmailInboxMessage, right: GmailInboxMessage) {
  const leftTime = left.receivedAt ? Date.parse(left.receivedAt) : 0;
  const rightTime = right.receivedAt ? Date.parse(right.receivedAt) : 0;
  return rightTime - leftTime;
}
