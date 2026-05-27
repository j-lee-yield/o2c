import { randomUUID } from "node:crypto";
import { loadEnv } from "@o2c/config";
import {
  executeSqlCommand,
  isDatabaseAvailable,
  jsonLiteral,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";
import type { Task } from "@o2c/domain";
import { buildDemoSeedBundle } from "@o2c/seed";
import {
  InMemoryTaskRepository,
  TaskWorkflowService,
  type TaskRepository,
} from "@o2c/workflows";

let seeded = false;
let taskService: TaskWorkflowService | undefined;

export async function getTaskService() {
  if (!taskService) {
    const env = loadEnv();
    taskService = new TaskWorkflowService({
      repository: createTaskRepository(env.DATABASE_URL, env.DEFAULT_TENANT_SLUG),
      now: () => new Date().toISOString(),
      idGenerator: () => randomUUID(),
    });
  }

  if (!seeded) {
    seeded = true;
    const env = loadEnv();
    if (env.ENABLE_DEMO_DATA === true || env.NODE_ENV === "test" || process.env.VITEST === "true") {
      await taskService.seed(buildDemoSeedBundle().tasks);
    }
  }

  return taskService;
}

function createTaskRepository(databaseUrl: string, tenantId: string): TaskRepository {
  if (
    process.env.VITEST === "true" ||
    databaseUrl.trim().length === 0 ||
    !isDatabaseAvailable(databaseUrl)
  ) {
    return new InMemoryTaskRepository();
  }

  return new PostgresTaskRepository(databaseUrl, tenantId);
}

class PostgresTaskRepository implements TaskRepository {
  private ensured = false;

  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async save(task: Task): Promise<void> {
    this.ensureTable();
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO task_record (
          id,
          tenant_id,
          version,
          created_at,
          updated_at,
          created_by_actor_id,
          created_by_actor_role,
          updated_by_actor_id,
          updated_by_actor_role,
          title,
          description,
          kind,
          task_type,
          status,
          origin,
          surfaces,
          customer_profile_id,
          billing_account_id,
          contact_id,
          branch_id,
          owner_id,
          owner_role,
          owner_team,
          source,
          call_id,
          plan_id,
          linked_invoice_ids,
          priority,
          due_at,
          completed_at,
          archived_at,
          closed_at,
          dismissed_at,
          deleted_at,
          summary,
          recommended_next_action,
          transcript_snippet,
          requires_human_review,
          source_links,
          audit_trail,
          metadata
        )
        VALUES (
          '${quoteLiteral(task.id)}',
          '${quoteLiteral(this.tenantId)}',
          ${task.version ?? 1},
          '${quoteLiteral(task.createdAt)}'::timestamptz,
          '${quoteLiteral(task.updatedAt)}'::timestamptz,
          ${sqlText(task.createdByActorId)},
          ${sqlText(task.createdByActorRole)},
          ${sqlText(task.updatedByActorId)},
          ${sqlText(task.updatedByActorRole)},
          '${quoteLiteral(task.title)}',
          ${sqlText(task.description)},
          '${quoteLiteral(task.kind)}',
          '${quoteLiteral(task.taskType)}',
          '${quoteLiteral(task.status)}',
          '${quoteLiteral(task.origin)}',
          '${jsonLiteral(task.surfaces)}'::jsonb,
          ${sqlText(task.customerProfileId)},
          ${sqlText(task.billingAccountId)},
          ${sqlText(task.contactId)},
          ${sqlText(task.branchId)},
          ${sqlText(task.ownerId)},
          ${sqlText(task.ownerRole)},
          ${sqlText(task.ownerTeam)},
          ${sqlText(task.source)},
          ${sqlText(task.callId)},
          ${sqlText(task.planId)},
          '${jsonLiteral(task.linkedInvoiceIds ?? [])}'::jsonb,
          ${sqlText(task.priority)},
          ${sqlTimestamp(task.dueAt)},
          ${sqlTimestamp(task.completedAt)},
          ${sqlTimestamp(task.archivedAt)},
          ${sqlTimestamp(task.closedAt)},
          ${sqlTimestamp(task.dismissedAt)},
          ${sqlTimestamp(task.deletedAt)},
          ${sqlText(task.summary)},
          ${sqlText(task.recommendedNextAction)},
          ${sqlText(task.transcriptSnippet)},
          ${task.requiresHumanReview === undefined ? "NULL" : task.requiresHumanReview ? "TRUE" : "FALSE"},
          '${jsonLiteral(task.sourceLinks)}'::jsonb,
          '${jsonLiteral(task.auditTrail)}'::jsonb,
          '${jsonLiteral(task.metadata)}'::jsonb
        )
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          updated_by_actor_id = EXCLUDED.updated_by_actor_id,
          updated_by_actor_role = EXCLUDED.updated_by_actor_role,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          kind = EXCLUDED.kind,
          task_type = EXCLUDED.task_type,
          status = EXCLUDED.status,
          origin = EXCLUDED.origin,
          surfaces = EXCLUDED.surfaces,
          customer_profile_id = EXCLUDED.customer_profile_id,
          billing_account_id = EXCLUDED.billing_account_id,
          contact_id = EXCLUDED.contact_id,
          branch_id = EXCLUDED.branch_id,
          owner_id = EXCLUDED.owner_id,
          owner_role = EXCLUDED.owner_role,
          owner_team = EXCLUDED.owner_team,
          source = EXCLUDED.source,
          call_id = EXCLUDED.call_id,
          plan_id = EXCLUDED.plan_id,
          linked_invoice_ids = EXCLUDED.linked_invoice_ids,
          priority = EXCLUDED.priority,
          due_at = EXCLUDED.due_at,
          completed_at = EXCLUDED.completed_at,
          archived_at = EXCLUDED.archived_at,
          closed_at = EXCLUDED.closed_at,
          dismissed_at = EXCLUDED.dismissed_at,
          deleted_at = EXCLUDED.deleted_at,
          summary = EXCLUDED.summary,
          recommended_next_action = EXCLUDED.recommended_next_action,
          transcript_snippet = EXCLUDED.transcript_snippet,
          requires_human_review = EXCLUDED.requires_human_review,
          source_links = EXCLUDED.source_links,
          audit_trail = EXCLUDED.audit_trail,
          metadata = EXCLUDED.metadata;
      `,
    );
  }

  async get(taskId: string): Promise<Task | undefined> {
    this.ensureTable();
    const [persisted] = this.queryPersistedTasks(`id = '${quoteLiteral(taskId)}'`);
    if (persisted) {
      return persisted;
    }

    const [recovered] = this.recoverCallInboxTasks(`task_ref->>'id' = '${quoteLiteral(taskId)}'`);
    return recovered;
  }

  async list(): Promise<Task[]> {
    this.ensureTable();
    const persisted = this.queryPersistedTasks();
    const persistedIds = new Set(persisted.map((task) => task.id));
    const recovered = this.recoverCallInboxTasks().filter((task) => !persistedIds.has(task.id));
    return [...persisted, ...recovered];
  }

  private ensureTable() {
    if (this.ensured) {
      return;
    }

    executeSqlCommand(this.databaseUrl, taskRecordTableSql);
    this.ensured = true;
  }

  private queryPersistedTasks(extraWhere?: string): Task[] {
    const where = [
      `tenant_id = '${quoteLiteral(this.tenantId)}'`,
      ...(extraWhere ? [extraWhere] : []),
    ].join(" AND ");
    const rows = queryJsonRows<TaskRecordRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            id,
            tenant_id AS "tenantId",
            version,
            created_at::text AS "createdAt",
            updated_at::text AS "updatedAt",
            created_by_actor_id AS "createdByActorId",
            created_by_actor_role AS "createdByActorRole",
            updated_by_actor_id AS "updatedByActorId",
            updated_by_actor_role AS "updatedByActorRole",
            title,
            description,
            kind,
            task_type AS "taskType",
            status,
            origin,
            surfaces,
            customer_profile_id AS "customerProfileId",
            billing_account_id AS "billingAccountId",
            contact_id AS "contactId",
            branch_id AS "branchId",
            owner_id AS "ownerId",
            owner_role AS "ownerRole",
            owner_team AS "ownerTeam",
            source,
            call_id AS "callId",
            plan_id AS "planId",
            linked_invoice_ids AS "linkedInvoiceIds",
            priority,
            due_at::text AS "dueAt",
            completed_at::text AS "completedAt",
            archived_at::text AS "archivedAt",
            closed_at::text AS "closedAt",
            dismissed_at::text AS "dismissedAt",
            deleted_at::text AS "deletedAt",
            summary,
            recommended_next_action AS "recommendedNextAction",
            transcript_snippet AS "transcriptSnippet",
            requires_human_review AS "requiresHumanReview",
            source_links AS "sourceLinks",
            audit_trail AS "auditTrail",
            metadata
          FROM task_record
          WHERE ${where}
        ) q;
      `,
    );

    return rows.map(taskFromRow);
  }

  private recoverCallInboxTasks(extraWhere?: string): Task[] {
    const where = [
      `call_record.tenant_id = '${quoteLiteral(this.tenantId)}'`,
      `call_record.deleted_at IS NULL`,
      ...(extraWhere ? [extraWhere] : []),
    ].join(" AND ");
    try {
      const rows = queryJsonRows<RecoveredCallTaskRow>(
        this.databaseUrl,
        `
          SELECT row_to_json(q)
          FROM (
            SELECT
              task_ref->>'id' AS id,
              COALESCE(NULLIF(task_ref->>'title', ''), 'Review post-call task') AS title,
              COALESCE(NULLIF(task_ref->>'status', ''), 'open') AS status,
              COALESCE(NULLIF(task_ref->>'taskType', ''), 'review_call') AS "taskType",
              task_ref->>'ownerTeam' AS "ownerTeam",
              task_ref->>'dueAt' AS "dueAt",
              call_record.id AS "callId",
              call_record.provider_call_id AS "providerCallId",
              call_record.billing_account_id AS "billingAccountId",
              call_record.contact_id AS "contactId",
              call_record.branch_id AS "branchId",
              call_record.customer_name AS "customerName",
              call_record.summary,
              call_record.invoice_refs AS "invoiceRefs",
              call_record.started_at::text AS "startedAt",
              call_record.updated_at::text AS "updatedAt"
            FROM call_inbox_record call_record
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(call_record.task_refs, '[]'::jsonb)) AS task_ref
            WHERE ${where}
          ) q;
        `,
      );

      return rows.map((row) => recoveredTaskFromCallInboxRow(row, this.tenantId));
    } catch {
      return [];
    }
  }
}

type TaskRecordRow = Task;

interface RecoveredCallTaskRow {
  id: string;
  title: string;
  status: string;
  taskType: string;
  ownerTeam?: string;
  dueAt?: string;
  callId: string;
  providerCallId: string;
  billingAccountId?: string;
  contactId?: string;
  branchId?: string;
  customerName: string;
  summary?: string;
  invoiceRefs?: Array<{ invoiceId?: string; invoiceNumber?: string }>;
  startedAt: string;
  updatedAt: string;
}

function taskFromRow(row: TaskRecordRow): Task {
  const task = {
    ...row,
    sourceLinks: row.sourceLinks ?? [],
    auditTrail: row.auditTrail ?? [],
    metadata: row.metadata ?? {},
  } as Record<string, unknown>;

  for (const [key, value] of Object.entries(task)) {
    if (value === null) {
      delete task[key];
    }
  }

  return task as unknown as Task;
}

function recoveredTaskFromCallInboxRow(row: RecoveredCallTaskRow, tenantId: string): Task {
  const invoiceRefs = Array.isArray(row.invoiceRefs) ? row.invoiceRefs : [];
  const linkedInvoiceIds = invoiceRefs
    .map((invoice) => invoice.invoiceId)
    .filter((invoiceId): invoiceId is string => Boolean(invoiceId));

  return {
    id: row.id,
    tenantId,
    version: 1,
    createdAt: row.updatedAt,
    updatedAt: row.updatedAt,
    createdByActorId: "retell_post_call_automation",
    createdByActorRole: "system",
    updatedByActorId: "retell_post_call_automation",
    updatedByActorRole: "system",
    title: row.title,
    kind: row.taskType,
    taskType: row.taskType,
    status: normalizeRecoveredTaskStatus(row.status),
    origin: "workflow_generated",
    surfaces: ["home", "collections", "customers"].filter(isTaskSurface),
    ...(row.billingAccountId ? { billingAccountId: row.billingAccountId } : {}),
    ...(row.contactId ? { contactId: row.contactId } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.ownerTeam ? { ownerTeam: row.ownerTeam } : {}),
    source: "retell_call_inbox",
    callId: row.providerCallId,
    ...(linkedInvoiceIds.length > 0 ? { linkedInvoiceIds } : {}),
    priority: row.taskType === "invoice_dispute_review" ? "high" : "medium",
    ...(row.dueAt ? { dueAt: row.dueAt } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    sourceLinks: [
      {
        label: "Call Inbox",
        objectType: "call_inbox_record",
        objectId: row.callId,
        href: `/collections?tab=call-inbox#call-detail-${row.callId}`,
        metadata: {
          providerCallId: row.providerCallId,
        },
      },
    ],
    auditTrail: [
      {
        occurredAt: row.updatedAt,
        action: "task.recovered_from_call_inbox",
        actorId: "retell_post_call_automation",
        actorRole: "system",
        summary: "Task recovered from persisted Call Inbox task references.",
      },
    ],
    metadata: {
      source: "retell_call_inbox",
      customerName: row.customerName,
      callInboxRecordId: row.callId,
      providerCallId: row.providerCallId,
      invoiceNumbers: invoiceRefs
        .map((invoice) => invoice.invoiceNumber)
        .filter((invoiceNumber): invoiceNumber is string => Boolean(invoiceNumber)),
    },
  };
}

function normalizeRecoveredTaskStatus(value: string): Task["status"] {
  return value === "completed" || value === "closed" || value === "dismissed" || value === "deleted"
    ? value
    : "open";
}

function isTaskSurface(value: string): value is Task["surfaces"][number] {
  return value === "home" || value === "customers" || value === "collections";
}

function sqlText(value: string | undefined): string {
  return value ? `'${quoteLiteral(value)}'` : "NULL";
}

function sqlTimestamp(value: string | undefined): string {
  return value ? `'${quoteLiteral(value)}'::timestamptz` : "NULL";
}

const taskRecordTableSql = `
  CREATE TABLE IF NOT EXISTS task_record (
    id text NOT NULL,
    tenant_id text NOT NULL DEFAULT 'default',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    created_by_actor_id text,
    created_by_actor_role text,
    updated_by_actor_id text,
    updated_by_actor_role text,
    title text NOT NULL,
    description text,
    kind text NOT NULL,
    task_type text NOT NULL,
    status text NOT NULL,
    origin text NOT NULL,
    surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
    customer_profile_id text,
    billing_account_id text,
    contact_id text,
    branch_id text,
    owner_id text,
    owner_role text,
    owner_team text,
    source text,
    call_id text,
    plan_id text,
    linked_invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    priority text,
    due_at timestamptz,
    completed_at timestamptz,
    archived_at timestamptz,
    closed_at timestamptz,
    dismissed_at timestamptz,
    deleted_at timestamptz,
    summary text,
    recommended_next_action text,
    transcript_snippet text,
    requires_human_review boolean,
    source_links jsonb NOT NULL DEFAULT '[]'::jsonb,
    audit_trail jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_task_record_tenant_status_due
    ON task_record (tenant_id, status, due_at, created_at);

  CREATE INDEX IF NOT EXISTS idx_task_record_billing_account
    ON task_record (tenant_id, billing_account_id, status);

  CREATE INDEX IF NOT EXISTS idx_task_record_customer_profile
    ON task_record (tenant_id, customer_profile_id, status);

  CREATE INDEX IF NOT EXISTS idx_task_record_call
    ON task_record (tenant_id, call_id);

  ALTER TABLE task_record
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

  ALTER TABLE task_record
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
`;

export function resetTaskServiceForTests() {
  seeded = false;
  taskService = undefined;
}
