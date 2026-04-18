import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryImmutableActivityLogStore } from "@o2c/audit";
import { GmailConnectionService } from "./bootstrap/email-integration-service.js";
import {
  createDefaultCommunicationProviderRegistry,
  InMemoryEmailThreadReferenceStore,
  InMemorySendingIdentityStore,
  OutboundEmailWorkflowService,
} from "@o2c/workflows";

process.env.NODE_ENV = "test";
describe("gmail inbox service", () => {
  it("lists inbox messages and thread detail for a connected mailbox", async () => {
    const emailService = new OutboundEmailWorkflowService({
      activityStore: new InMemoryImmutableActivityLogStore(),
      sendingIdentityStore: new InMemorySendingIdentityStore(),
      threadStore: new InMemoryEmailThreadReferenceStore(),
      providerRegistry: createDefaultCommunicationProviderRegistry(),
    });

    const gmailService = new GmailConnectionService(emailService, {
      fetchImpl: async (input) => {
        if (input === "https://oauth2.googleapis.com/token") {
          return jsonResponse({
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
            scope: [
              "openid",
              "email",
              "profile",
              "https://www.googleapis.com/auth/gmail.send",
              "https://www.googleapis.com/auth/gmail.compose",
              "https://www.googleapis.com/auth/gmail.readonly",
            ].join(" "),
          });
        }

        if (input === "https://openidconnect.googleapis.com/v1/userinfo") {
          return jsonResponse({
            email: "collector@example.com",
            name: "Yield Collector",
          });
        }

        if (input === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return jsonResponse({
            emailAddress: "collector@example.com",
          });
        }

        if (
          input ===
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=20"
        ) {
          return jsonResponse({
            resultSizeEstimate: 2,
            messages: [
              { id: "msg_2", threadId: "thread_1" },
              { id: "msg_1", threadId: "thread_1" },
            ],
          });
        }

        if (
          input ===
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_1?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject"
        ) {
          return jsonResponse({
            id: "msg_1",
            threadId: "thread_1",
            labelIds: ["INBOX", "UNREAD"],
            internalDate: String(Date.parse("2026-04-06T01:00:00.000Z")),
            snippet: "Can you resend the SOA?",
            payload: {
              headers: [
                { name: "From", value: "AP Team <ap@example.com>" },
                { name: "To", value: "Yield Collector <collector@example.com>" },
                { name: "Subject", value: "Re: Invoice follow-up" },
              ],
            },
          });
        }

        if (
          input ===
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_2?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject"
        ) {
          return jsonResponse({
            id: "msg_2",
            threadId: "thread_1",
            labelIds: ["INBOX"],
            internalDate: String(Date.parse("2026-04-06T02:00:00.000Z")),
            snippet: "We will settle this on Friday.",
            payload: {
              headers: [
                { name: "From", value: "Treasury <treasury@example.com>" },
                { name: "To", value: "Yield Collector <collector@example.com>" },
                { name: "Subject", value: "Re: Invoice follow-up" },
              ],
            },
          });
        }

        if (
          input ===
          "https://gmail.googleapis.com/gmail/v1/users/me/threads/thread_1?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject"
        ) {
          return jsonResponse({
            messages: [
              {
                id: "msg_2",
                threadId: "thread_1",
                labelIds: ["INBOX"],
                internalDate: String(Date.parse("2026-04-06T02:00:00.000Z")),
                snippet: "We will settle this on Friday.",
                payload: {
                  headers: [
                    { name: "From", value: "Treasury <treasury@example.com>" },
                    { name: "To", value: "Yield Collector <collector@example.com>" },
                    { name: "Subject", value: "Re: Invoice follow-up" },
                  ],
                },
              },
              {
                id: "msg_1",
                threadId: "thread_1",
                labelIds: ["INBOX", "UNREAD"],
                internalDate: String(Date.parse("2026-04-06T01:00:00.000Z")),
                snippet: "Can you resend the SOA?",
                payload: {
                  headers: [
                    { name: "From", value: "AP Team <ap@example.com>" },
                    { name: "To", value: "Yield Collector <collector@example.com>" },
                    { name: "Subject", value: "Re: Invoice follow-up" },
                  ],
                },
              },
            ],
          });
        }

        throw new Error(`Unhandled fetch call: ${input}`);
      },
    });

    const connectedIdentity = emailService.connectSendingIdentity({
      id: randomUUID(),
      provider: "gmail",
      authMode: "oauth2",
      senderEmail: "collector@example.com",
      displayName: "Yield Collector",
      isDefault: true,
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      connectionStatus: "connected",
      permissionStatus: "granted",
      healthState: "healthy",
    });
    (gmailService as unknown as {
      connections: Map<string, {
        senderIdentityId: string;
        senderEmail: string;
        accessToken: string;
        refreshToken?: string;
        accessTokenExpiresAt: string;
        scopes: string[];
        displayName?: string;
        connectedAt: string;
        updatedAt: string;
      }>;
    }).connections.set(connectedIdentity.id, {
      senderIdentityId: connectedIdentity.id,
      senderEmail: connectedIdentity.senderEmail,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      scopes: connectedIdentity.scopes,
      displayName: connectedIdentity.displayName,
      connectedAt: "2026-04-06T00:00:00.000Z",
      updatedAt: "2026-04-06T00:00:00.000Z",
    });

    const inbox = await gmailService.listInboxMessages();
    expect(inbox.senderIdentity.senderEmail).toBe("collector@example.com");
    expect(inbox.messages).toHaveLength(2);
    expect(inbox.messages[0]?.fromEmail).toBe("treasury@example.com");
    expect(inbox.messages[1]?.unread).toBe(true);

    const thread = await gmailService.getInboxThread({
      providerThreadId: "thread_1",
    });
    expect(thread.thread.providerThreadId).toBe("thread_1");
    expect(thread.thread.messages).toHaveLength(2);
    expect(thread.thread.participants).toContain("collector@example.com");
    expect(thread.thread.participants).toContain("ap@example.com");
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  };
}
