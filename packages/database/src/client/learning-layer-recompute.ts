import {
  DeterministicBehaviorProfileUpdateService,
  type BehaviorProfileScope,
  type ContactBehaviorProfile,
  type LearningLayerPolicy,
} from "@o2c/domain";
import { queryJsonRows, quoteLiteral } from "./postgres.js";
import { PostgresLearningLayerRuntimeStore } from "./learning-layer-runtime-store.js";

export type LearningLayerRecomputeInput = {
  tenantId: string;
  billingAccountId?: string;
  contactId?: string;
  parentAccountId?: string;
  branchId?: string;
  computedAt?: string;
  policy?: Partial<LearningLayerPolicy>;
  actorId?: string;
}

export type LearningLayerRecomputeResult = {
  processedAccountProfiles: number;
  processedContactProfiles: number;
  targetBillingAccountId?: string;
  targetContactId?: string;
  computedAt: string;
}

type AccountRecomputeTarget = {
  scope: BehaviorProfileScope;
  scopeId: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
}

type ContactRecomputeTarget = {
  contactId: string;
  parentAccountId: string;
  billingAccountId?: string;
  branchId?: string;
}

type ContactVerificationRow = {
  emailVerified: boolean;
  smsNumberVerified: boolean;
  phoneNumberVerified: boolean;
}

export class PostgresLearningLayerRecomputeService {
  private readonly profiles = new DeterministicBehaviorProfileUpdateService();
  private readonly runtimeStore: PostgresLearningLayerRuntimeStore;

  constructor(private readonly databaseUrl: string) {
    this.runtimeStore = new PostgresLearningLayerRuntimeStore(databaseUrl);
  }

  recompute(input: LearningLayerRecomputeInput): LearningLayerRecomputeResult {
    const computedAt = input.computedAt ?? new Date().toISOString();
    const accountTargets = this.loadAccountTargets(input);
    const contactTargets = this.loadContactTargets(input);

    for (const target of accountTargets) {
      const history = this.runtimeStore.loadHistory({
        tenantId: input.tenantId,
        targetType: "account_behavior_profile",
        targetId: target.scopeId,
        parentAccountId: target.parentAccountId,
        ...(target.billingAccountId ? { billingAccountId: target.billingAccountId } : {}),
        ...(target.branchId ? { branchId: target.branchId } : {}),
      });
      const profile = this.profiles.updateAccountProfile({
        profileId: buildAccountProfileId(target),
        scope: target.scope,
        scopeId: target.scopeId,
        parentAccountId: target.parentAccountId,
        ...(target.billingAccountId ? { billingAccountId: target.billingAccountId } : {}),
        ...(target.branchId ? { branchId: target.branchId } : {}),
        events: history.events,
        feedback: history.feedback,
        computedAt,
        ...(input.policy ? { policy: input.policy } : {}),
        actorId: input.actorId ?? "learning_profile_recompute_job",
        actorRole: "system",
        tenantId: input.tenantId,
      });
      this.runtimeStore.saveAccountBehaviorProfile(profile);
    }

    for (const target of contactTargets) {
      const history = this.runtimeStore.loadHistory({
        tenantId: input.tenantId,
        targetType: "contact_behavior_profile",
        targetId: target.contactId,
        contactId: target.contactId,
        parentAccountId: target.parentAccountId,
        ...(target.billingAccountId ? { billingAccountId: target.billingAccountId } : {}),
        ...(target.branchId ? { branchId: target.branchId } : {}),
      });
      const verificationSnapshot = this.loadContactVerificationSnapshot(
        input.tenantId,
        target.contactId,
      );
      const profile = this.profiles.updateContactProfile({
        profileId: buildContactProfileId(target.contactId),
        contactId: target.contactId,
        parentAccountId: target.parentAccountId,
        ...(target.billingAccountId ? { billingAccountId: target.billingAccountId } : {}),
        ...(target.branchId ? { branchId: target.branchId } : {}),
        verificationSnapshot,
        events: history.events,
        feedback: history.feedback,
        computedAt,
        ...(input.policy ? { policy: input.policy } : {}),
        actorId: input.actorId ?? "learning_profile_recompute_job",
        actorRole: "system",
        tenantId: input.tenantId,
      });
      this.runtimeStore.saveContactBehaviorProfile(profile as ContactBehaviorProfile);
    }

    return {
      processedAccountProfiles: accountTargets.length,
      processedContactProfiles: contactTargets.length,
      ...(input.billingAccountId ? { targetBillingAccountId: input.billingAccountId } : {}),
      ...(input.contactId ? { targetContactId: input.contactId } : {}),
      computedAt,
    };
  }

  private loadAccountTargets(input: LearningLayerRecomputeInput): AccountRecomputeTarget[] {
    return queryJsonRows<AccountRecomputeTarget>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT DISTINCT
            scope,
            scope_id AS "scopeId",
            parent_account_id::text AS "parentAccountId",
            billing_account_id::text AS "billingAccountId",
            branch_id::text AS "branchId"
          FROM (
            SELECT
              'parent_account' AS scope,
              learning_event.parent_account_id::text AS scope_id,
              learning_event.parent_account_id,
              NULL::uuid AS billing_account_id,
              NULL::uuid AS branch_id
            FROM learning_event
            WHERE learning_event.tenant_id = '${quoteLiteral(input.tenantId)}'
              AND learning_event.deleted_at IS NULL
              ${buildLearningTargetFilterSql(input)}
            UNION
            SELECT
              'billing_account' AS scope,
              learning_event.billing_account_id::text AS scope_id,
              learning_event.parent_account_id,
              learning_event.billing_account_id,
              NULL::uuid AS branch_id
            FROM learning_event
            WHERE learning_event.tenant_id = '${quoteLiteral(input.tenantId)}'
              AND learning_event.deleted_at IS NULL
              AND learning_event.billing_account_id IS NOT NULL
              ${buildLearningTargetFilterSql(input)}
            UNION
            SELECT
              'branch' AS scope,
              learning_event.branch_id::text AS scope_id,
              learning_event.parent_account_id,
              learning_event.billing_account_id,
              learning_event.branch_id
            FROM learning_event
            WHERE learning_event.tenant_id = '${quoteLiteral(input.tenantId)}'
              AND learning_event.deleted_at IS NULL
              AND learning_event.branch_id IS NOT NULL
              ${buildLearningTargetFilterSql(input)}
          ) scoped
          WHERE scope_id IS NOT NULL
          ORDER BY scope, scope_id
        ) q
      `,
    );
  }

  private loadContactTargets(input: LearningLayerRecomputeInput): ContactRecomputeTarget[] {
    return queryJsonRows<ContactRecomputeTarget>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT DISTINCT
            learning_event.contact_id::text AS "contactId",
            learning_event.parent_account_id::text AS "parentAccountId",
            learning_event.billing_account_id::text AS "billingAccountId",
            learning_event.branch_id::text AS "branchId"
          FROM learning_event
          WHERE learning_event.tenant_id = '${quoteLiteral(input.tenantId)}'
            AND learning_event.deleted_at IS NULL
            AND learning_event.contact_id IS NOT NULL
            ${buildLearningTargetFilterSql(input)}
          ORDER BY "contactId"
        ) q
      `,
    );
  }

  private loadContactVerificationSnapshot(
    tenantId: string,
    contactId: string,
  ): ContactBehaviorProfile["verificationSnapshot"] {
    const [row] = queryJsonRows<ContactVerificationRow>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            (contact.email IS NOT NULL AND contact.is_verified) AS "emailVerified",
            (contact.phone IS NOT NULL AND contact.is_verified) AS "smsNumberVerified",
            (contact.phone IS NOT NULL AND contact.is_verified) AS "phoneNumberVerified"
          FROM contact
          WHERE contact.tenant_id = '${quoteLiteral(tenantId)}'
            AND contact.id = '${quoteLiteral(contactId)}'::uuid
            AND contact.deleted_at IS NULL
          LIMIT 1
        ) q
      `,
    );

    return {
      emailVerified: row?.emailVerified ?? false,
      smsNumberVerified: row?.smsNumberVerified ?? false,
      phoneNumberVerified: row?.phoneNumberVerified ?? false,
    };
  }
}

function buildLearningTargetFilterSql(input: LearningLayerRecomputeInput): string {
  const predicates = [
    input.billingAccountId
      ? `AND learning_event.billing_account_id = '${quoteLiteral(input.billingAccountId)}'::uuid`
      : "",
    input.contactId
      ? `AND learning_event.contact_id = '${quoteLiteral(input.contactId)}'::uuid`
      : "",
    input.parentAccountId
      ? `AND learning_event.parent_account_id = '${quoteLiteral(input.parentAccountId)}'::uuid`
      : "",
    input.branchId
      ? `AND learning_event.branch_id = '${quoteLiteral(input.branchId)}'::uuid`
      : "",
  ].filter((predicate) => predicate.length > 0);

  return predicates.join("\n");
}

function buildAccountProfileId(target: AccountRecomputeTarget): string {
  return `recomputed_${target.scope}_profile_${target.scopeId}`;
}

function buildContactProfileId(contactId: string): string {
  return `recomputed_contact_profile_${contactId}`;
}
