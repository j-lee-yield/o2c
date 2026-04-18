import { createHash } from "node:crypto";
import {
  createDatabaseClientConfig,
  executeSqlCommand,
  isDatabaseAvailable,
  queryJsonRows,
  quoteLiteral,
} from "@o2c/database";

export interface StoredWithholdingComponent {
  withholdingComponentId: string;
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  withholdingType: "cwt_goods" | "cwt_services" | "cwt_special_goods" | "unknown";
  withholdingRateBps?: number;
  withholdingAmountMinor: number;
  evidenceStatus: "none" | "remittance_only" | "buyer_profile_only" | "form_2307_linked" | "operator_confirmed";
  birForm2307DocumentId?: string;
  recognizedForInvoiceClosure: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPaymentResidualAction {
  residualActionId: string;
  tenantId: string;
  paymentId: string;
  invoiceId?: string;
  residualType:
    | "writeoff"
    | "unapplied_cash"
    | "bank_charge_adjustment"
    | "customer_short_pay"
    | "overpayment_hold"
    | "withholding_under_review";
  amountMinor: number;
  reasonCode: string;
  requiresApproval: boolean;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

export interface StoredBuyerTaxProfile {
  buyerTaxProfileId: string;
  profileId: string;
  tenantId: string;
  isTopWithholdingAgent?: boolean;
  withholdingDefaultType: "none" | "goods" | "services" | "mixed" | "special_goods";
  defaultWithholdingRateBps?: number;
  requires2307ForClosure: boolean;
  historicalWithholdingBehaviorScore?: number;
  notes?: string;
  source: "supplier_set" | "learned" | "mixed";
}

export interface PaymentFinalityStore {
  replaceWithholdingComponents(paymentId: string, components: StoredWithholdingComponent[]): Promise<void>;
  replaceResidualActions(paymentId: string, actions: StoredPaymentResidualAction[]): Promise<void>;
  listWithholdingComponents(paymentId: string): Promise<StoredWithholdingComponent[]>;
  listResidualActions(paymentId: string): Promise<StoredPaymentResidualAction[]>;
}

export interface BuyerTaxProfileStore {
  get(profileId: string): Promise<StoredBuyerTaxProfile | undefined>;
  upsert(profile: StoredBuyerTaxProfile): Promise<StoredBuyerTaxProfile>;
  learnFromSettlement(input: {
    profileId: string;
    tenantId: string;
    withholdingType: StoredBuyerTaxProfile["withholdingDefaultType"];
    withholdingRateBps?: number;
    evidenceStatus: StoredWithholdingComponent["evidenceStatus"];
    notes?: string;
  }): Promise<StoredBuyerTaxProfile>;
}

class InMemoryPaymentFinalityStore implements PaymentFinalityStore {
  private readonly withholdingByPayment = new Map<string, StoredWithholdingComponent[]>();
  private readonly residualByPayment = new Map<string, StoredPaymentResidualAction[]>();

  async replaceWithholdingComponents(paymentId: string, components: StoredWithholdingComponent[]): Promise<void> {
    this.withholdingByPayment.set(paymentId, structuredClone(components));
  }

  async replaceResidualActions(paymentId: string, actions: StoredPaymentResidualAction[]): Promise<void> {
    this.residualByPayment.set(paymentId, structuredClone(actions));
  }

  async listWithholdingComponents(paymentId: string): Promise<StoredWithholdingComponent[]> {
    return structuredClone(this.withholdingByPayment.get(paymentId) ?? []);
  }

  async listResidualActions(paymentId: string): Promise<StoredPaymentResidualAction[]> {
    return structuredClone(this.residualByPayment.get(paymentId) ?? []);
  }
}

class InMemoryBuyerTaxProfileStore implements BuyerTaxProfileStore {
  private readonly profiles = new Map<string, StoredBuyerTaxProfile>();

  async get(profileId: string): Promise<StoredBuyerTaxProfile | undefined> {
    const profile = this.profiles.get(profileId);
    return profile ? structuredClone(profile) : undefined;
  }

  async upsert(profile: StoredBuyerTaxProfile): Promise<StoredBuyerTaxProfile> {
    this.profiles.set(profile.profileId, structuredClone(profile));
    return structuredClone(profile);
  }

  async learnFromSettlement(input: {
    profileId: string;
    tenantId: string;
    withholdingType: StoredBuyerTaxProfile["withholdingDefaultType"];
    withholdingRateBps?: number;
    evidenceStatus: StoredWithholdingComponent["evidenceStatus"];
    notes?: string;
  }): Promise<StoredBuyerTaxProfile> {
    const existing = this.profiles.get(input.profileId);
    const learnedScore = Math.min(
      1,
      Math.max(existing?.historicalWithholdingBehaviorScore ?? 0, 0) + 0.15,
    );
    const next: StoredBuyerTaxProfile = {
      buyerTaxProfileId: existing?.buyerTaxProfileId ?? deterministicUuid(`buyer-tax-profile:${input.profileId}`),
      profileId: input.profileId,
      tenantId: input.tenantId,
      isTopWithholdingAgent: existing?.isTopWithholdingAgent ?? true,
      withholdingDefaultType:
        existing?.withholdingDefaultType && existing.withholdingDefaultType !== "none"
          ? existing.withholdingDefaultType
          : input.withholdingType,
      requires2307ForClosure: existing?.requires2307ForClosure ?? false,
      historicalWithholdingBehaviorScore: learnedScore,
      source: existing ? (existing.source === "supplier_set" ? "mixed" : "learned") : "learned",
      ...(existing?.defaultWithholdingRateBps !== undefined
        ? { defaultWithholdingRateBps: existing.defaultWithholdingRateBps }
        : input.withholdingRateBps !== undefined
          ? { defaultWithholdingRateBps: input.withholdingRateBps }
          : {}),
      ...(input.notes ?? existing?.notes ? { notes: input.notes ?? existing?.notes } : {}),
    };
    this.profiles.set(input.profileId, structuredClone(next));
    return structuredClone(next);
  }
}

class PostgresPaymentFinalityStore implements PaymentFinalityStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async replaceWithholdingComponents(paymentId: string, components: StoredWithholdingComponent[]): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM withholding_component
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND payment_id = '${quoteLiteral(paymentId)}'::uuid;
      `,
    );

    for (const component of components) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO withholding_component (
            withholding_component_id,
            tenant_id,
            payment_id,
            invoice_id,
            withholding_type,
            withholding_rate_bps,
            withholding_amount_minor,
            evidence_status,
            bir_form_2307_document_id,
            recognized_for_invoice_closure,
            notes,
            created_at,
            updated_at
          ) VALUES (
            '${quoteLiteral(component.withholdingComponentId)}'::uuid,
            '${quoteLiteral(this.tenantId)}',
            '${quoteLiteral(component.paymentId)}'::uuid,
            '${quoteLiteral(component.invoiceId)}'::uuid,
            '${quoteLiteral(component.withholdingType)}',
            ${component.withholdingRateBps ?? "NULL"},
            ${component.withholdingAmountMinor},
            '${quoteLiteral(component.evidenceStatus)}',
            ${component.birForm2307DocumentId ? `'${quoteLiteral(component.birForm2307DocumentId)}'::uuid` : "NULL"},
            ${component.recognizedForInvoiceClosure ? "TRUE" : "FALSE"},
            ${component.notes ? `'${quoteLiteral(component.notes)}'` : "NULL"},
            '${quoteLiteral(component.createdAt)}'::timestamptz,
            '${quoteLiteral(component.updatedAt)}'::timestamptz
          );
        `,
      );
    }
  }

  async replaceResidualActions(paymentId: string, actions: StoredPaymentResidualAction[]): Promise<void> {
    executeSqlCommand(
      this.databaseUrl,
      `
        DELETE FROM payment_residual_action
        WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
          AND payment_id = '${quoteLiteral(paymentId)}'::uuid;
      `,
    );

    for (const action of actions) {
      executeSqlCommand(
        this.databaseUrl,
        `
          INSERT INTO payment_residual_action (
            residual_action_id,
            tenant_id,
            payment_id,
            invoice_id,
            residual_type,
            amount_minor,
            reason_code,
            requires_approval,
            status,
            created_at,
            updated_at
          ) VALUES (
            '${quoteLiteral(action.residualActionId)}'::uuid,
            '${quoteLiteral(this.tenantId)}',
            '${quoteLiteral(action.paymentId)}'::uuid,
            ${action.invoiceId ? `'${quoteLiteral(action.invoiceId)}'::uuid` : "NULL"},
            '${quoteLiteral(action.residualType)}',
            ${action.amountMinor},
            '${quoteLiteral(action.reasonCode)}',
            ${action.requiresApproval ? "TRUE" : "FALSE"},
            '${quoteLiteral(action.status)}',
            '${quoteLiteral(action.createdAt)}'::timestamptz,
            '${quoteLiteral(action.updatedAt)}'::timestamptz
          );
        `,
      );
    }
  }

  async listWithholdingComponents(paymentId: string): Promise<StoredWithholdingComponent[]> {
    return queryJsonRows<StoredWithholdingComponent>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            withholding_component_id::text AS "withholdingComponentId",
            tenant_id AS "tenantId",
            payment_id::text AS "paymentId",
            invoice_id::text AS "invoiceId",
            withholding_type AS "withholdingType",
            withholding_rate_bps AS "withholdingRateBps",
            withholding_amount_minor AS "withholdingAmountMinor",
            evidence_status AS "evidenceStatus",
            bir_form_2307_document_id::text AS "birForm2307DocumentId",
            recognized_for_invoice_closure AS "recognizedForInvoiceClosure",
            notes,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM withholding_component
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND payment_id = '${quoteLiteral(paymentId)}'::uuid
          ORDER BY created_at ASC
        ) q;
      `,
    );
  }

  async listResidualActions(paymentId: string): Promise<StoredPaymentResidualAction[]> {
    return queryJsonRows<StoredPaymentResidualAction>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            residual_action_id::text AS "residualActionId",
            tenant_id AS "tenantId",
            payment_id::text AS "paymentId",
            invoice_id::text AS "invoiceId",
            residual_type AS "residualType",
            amount_minor AS "amountMinor",
            reason_code AS "reasonCode",
            requires_approval AS "requiresApproval",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM payment_residual_action
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND payment_id = '${quoteLiteral(paymentId)}'::uuid
          ORDER BY created_at ASC
        ) q;
      `,
    );
  }
}

class PostgresBuyerTaxProfileStore implements BuyerTaxProfileStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly tenantId: string,
  ) {}

  async get(profileId: string): Promise<StoredBuyerTaxProfile | undefined> {
    const customerProfileUuid = deterministicUuid(`customer-profile:${profileId}`);
    const [row] = queryJsonRows<StoredBuyerTaxProfile>(
      this.databaseUrl,
      `
        SELECT row_to_json(q)
        FROM (
          SELECT
            buyer_tax_profile_id::text AS "buyerTaxProfileId",
            '${quoteLiteral(profileId)}' AS "profileId",
            tenant_id AS "tenantId",
            is_top_withholding_agent AS "isTopWithholdingAgent",
            withholding_default_type AS "withholdingDefaultType",
            default_withholding_rate_bps AS "defaultWithholdingRateBps",
            requires_2307_for_closure AS "requires2307ForClosure",
            historical_withholding_behavior_score AS "historicalWithholdingBehaviorScore",
            notes,
            CASE
              WHEN notes ILIKE '%supplier_set%' AND notes ILIKE '%learned%' THEN 'mixed'
              WHEN notes ILIKE '%supplier_set%' THEN 'supplier_set'
              ELSE 'learned'
            END AS "source"
          FROM buyer_tax_profile
          WHERE tenant_id = '${quoteLiteral(this.tenantId)}'
            AND customer_profile_id = '${quoteLiteral(customerProfileUuid)}'::uuid
          LIMIT 1
        ) q;
      `,
    );
    return row;
  }

  async upsert(profile: StoredBuyerTaxProfile): Promise<StoredBuyerTaxProfile> {
    const customerProfileUuid = deterministicUuid(`customer-profile:${profile.profileId}`);
    executeSqlCommand(
      this.databaseUrl,
      `
        INSERT INTO buyer_tax_profile (
          buyer_tax_profile_id,
          tenant_id,
          customer_profile_id,
          is_top_withholding_agent,
          withholding_default_type,
          default_withholding_rate_bps,
          requires_2307_for_closure,
          historical_withholding_behavior_score,
          notes,
          created_at,
          updated_at
        ) VALUES (
          '${quoteLiteral(profile.buyerTaxProfileId)}'::uuid,
          '${quoteLiteral(this.tenantId)}',
          '${quoteLiteral(customerProfileUuid)}'::uuid,
          ${profile.isTopWithholdingAgent === undefined ? "NULL" : profile.isTopWithholdingAgent ? "TRUE" : "FALSE"},
          '${quoteLiteral(profile.withholdingDefaultType)}',
          ${profile.defaultWithholdingRateBps ?? "NULL"},
          ${profile.requires2307ForClosure ? "TRUE" : "FALSE"},
          ${profile.historicalWithholdingBehaviorScore ?? "NULL"},
          ${profile.notes ? `'${quoteLiteral(profile.notes)}'` : "NULL"},
          NOW(),
          NOW()
        )
        ON CONFLICT (buyer_tax_profile_id) DO UPDATE SET
          is_top_withholding_agent = EXCLUDED.is_top_withholding_agent,
          withholding_default_type = EXCLUDED.withholding_default_type,
          default_withholding_rate_bps = EXCLUDED.default_withholding_rate_bps,
          requires_2307_for_closure = EXCLUDED.requires_2307_for_closure,
          historical_withholding_behavior_score = EXCLUDED.historical_withholding_behavior_score,
          notes = EXCLUDED.notes,
          updated_at = NOW();
      `,
    );
    return profile;
  }

  async learnFromSettlement(input: {
    profileId: string;
    tenantId: string;
    withholdingType: StoredBuyerTaxProfile["withholdingDefaultType"];
    withholdingRateBps?: number;
    evidenceStatus: StoredWithholdingComponent["evidenceStatus"];
    notes?: string;
  }): Promise<StoredBuyerTaxProfile> {
    const existing = await this.get(input.profileId);
    const notes = mergeNotes(existing?.notes, [
      "learned",
      `evidence:${input.evidenceStatus}`,
      ...(input.notes ? [input.notes] : []),
    ]);
    const next: StoredBuyerTaxProfile = {
      buyerTaxProfileId: existing?.buyerTaxProfileId ?? deterministicUuid(`buyer-tax-profile:${input.profileId}`),
      profileId: input.profileId,
      tenantId: input.tenantId,
      isTopWithholdingAgent: existing?.isTopWithholdingAgent ?? true,
      withholdingDefaultType:
        existing?.withholdingDefaultType && existing.withholdingDefaultType !== "none"
          ? existing.withholdingDefaultType
          : input.withholdingType,
      requires2307ForClosure: existing?.requires2307ForClosure ?? false,
      historicalWithholdingBehaviorScore: Math.min(
        1,
        Math.max(existing?.historicalWithholdingBehaviorScore ?? 0, 0) + 0.15,
      ),
      source: existing ? (existing.source === "supplier_set" ? "mixed" : "learned") : "learned",
      ...(existing?.defaultWithholdingRateBps !== undefined
        ? { defaultWithholdingRateBps: existing.defaultWithholdingRateBps }
        : input.withholdingRateBps !== undefined
          ? { defaultWithholdingRateBps: input.withholdingRateBps }
          : {}),
      ...(notes ? { notes } : {}),
    };
    return this.upsert(next);
  }
}

const inMemoryPaymentFinalityStore = new InMemoryPaymentFinalityStore();
const inMemoryBuyerTaxProfileStore = new InMemoryBuyerTaxProfileStore();

export function getPaymentFinalityStore(): PaymentFinalityStore {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const tenantId = "default";
  return databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)
    ? new PostgresPaymentFinalityStore(databaseUrl, tenantId)
    : inMemoryPaymentFinalityStore;
}

export function getBuyerTaxProfileStore(): BuyerTaxProfileStore {
  const databaseUrl = createDatabaseClientConfig().connectionString;
  const tenantId = "default";
  return databaseUrl.length > 0 && isDatabaseAvailable(databaseUrl)
    ? new PostgresBuyerTaxProfileStore(databaseUrl, tenantId)
    : inMemoryBuyerTaxProfileStore;
}

function mergeNotes(existing: string | undefined, parts: string[]) {
  return [...new Set([...(existing ? [existing] : []), ...parts.filter(Boolean)])].join(" | ");
}

function deterministicUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
