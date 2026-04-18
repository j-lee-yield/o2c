import { createActivityLogDomainHelpers, type ImmutableActivityLogStore } from "@o2c/audit";
import {
  type LearningEvent,
  ApprovalRequestNotFoundError,
  ApprovalRequestService,
  buildApprovalQueue,
  type ApprovalQueueItem,
  type ApprovalRequest,
  type ApprovalRequestRepository,
} from "@o2c/domain";
import {
  assertPermission,
  hasPermission,
  type Principal,
} from "@o2c/auth";
import {
  WorkflowLearningEventFactory,
  type LearningEventSink,
  persistLearningEvents,
} from "./learning-events.js";

export interface ApprovalQueueWorkflowDependencies {
  repository: ApprovalRequestRepository;
  activityStore: ImmutableActivityLogStore;
  learningEventSink?: LearningEventSink;
  now?: () => string;
  idGenerator?: (prefix: string) => string;
}

export interface ApprovalFlowHooks {
  onSubmitted?: (approval: ApprovalRequest) => void | Promise<void>;
  onEdited?: (params: { before: ApprovalRequest; after: ApprovalRequest }) => void | Promise<void>;
  onApproved?: (approval: ApprovalRequest) => void | Promise<void>;
  onRejected?: (approval: ApprovalRequest) => void | Promise<void>;
}

export class InMemoryApprovalRequestRepository implements ApprovalRequestRepository {
  private readonly records = new Map<string, ApprovalRequest>();

  async save(request: ApprovalRequest): Promise<void> {
    this.records.set(request.id, structuredClone(request));
  }

  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const request = this.records.get(approvalId);
    return request ? structuredClone(request) : undefined;
  }

  async list(): Promise<ApprovalRequest[]> {
    return [...this.records.values()].map((request) => structuredClone(request));
  }
}

export class ApprovalQueueWorkflowService {
  private readonly now: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly approvalService: ApprovalRequestService;
  private readonly learningEvents = new WorkflowLearningEventFactory();

  constructor(private readonly deps: ApprovalQueueWorkflowDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? ((prefix) => `${prefix}_${Date.now()}`);
    this.approvalService = new ApprovalRequestService({
      audit: createActivityLogDomainHelpers({
        store: deps.activityStore,
        now: this.now,
        idGenerator: () => this.idGenerator("activity"),
      }),
      now: this.now,
      idGenerator: () => this.idGenerator("approval"),
    });
  }

  async createAndSubmit(
    principal: Principal,
    input: {
      requestType: string;
      payload: Record<string, unknown>;
      assigneeRole?: ApprovalRequest["assigneeRole"];
      currentStep?: string;
      policyContext?: Record<string, unknown>;
    },
    hooks: ApprovalFlowHooks = {}
  ) {
    const created = this.approvalService.create(principal, {
      requestType: input.requestType,
      payload: input.payload,
      ...(input.assigneeRole ? { assigneeRole: input.assigneeRole } : {}),
      ...(input.currentStep ? { currentStep: input.currentStep } : {}),
      ...(input.policyContext ? { policyContext: input.policyContext } : {}),
    });
    const submitted = this.approvalService.submit(principal, created);
    await this.deps.repository.save(submitted);
    await persistLearningEvents(
      this.deps.learningEventSink,
      this.createApprovalLearningEvents(submitted, "approval_requested"),
    );
    await hooks.onSubmitted?.(submitted);
    return submitted;
  }

  async listQueue(principal: Principal): Promise<ApprovalQueueItem[]> {
    const approvals = await this.deps.repository.list();
    const visible = approvals.filter((approval) => canReadApproval(principal, approval));
    return buildApprovalQueue(visible);
  }

  async getRequest(principal: Principal, approvalId: string): Promise<ApprovalRequest> {
    const approval = await this.loadApproval(approvalId);
    assertApprovalVisible(principal, approval);
    return approval;
  }

  async editRequest(
    principal: Principal,
    input: {
      approvalId: string;
      payload: Record<string, unknown>;
      policyContext?: Record<string, unknown>;
      currentStep?: string;
      resubmit?: boolean;
    },
    hooks: ApprovalFlowHooks = {}
  ) {
    const approval = await this.loadApproval(input.approvalId);
    assertApprovalVisible(principal, approval);
    const edited = this.approvalService.edit(principal, approval, {
      payload: input.payload,
      ...(input.policyContext ? { policyContext: input.policyContext } : {}),
      ...(input.currentStep ? { currentStep: input.currentStep } : {}),
    });
    const finalApproval =
      input.resubmit === true ? this.approvalService.submit(principal, edited) : edited;
    await this.deps.repository.save(finalApproval);
    await hooks.onEdited?.({ before: approval, after: finalApproval });
    if (input.resubmit) {
      await hooks.onSubmitted?.(finalApproval);
    }
    return finalApproval;
  }

  async approve(
    principal: Principal,
    approvalId: string,
    hooks: ApprovalFlowHooks = {}
  ) {
    const approval = await this.loadApproval(approvalId);
    assertApprovalVisible(principal, approval);
    const approved = this.approvalService.decide(principal, approval, "approved");
    await this.deps.repository.save(approved);
    await persistLearningEvents(
      this.deps.learningEventSink,
      this.createApprovalLearningEvents(approved, "approval_approved"),
    );
    await hooks.onApproved?.(approved);
    return approved;
  }

  async reject(
    principal: Principal,
    approvalId: string,
    hooks: ApprovalFlowHooks = {}
  ) {
    const approval = await this.loadApproval(approvalId);
    assertApprovalVisible(principal, approval);
    const rejected = this.approvalService.decide(principal, approval, "rejected");
    await this.deps.repository.save(rejected);
    await persistLearningEvents(
      this.deps.learningEventSink,
      this.createApprovalLearningEvents(rejected, "approval_rejected"),
    );
    await hooks.onRejected?.(rejected);
    return rejected;
  }

  private async loadApproval(approvalId: string) {
    const approval = await this.deps.repository.get(approvalId);
    if (!approval) {
      throw new ApprovalRequestNotFoundError(approvalId);
    }
    return approval;
  }

  private createApprovalLearningEvents(
    approval: ApprovalRequest,
    eventType: "approval_requested" | "approval_approved" | "approval_rejected",
  ): LearningEvent[] {
    return [
      this.learningEvents.buildApprovalEvent({
        id: `${approval.id}:learning:${eventType}`,
        eventType,
        approval,
        occurredAt: approval.updatedAt,
      }),
    ];
  }
}

function canReadApproval(principal: Principal, approval: ApprovalRequest) {
  if (hasPermission(principal, "approval.request.read")) {
    return true;
  }

  return approval.requestedBy === principal.id;
}

function assertApprovalVisible(principal: Principal, approval: ApprovalRequest) {
  if (canReadApproval(principal, approval)) {
    return;
  }

  assertPermission(principal, "approval.request.read.own", { approvalId: approval.id });
  if (approval.requestedBy !== principal.id) {
    assertPermission(principal, "approval.request.read", { approvalId: approval.id });
  }
}
