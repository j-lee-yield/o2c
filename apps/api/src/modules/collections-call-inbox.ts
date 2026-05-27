import { loadEnv } from "@o2c/config";
import type { CallInboxDirection, CallInboxFilters, CallInboxListItem, CallInboxStatus } from "@o2c/contracts";
import type { Principal, Role } from "@o2c/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getCallInboxService } from "../bootstrap/call-inbox-service.js";

const callInboxDirectionSchema = z.enum(["inbound", "outbound", "unknown"]);
const callInboxStatusSchema = z.enum(["processing", "completed", "needs_review", "failed", "archived"]);

const callInboxQuerySchema = z.object({
  direction: callInboxDirectionSchema.optional(),
  status: callInboxStatusSchema.optional(),
  voicemail: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  customer: z.string().min(1).optional(),
  classification: z.string().min(1).optional(),
  classifications: z.string().min(1).optional(),
  workflow: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
});

const callInboxParamsSchema = z.object({
  callRecordId: z.string().min(1),
});

export const registerCollectionsCallInboxRoutes = (app: FastifyInstance): void => {
  app.get("/v1/collections/call-inbox", async (request, reply) => {
    try {
      parsePrincipal(request);
      const filters = parseCallInboxFilters(request);
      const service = getCallInboxService();
      return reply.send(await service.listCalls(filters));
    } catch (error) {
      return replyFromCallInboxError(reply, error);
    }
  });

  app.get("/v1/collections/call-inbox/export", async (request, reply) => {
    try {
      parsePrincipal(request);
      const filters = parseCallInboxFilters(request);
      const service = getCallInboxService();
      const result = await service.listCalls(filters);
      const csv = toCallInboxCsv(result.items);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="yield-aros-call-inbox.csv"`)
        .send(csv);
    } catch (error) {
      return replyFromCallInboxError(reply, error);
    }
  });

  app.get("/v1/collections/call-inbox/:callRecordId", async (request, reply) => {
    try {
      parsePrincipal(request);
      const params = callInboxParamsSchema.parse(request.params);
      const service = getCallInboxService();
      const call = await service.getCall(params.callRecordId);
      if (!call) {
        return reply.status(404).send({ message: "Call inbox record not found." });
      }
      return reply.send({
        generatedAt: new Date().toISOString(),
        call,
      });
    } catch (error) {
      return replyFromCallInboxError(reply, error);
    }
  });
};

function parseCallInboxFilters(request: FastifyRequest): CallInboxFilters {
  const env = loadEnv();
  const query = callInboxQuerySchema.parse(request.query);
  const dateRange = query.date ? parseDateChip(query.date) : {};

  return {
    ...(query.direction ? { direction: query.direction as CallInboxDirection } : {}),
    ...(query.status ? { status: query.status as CallInboxStatus } : {}),
    ...(query.voicemail !== undefined ? { voicemail: query.voicemail === true || query.voicemail === "true" } : {}),
    ...(query.customer ? { customer: query.customer } : {}),
    ...(query.classification || query.classifications
      ? { classification: query.classification ?? query.classifications }
      : {}),
    ...(query.workflow ? { workflow: query.workflow } : {}),
    ...(query.dateFrom ?? dateRange.dateFrom ? { dateFrom: query.dateFrom ?? dateRange.dateFrom } : {}),
    ...(query.dateTo ?? dateRange.dateTo ? { dateTo: query.dateTo ?? dateRange.dateTo } : {}),
    tenantId: query.tenantId ?? env.DEFAULT_TENANT_SLUG,
  } as CallInboxFilters & { tenantId: string };
}

function parseDateChip(value: string): Pick<CallInboxFilters, "dateFrom" | "dateTo"> {
  const normalized = value.trim().toLowerCase();
  const today = new Date();
  if (normalized === "today") {
    const todayKey = toManilaDateInput(today);
    return {
      dateFrom: todayKey,
      dateTo: todayKey,
    };
  }
  if (normalized === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = toManilaDateInput(yesterday);
    return {
      dateFrom: yesterdayKey,
      dateTo: yesterdayKey,
    };
  }
  return { dateFrom: value, dateTo: value };
}

function toManilaDateInput(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toCallInboxCsv(items: CallInboxListItem[]): string {
  const rows = [
    [
      "Date",
      "Customer",
      "Phone",
      "Direction",
      "Duration Seconds",
      "Voicemail",
      "Sentiment",
      "Classifications",
      "Workflow",
      "Invoices",
      "Open Tasks",
      "Approver",
      "Status",
      "Provider Call ID",
    ],
    ...items.map((item) => [
      item.startedAt,
      item.customerName,
      item.customerPhone ?? "",
      item.direction,
      item.durationSeconds?.toString() ?? "",
      item.voicemail ? "yes" : "no",
      item.sentiment,
      item.classifications.join("; "),
      item.workflowName ?? "",
      item.invoiceNumbers.join("; "),
      item.openTasksCount.toString(),
      item.approverName ?? "",
      item.status,
      item.providerCallId,
    ]),
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, `""`)}"`;
}

function parsePrincipal(request: FastifyRequest): Principal {
  const principalId = request.headers["x-principal-id"];
  const id =
    typeof principalId === "string" && principalId.trim().length > 0
      ? principalId
      : "call_inbox_api";
  return { id, roles: parseRoles(request.headers["x-principal-roles"]) };
}

function parseRoles(header: string | string[] | undefined): Role[] {
  const rawValue =
    typeof header === "string" ? header : Array.isArray(header) ? header.join(",") : "";
  const roles = rawValue
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role =>
      role === "ar_collector" ||
      role === "ar_manager" ||
      role === "controller" ||
      role === "admin",
    );
  return roles.length > 0 ? roles : ["ar_collector"];
}

function replyFromCallInboxError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      message: "Invalid call inbox request.",
      issues: error.issues,
    });
  }

  throw error;
}
