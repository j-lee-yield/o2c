import {
  claimStates,
  creditMemoDraftStates,
  deductionBundleStates,
  deductionCaseStates,
  deductionLineItemStatuses,
  exceptionStates,
  invoiceStates,
  paymentApplicationStates,
  paymentStates,
  promiseToPayStates,
  remittanceStates
} from "@o2c/domain";

export interface ColumnDefinition {
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  references?: string;
}

export interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
}

export const coreDomainSchemaVersion = "v1";

function withCommonColumns(
  columns: Record<string, ColumnDefinition>
): Record<string, ColumnDefinition> {
  return {
    id: { type: "uuid", primaryKey: true },
    tenant_id: { type: "text" },
    version: { type: "integer" },
    created_at: { type: "timestamptz" },
    updated_at: { type: "timestamptz" },
    deleted_at: { type: "timestamptz", nullable: true },
    created_by_actor_id: { type: "text", nullable: true },
    created_by_actor_role: { type: "text", nullable: true },
    updated_by_actor_id: { type: "text", nullable: true },
    updated_by_actor_role: { type: "text", nullable: true },
    ...columns
  };
}

export const enumDefinitions = {
  invoice_state: [...invoiceStates],
  payment_state: [...paymentStates],
  payment_application_state: [...paymentApplicationStates],
  remittance_state: [...remittanceStates],
  promise_to_pay_state: [...promiseToPayStates],
  exception_state: [...exceptionStates],
  deduction_case_state: [...deductionCaseStates],
  deduction_line_item_status: [...deductionLineItemStatuses],
  claim_state: [...claimStates],
  deduction_document_bundle_state: [...deductionBundleStates],
  credit_memo_draft_state: [...creditMemoDraftStates]
} as const;

export const coreTables: TableDefinition[] = [
  {
    name: "parent_account",
    columns: withCommonColumns({
      name: { type: "text" },
      external_reference: { type: "text", nullable: true },
      status: { type: "text" },
      centrally_serviced: { type: "boolean", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "branch",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      code: { type: "text" },
      name: { type: "text" },
      region: { type: "text", nullable: true },
      country_code: { type: "text", nullable: true },
      status: { type: "text" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "billing_account",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      account_number: { type: "text" },
      display_name: { type: "text" },
      currency: { type: "text" },
      account_tier: { type: "text" },
      erp_customer_id: { type: "text", nullable: true },
      status: { type: "text" },
      centrally_paid: { type: "boolean" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "contact",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      scope: { type: "text" },
      scope_id: { type: "text" },
      full_name: { type: "text" },
      email: { type: "text", nullable: true },
      phone: { type: "text", nullable: true },
      role: { type: "text" },
      is_primary: { type: "boolean" },
      is_verified: { type: "boolean" },
      allow_auto_send: { type: "boolean" },
      recent_successful_responses: { type: "integer" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "uploaded_document",
    columns: withCommonColumns({
      document_type: { type: "text" },
      source: { type: "text" },
      storage_key: { type: "text" },
      checksum: { type: "text" },
      uploaded_by: { type: "text" },
      uploaded_at: { type: "timestamptz" },
      behavior: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "invoice",
    columns: withCommonColumns({
      seller_entity_id: { type: "text", nullable: true },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      invoice_contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      uploaded_document_id: { type: "uuid", nullable: true, references: "uploaded_document(id)" },
      canonical_identity_key: { type: "text" },
      invoice_date: { type: "date", nullable: true },
      invoice_number: { type: "text" },
      amount_cents: { type: "bigint" },
      collectible_amount_cents: { type: "bigint", nullable: true },
      disputed_amount_cents: { type: "bigint", nullable: true },
      currency: { type: "text" },
      due_date: { type: "date", nullable: true },
      state: { type: "invoice_state" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "uploaded_document_processing_record",
    columns: {
      document_id: { type: "uuid", primaryKey: true, references: "uploaded_document(id)" },
      tenant_id: { type: "text" },
      parser_result: { type: "jsonb" },
      hierarchy: { type: "jsonb" },
      duplicate_candidates: { type: "jsonb" },
      erp_candidates: { type: "jsonb" },
      review_case: { type: "jsonb" },
      status: { type: "text" },
      human_confirmed: { type: "boolean" },
      matched_erp_invoice_id: { type: "text", nullable: true },
      provisional_invoice: { type: "jsonb", nullable: true },
      locked_at: { type: "timestamptz", nullable: true },
      locked_by_actor_id: { type: "text", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "imported_invoice_snapshot",
    columns: withCommonColumns({
      source_provider: { type: "text" },
      source_kind: { type: "text" },
      external_id: { type: "text" },
      company_id: { type: "text", nullable: true },
      customer_name: { type: "text" },
      customer_reference: { type: "text", nullable: true },
      invoice_number: { type: "text" },
      currency: { type: "text" },
      total_amount_cents: { type: "bigint" },
      open_amount_cents: { type: "bigint" },
      source_status: { type: "text" },
      issued_at: { type: "date", nullable: true },
      due_date: { type: "date", nullable: true },
      last_imported_at: { type: "timestamptz" },
      canonical_invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      canonicalization_status: { type: "text" },
      hold_reason: { type: "text", nullable: true },
      fingerprint: { type: "text" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "payment",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      uploaded_document_id: { type: "uuid", nullable: true, references: "uploaded_document(id)" },
      payment_reference: { type: "text" },
      amount_cents: { type: "bigint" },
      currency: { type: "text" },
      received_at: { type: "timestamptz" },
      settlement_status: { type: "text", nullable: true },
      source_payment_candidate_id: { type: "uuid", nullable: true },
      finality_confirmed_at: { type: "timestamptz", nullable: true },
      state: { type: "payment_state" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "remittance_processing_record",
    columns: {
      remittance_id: { type: "uuid", primaryKey: true, references: "remittance(id)" },
      tenant_id: { type: "text" },
      source: { type: "jsonb" },
      parsed: { type: "jsonb", nullable: true },
      payment_candidates: { type: "jsonb" },
      invoice_candidates: { type: "jsonb" },
      linked_payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      review: { type: "jsonb", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "cash_application_case",
    columns: {
      payment_id: { type: "uuid", primaryKey: true, references: "payment(id)" },
      tenant_id: { type: "text" },
      queue_status: { type: "text" },
      account_id: { type: "uuid", references: "billing_account(id)" },
      account_snapshot: { type: "jsonb" },
      invoice_snapshots: { type: "jsonb" },
      matches: { type: "jsonb" },
      applications: { type: "jsonb" },
      notes: { type: "jsonb" },
      method: { type: "text" },
      received_on: { type: "text" },
      review_label: { type: "text" },
      severity_label: { type: "text" },
      footer_tag: { type: "text" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "perfios_raw_statement_payload",
    columns: {
      raw_payload_id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      document_id: { type: "text" },
      source_provider: { type: "text" },
      payload: { type: "jsonb" },
      received_at: { type: "timestamptz" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "perfios_normalized_statement",
    columns: {
      statement_id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      document_id: { type: "text" },
      raw_payload_id: { type: "text", references: "perfios_raw_statement_payload(raw_payload_id)" },
      bank_name: { type: "text", nullable: true },
      account_name: { type: "text", nullable: true },
      account_number_masked: { type: "text", nullable: true },
      statement_period_start: { type: "date", nullable: true },
      statement_period_end: { type: "date", nullable: true },
      currency: { type: "text", nullable: true },
      source_provider: { type: "text" },
      parser_confidence: { type: "double precision" },
      parser_confidence_level: { type: "text" },
      reconciliation_ready: { type: "boolean" },
      metadata: { type: "jsonb", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "perfios_normalized_transaction",
    columns: {
      transaction_id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      statement_id: { type: "text", references: "perfios_normalized_statement(statement_id)" },
      external_transaction_id: { type: "text", nullable: true },
      date: { type: "date" },
      cheque_number: { type: "text", nullable: true },
      description: { type: "text" },
      amount: { type: "bigint" },
      balance: { type: "bigint", nullable: true },
      category: { type: "text", nullable: true },
      inferred_direction: { type: "text" },
      parser_confidence: { type: "double precision" },
      parser_confidence_level: { type: "text" },
      source_page: { type: "integer", nullable: true },
      source_row: { type: "integer", nullable: true },
      duplicate_flag: { type: "boolean" },
      duplicate_status: { type: "text" },
      candidate_payment_flag: { type: "boolean" },
      settlement_hint: { type: "text" },
      settlement_status: { type: "text" },
      review_status: { type: "text" },
      human_corrected_fields: { type: "jsonb" },
      automation_eligibility: { type: "text" },
      reconciliation_ready: { type: "boolean" },
      metadata: { type: "jsonb", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "payment_candidate",
    columns: {
      payment_candidate_id: { type: "uuid", primaryKey: true },
      tenant_id: { type: "text" },
      statement_id: { type: "text", references: "perfios_normalized_statement(statement_id)" },
      source_bank_transaction_ids: { type: "jsonb" },
      customer_profile_id: { type: "uuid", nullable: true },
      inferred_customer_profile_id: { type: "uuid", nullable: true },
      payer_name: { type: "text", nullable: true },
      amount_minor: { type: "bigint" },
      currency: { type: "text" },
      payment_reference: { type: "text", nullable: true },
      settlement_hint: { type: "text" },
      settlement_status: { type: "text" },
      confidence_score: { type: "double precision", nullable: true },
      confidence_band: { type: "text" },
      review_reason_codes: { type: "jsonb" },
      status: { type: "text" },
      metadata: { type: "jsonb", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "withholding_component",
    columns: {
      withholding_component_id: { type: "uuid", primaryKey: true },
      tenant_id: { type: "text" },
      payment_id: { type: "uuid", references: "payment(id)" },
      invoice_id: { type: "uuid", references: "invoice(id)" },
      withholding_type: { type: "text" },
      withholding_rate_bps: { type: "integer", nullable: true },
      withholding_amount_minor: { type: "bigint" },
      evidence_status: { type: "text" },
      bir_form_2307_document_id: { type: "uuid", nullable: true, references: "uploaded_document(id)" },
      recognized_for_invoice_closure: { type: "boolean" },
      notes: { type: "text", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "buyer_tax_profile",
    columns: {
      buyer_tax_profile_id: { type: "uuid", primaryKey: true },
      tenant_id: { type: "text" },
      customer_profile_id: { type: "uuid", nullable: true },
      is_top_withholding_agent: { type: "boolean", nullable: true },
      withholding_default_type: { type: "text" },
      default_withholding_rate_bps: { type: "integer", nullable: true },
      requires_2307_for_closure: { type: "boolean" },
      historical_withholding_behavior_score: { type: "double precision", nullable: true },
      notes: { type: "text", nullable: true },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "payment_residual_action",
    columns: {
      residual_action_id: { type: "uuid", primaryKey: true },
      tenant_id: { type: "text" },
      payment_id: { type: "uuid", references: "payment(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      residual_type: { type: "text" },
      amount_minor: { type: "bigint" },
      reason_code: { type: "text" },
      requires_approval: { type: "boolean" },
      status: { type: "text" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" }
    }
  },
  {
    name: "payment_application",
    columns: withCommonColumns({
      payment_id: { type: "uuid", references: "payment(id)" },
      invoice_id: { type: "uuid", references: "invoice(id)" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      currency: { type: "text" },
      applied_amount_cents: { type: "bigint" },
      state: { type: "payment_application_state" },
      source: { type: "text" },
      correlation_id: { type: "text", nullable: true },
      rationale: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "remittance",
    columns: withCommonColumns({
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      uploaded_document_id: { type: "uuid", nullable: true, references: "uploaded_document(id)" },
      source_channel: { type: "text" },
      raw_payload: { type: "jsonb", nullable: true },
      state: { type: "remittance_state" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "promise_to_pay",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      promised_amount_cents: { type: "bigint" },
      currency: { type: "text" },
      promise_date: { type: "date" },
      state: { type: "promise_to_pay_state" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "exception",
    columns: withCommonColumns({
      entity_type: { type: "text" },
      entity_id: { type: "uuid" },
      severity: { type: "text" },
      summary: { type: "text" },
      details: { type: "text", nullable: true },
      state: { type: "exception_state" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "deduction_case",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      exception_id: { type: "uuid", nullable: true, references: "exception(id)" },
      approval_request_id: { type: "uuid", nullable: true, references: "approval_requests(id)" },
      external_claim_reference: { type: "text", nullable: true },
      state: { type: "deduction_case_state" },
      queue_status: { type: "text" },
      reason_code: { type: "text" },
      priority: { type: "text" },
      source_channel: { type: "text" },
      source_job_id: { type: "text", nullable: true },
      owner_role: { type: "text", nullable: true },
      detected_at: { type: "timestamptz" },
      opened_at: { type: "timestamptz" },
      target_amount_cents: { type: "bigint" },
      currency: { type: "text" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "claim",
    columns: withCommonColumns({
      deduction_case_id: { type: "uuid", references: "deduction_case(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      exception_id: { type: "uuid", nullable: true, references: "exception(id)" },
      claim_number: { type: "text" },
      claimant_name: { type: "text", nullable: true },
      source_channel: { type: "text" },
      asserted_at: { type: "timestamptz" },
      status: { type: "claim_state" },
      asserted_amount_cents: { type: "bigint" },
      currency: { type: "text" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "deduction_line_item",
    columns: withCommonColumns({
      deduction_case_id: { type: "uuid", references: "deduction_case(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      exception_id: { type: "uuid", nullable: true, references: "exception(id)" },
      claim_id: { type: "uuid", nullable: true, references: "claim(id)" },
      line_number: { type: "integer" },
      category: { type: "text" },
      description: { type: "text" },
      quantity: { type: "numeric", nullable: true },
      unit_amount_cents: { type: "bigint", nullable: true },
      disputed_amount_cents: { type: "bigint" },
      accepted_amount_cents: { type: "bigint", nullable: true },
      status: { type: "deduction_line_item_status" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "deduction_document_bundle",
    columns: withCommonColumns({
      deduction_case_id: { type: "uuid", references: "deduction_case(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      status: { type: "deduction_document_bundle_state" },
      completeness_score: { type: "numeric" },
      missing_document_types: { type: "jsonb" },
      document_ids: { type: "jsonb" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "credit_memo_draft",
    columns: withCommonColumns({
      deduction_case_id: { type: "uuid", references: "deduction_case(id)" },
      invoice_id: { type: "uuid", nullable: true, references: "invoice(id)" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      exception_id: { type: "uuid", nullable: true, references: "exception(id)" },
      approval_request_id: { type: "uuid", nullable: true, references: "approval_requests(id)" },
      memo_number: { type: "text", nullable: true },
      state: { type: "credit_memo_draft_state" },
      reason_code: { type: "text" },
      currency: { type: "text" },
      subtotal_amount_cents: { type: "bigint" },
      total_amount_cents: { type: "bigint" },
      last_refreshed_at: { type: "timestamptz" },
      last_synced_at: { type: "timestamptz", nullable: true },
      erp_sync_status: { type: "text" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "credit_memo_draft_line",
    columns: withCommonColumns({
      credit_memo_draft_id: { type: "uuid", references: "credit_memo_draft(id)" },
      deduction_line_item_id: { type: "uuid", nullable: true, references: "deduction_line_item(id)" },
      line_number: { type: "integer" },
      description: { type: "text" },
      quantity: { type: "numeric", nullable: true },
      unit_amount_cents: { type: "bigint", nullable: true },
      amount_cents: { type: "bigint" },
      tax_code: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "activity_log",
    columns: withCommonColumns({
      entity_type: { type: "text" },
      entity_id: { type: "uuid" },
      action: { type: "text" },
      actor_id: { type: "text" },
      actor_role: { type: "text" },
      occurred_at: { type: "timestamptz" },
      from_state: { type: "text", nullable: true },
      to_state: { type: "text", nullable: true },
      payload: { type: "jsonb" }
    })
  },
  {
    name: "approval_requests",
    columns: withCommonColumns({
      request_type: { type: "text" },
      status: { type: "text" },
      requested_by: { type: "text" },
      assignee_role: { type: "text", nullable: true },
      current_step: { type: "text", nullable: true },
      requested_at: { type: "timestamptz" },
      resolved_at: { type: "timestamptz", nullable: true },
      terminal_at: { type: "timestamptz", nullable: true },
      reopened_from_status: { type: "text", nullable: true },
      payload: { type: "jsonb" },
      policy_context: { type: "jsonb" },
      metadata: { type: "jsonb" },
      entity_type: { type: "text", nullable: true },
      entity_id: { type: "uuid", nullable: true },
      approver_id: { type: "text", nullable: true }
    })
  },
  {
    name: "learning_event",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      event_type: { type: "text" },
      source_system: { type: "text" },
      source_event_id: { type: "text", nullable: true },
      occurred_at: { type: "timestamptz" },
      channel: { type: "text", nullable: true },
      provider: { type: "text", nullable: true },
      direction: { type: "text", nullable: true },
      intent_type: { type: "text", nullable: true },
      communication_status: { type: "text", nullable: true },
      related_entity_type: { type: "text", nullable: true },
      related_entity_id: { type: "text", nullable: true },
      invoice_ids: { type: "jsonb" },
      payment_id: { type: "uuid", nullable: true, references: "payment(id)" },
      remittance_id: { type: "uuid", nullable: true, references: "remittance(id)" },
      promise_to_pay_id: { type: "uuid", nullable: true, references: "promise_to_pay(id)" },
      exception_id: { type: "uuid", nullable: true, references: "exception(id)" },
      approval_request_id: { type: "uuid", nullable: true, references: "approval_requests(id)" },
      explanation: { type: "jsonb" },
      payload: { type: "jsonb" },
      reversible: { type: "boolean" },
      reversed_at: { type: "timestamptz", nullable: true },
      reversal_reason: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "communication_attempt",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      approval_request_id: { type: "uuid", nullable: true, references: "approval_requests(id)" },
      channel: { type: "text" },
      provider: { type: "text" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      sender_email: { type: "text", nullable: true },
      sender_display_name: { type: "text", nullable: true },
      direction: { type: "text" },
      intent_type: { type: "text" },
      status: { type: "text" },
      recipient: { type: "jsonb" },
      invoice_ids: { type: "jsonb" },
      subject_line: { type: "text", nullable: true },
      content_template_key: { type: "text", nullable: true },
      body_preview: { type: "text", nullable: true },
      provider_message_id: { type: "text", nullable: true },
      provider_thread_id: { type: "text", nullable: true },
      provider_conversation_id: { type: "text", nullable: true },
      in_reply_to_provider_message_id: { type: "text", nullable: true },
      blocked_reasons: { type: "jsonb" },
      explanation: { type: "jsonb" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "sending_identity",
    columns: withCommonColumns({
      provider: { type: "text" },
      auth_mode: { type: "text" },
      sender_email: { type: "text" },
      display_name: { type: "text", nullable: true },
      owner_principal_id: { type: "text", nullable: true },
      owner_principal_roles: { type: "jsonb" },
      connection_status: { type: "text" },
      permission_status: { type: "text" },
      scopes: { type: "jsonb" },
      send_as_email: { type: "text", nullable: true },
      send_on_behalf_of_email: { type: "text", nullable: true },
      is_default: { type: "boolean" },
      allowed_tenant_id: { type: "text", nullable: true },
      allowed_supplier_scope: { type: "jsonb" },
      health_state: { type: "text" },
      last_sync_at: { type: "timestamptz", nullable: true },
      last_send_check_at: { type: "timestamptz", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "gmail_oauth_connection",
    columns: {
      sender_identity_id: { type: "uuid", primaryKey: true, references: "sending_identity(id)" },
      tenant_id: { type: "text" },
      sender_email: { type: "text" },
      access_token: { type: "text" },
      refresh_token: { type: "text", nullable: true },
      access_token_expires_at: { type: "timestamptz" },
      scopes: { type: "jsonb" },
      display_name: { type: "text", nullable: true },
      connected_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      requested_by_principal_id: { type: "text", nullable: true },
      requested_by_principal_roles: { type: "jsonb" },
      metadata: { type: "jsonb" }
    }
  },
  {
    name: "quickbooks_oauth_connection",
    columns: {
      tenant_slug: { type: "text", primaryKey: true },
      connection_id: { type: "text" },
      realm_id: { type: "text" },
      environment: { type: "text" },
      company_name: { type: "text", nullable: true },
      access_token: { type: "text" },
      refresh_token: { type: "text", nullable: true },
      access_token_expires_at: { type: "timestamptz" },
      refresh_token_expires_at: { type: "timestamptz", nullable: true },
      connected_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    }
  },
  {
    name: "sap_business_one_connection",
    columns: {
      tenant_slug: { type: "text", primaryKey: true },
      connection_id: { type: "text" },
      base_url: { type: "text" },
      company_database: { type: "text" },
      username: { type: "text" },
      password: { type: "text" },
      language: { type: "text", nullable: true },
      session_id: { type: "text" },
      route_id: { type: "text", nullable: true },
      company_name: { type: "text", nullable: true },
      session_timeout_minutes: { type: "integer", nullable: true },
      connected_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    }
  },
  {
    name: "sap_business_one_sync_run",
    columns: {
      run_id: { type: "text", primaryKey: true },
      tenant_slug: { type: "text" },
      trigger_source: { type: "text" },
      sync_scope: { type: "jsonb" },
      status: { type: "text" },
      invoices_synced_count: { type: "integer" },
      customers_synced_count: { type: "integer" },
      payments_synced_count: { type: "integer" },
      error_message: { type: "text", nullable: true },
      started_at: { type: "timestamptz" },
      completed_at: { type: "timestamptz", nullable: true },
      metadata: { type: "jsonb" }
    }
  },
  {
    name: "email_thread_reference",
    columns: withCommonColumns({
      communication_attempt_id: { type: "uuid", references: "communication_attempt(id)" },
      provider: { type: "text" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      invoice_ids: { type: "jsonb" },
      workflow_intent: { type: "text" },
      provider_message_id: { type: "text", nullable: true },
      provider_thread_id: { type: "text", nullable: true },
      provider_conversation_id: { type: "text", nullable: true },
      reply_to_provider_message_id: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "communication_thread",
    columns: withCommonColumns({
      channel: { type: "text" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_ids: { type: "jsonb" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      status: { type: "text" },
      inbox_state: { type: "text" },
      subject_line: { type: "text", nullable: true },
      participant_addresses: { type: "jsonb" },
      invoice_ids: { type: "jsonb" },
      promise_to_pay_ids: { type: "jsonb" },
      latest_message_id: { type: "uuid", nullable: true },
      latest_message_at: { type: "timestamptz", nullable: true },
      unread_count: { type: "integer" },
      provider_thread_id: { type: "text", nullable: true },
      provider_conversation_id: { type: "text", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "communication_message",
    columns: withCommonColumns({
      thread_id: { type: "uuid", references: "communication_thread(id)" },
      channel: { type: "text" },
      kind: { type: "text" },
      status: { type: "text" },
      direction: { type: "text" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      subject_line: { type: "text", nullable: true },
      body_preview: { type: "text" },
      body_text: { type: "text", nullable: true },
      provider_message_id: { type: "text", nullable: true },
      provider_thread_id: { type: "text", nullable: true },
      provider_conversation_id: { type: "text", nullable: true },
      in_reply_to_provider_message_id: { type: "text", nullable: true },
      from_address: { type: "text", nullable: true },
      to_address: { type: "text", nullable: true },
      occurred_at: { type: "timestamptz" },
      reply_analysis: { type: "jsonb", nullable: true },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "call_session",
    columns: withCommonColumns({
      thread_id: { type: "uuid", nullable: true, references: "communication_thread(id)" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      provider: { type: "text" },
      provider_call_id: { type: "text", nullable: true },
      direction: { type: "text" },
      disposition: { type: "text" },
      answered: { type: "boolean" },
      started_at: { type: "timestamptz" },
      ended_at: { type: "timestamptz", nullable: true },
      transcript_summary: { type: "text", nullable: true },
      transcript_segments: { type: "jsonb" },
      sentiment_label: { type: "text", nullable: true },
      operator_review_required: { type: "boolean" },
      promise_to_pay_id: { type: "uuid", nullable: true, references: "promise_to_pay(id)" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "outreach_draft",
    columns: withCommonColumns({
      channel: { type: "text" },
      thread_id: { type: "uuid", nullable: true, references: "communication_thread(id)" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      branch_ids: { type: "jsonb" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      sender_identity_id: { type: "uuid", nullable: true, references: "sending_identity(id)" },
      invoice_ids: { type: "jsonb" },
      status: { type: "text" },
      subject_line: { type: "text", nullable: true },
      body_preview: { type: "text" },
      body_text: { type: "text", nullable: true },
      approval_request_id: { type: "uuid", nullable: true, references: "approval_requests(id)" },
      reply_to_message_id: { type: "uuid", nullable: true, references: "communication_message(id)" },
      email_first_production_behavior: { type: "boolean" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "contact_delivery_status",
    columns: withCommonColumns({
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", references: "billing_account(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      channel: { type: "text" },
      destination: { type: "text" },
      state: { type: "text" },
      last_attempt_at: { type: "timestamptz", nullable: true },
      last_delivered_at: { type: "timestamptz", nullable: true },
      last_bounced_at: { type: "timestamptz", nullable: true },
      last_bounce_reason: { type: "text", nullable: true },
      related_message_id: { type: "uuid", nullable: true, references: "communication_message(id)" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "channel_behavior_profile",
    columns: withCommonColumns({
      owner_type: { type: "text" },
      owner_id: { type: "text" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      channel: { type: "text" },
      response_rate: { type: "double precision" },
      avg_response_latency_hours: { type: "double precision", nullable: true },
      payment_conversion_rate: { type: "double precision" },
      ptp_capture_rate: { type: "double precision" },
      ptp_kept_rate: { type: "double precision" },
      wrong_contact_rate: { type: "double precision" },
      doc_request_rate: { type: "double precision" },
      opt_out_rate: { type: "double precision" },
      connect_rate: { type: "double precision" },
      voicemail_rate: { type: "double precision" },
      right_party_contact_rate: { type: "double precision" },
      best_for_intent: { type: "jsonb" },
      last_computed_at: { type: "timestamptz" },
      evidence_count: { type: "integer" },
      explanation: { type: "jsonb" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "account_behavior_profile",
    columns: withCommonColumns({
      scope: { type: "text" },
      scope_id: { type: "text" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      preferred_channel: { type: "text", nullable: true },
      fallback_channel: { type: "text", nullable: true },
      channel_priority_order: { type: "jsonb" },
      best_channel_by_intent: { type: "jsonb" },
      metrics_by_channel: { type: "jsonb" },
      safety_flags: { type: "jsonb" },
      evidence_summary: { type: "jsonb" },
      explanation: { type: "jsonb" },
      policy_snapshot: { type: "jsonb" },
      last_computed_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "contact_behavior_profile",
    columns: withCommonColumns({
      contact_id: { type: "uuid", references: "contact(id)" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      preferred_channel: { type: "text", nullable: true },
      fallback_channel: { type: "text", nullable: true },
      channel_priority_order: { type: "jsonb" },
      best_channel_by_intent: { type: "jsonb" },
      metrics_by_channel: { type: "jsonb" },
      verification_snapshot: { type: "jsonb" },
      evidence_summary: { type: "jsonb" },
      explanation: { type: "jsonb" },
      policy_snapshot: { type: "jsonb" },
      last_computed_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "email_outcome",
    columns: withCommonColumns({
      communication_attempt_id: { type: "uuid", references: "communication_attempt(id)" },
      delivered: { type: "boolean" },
      opened: { type: "boolean" },
      replied: { type: "boolean" },
      bounced: { type: "boolean" },
      link_clicked: { type: "boolean" },
      attachments_sent: { type: "jsonb" },
      docs_requested: { type: "boolean" },
      extracted_ptp: { type: "jsonb", nullable: true },
      extracted_remittance_signal: { type: "boolean" },
      occurred_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "sms_outcome",
    columns: withCommonColumns({
      communication_attempt_id: { type: "uuid", references: "communication_attempt(id)" },
      delivered: { type: "boolean" },
      replied: { type: "boolean" },
      clicked: { type: "boolean" },
      opt_out_received: { type: "boolean" },
      extracted_ptp: { type: "jsonb", nullable: true },
      extracted_remittance_signal: { type: "boolean" },
      occurred_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "call_outcome",
    columns: withCommonColumns({
      communication_attempt_id: { type: "uuid", references: "communication_attempt(id)" },
      answered: { type: "boolean" },
      duration_seconds: { type: "integer", nullable: true },
      disposition: { type: "text" },
      promised_amount_cents: { type: "bigint", nullable: true },
      promised_date: { type: "date", nullable: true },
      transcript_uri: { type: "text", nullable: true },
      transcript_summary: { type: "text", nullable: true },
      transcript_segments: { type: "jsonb" },
      sentiment_label: { type: "text", nullable: true },
      operator_review_required: { type: "boolean" },
      occurred_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "operator_feedback",
    columns: withCommonColumns({
      feedback_type: { type: "text" },
      target_type: { type: "text" },
      target_id: { type: "text" },
      occurred_at: { type: "timestamptz" },
      parent_account_id: { type: "uuid", nullable: true, references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      linked_learning_event_id: { type: "uuid", nullable: true, references: "learning_event(id)" },
      linked_next_best_action_score_id: {
        type: "uuid",
        nullable: true,
        references: "next_best_action_score(id)"
      },
      reason_code: { type: "text" },
      comment: { type: "text", nullable: true },
      before_payload: { type: "jsonb", nullable: true },
      after_payload: { type: "jsonb", nullable: true },
      applies_to_future_scoring: { type: "boolean" },
      preserves_safety_rules: { type: "boolean" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "next_best_action_score",
    columns: withCommonColumns({
      domain: { type: "text" },
      parent_account_id: { type: "uuid", references: "parent_account(id)" },
      billing_account_id: { type: "uuid", nullable: true, references: "billing_account(id)" },
      branch_id: { type: "uuid", nullable: true, references: "branch(id)" },
      contact_id: { type: "uuid", nullable: true, references: "contact(id)" },
      recommended_action: { type: "text" },
      recommended_channel: { type: "text", nullable: true },
      intent_type: { type: "text", nullable: true },
      score: { type: "double precision" },
      requires_approval: { type: "boolean" },
      hard_safety_blocks: { type: "jsonb" },
      candidate_scores: { type: "jsonb" },
      explanation: { type: "jsonb" },
      source_profile_ids: { type: "jsonb" },
      policy_snapshot: { type: "jsonb" },
      scored_at: { type: "timestamptz" },
      metadata: { type: "jsonb" }
    })
  },
  {
    name: "control_center_workflow",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      category: { type: "text" },
      name: { type: "text" },
      enabled: { type: "boolean" },
      sender_identity_id: { type: "text", nullable: true },
      sender_email: { type: "text", nullable: true },
      test_email_recipient: { type: "text", nullable: true },
      test_call_recipient: { type: "text", nullable: true },
      timezone: { type: "text" },
      outreach_window_start: { type: "text" },
      outreach_window_end: { type: "text" },
      outreach_days: { type: "jsonb" },
      weekend_calling_enabled: { type: "boolean" },
      stage_count: { type: "integer" },
      metadata: { type: "jsonb" }
    }
  },
  {
    name: "control_center_template_folder",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      name: { type: "text" }
    }
  },
  {
    name: "control_center_email_template",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      name: { type: "text" },
      folder_id: { type: "text", nullable: true, references: "control_center_template_folder(id)" },
      subject: { type: "text" },
      body: { type: "text" },
      cc_emails: { type: "jsonb" },
      channel_compatibility: { type: "jsonb" },
      auto_correct_enabled: { type: "boolean" },
      is_default: { type: "boolean" },
      is_archived: { type: "boolean" },
      preview_seed_key: { type: "text", nullable: true }
    }
  },
  {
    name: "control_center_stage",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      workflow_id: { type: "text", references: "control_center_workflow(id)" },
      stage_order: { type: "integer" },
      outreach_type: { type: "text" },
      trigger_type: { type: "text" },
      trigger_config: { type: "jsonb" },
      template_mode: { type: "text" },
      template_id: { type: "text", nullable: true, references: "control_center_email_template(id)" },
      ai_strategy_id: { type: "text", nullable: true },
      notes: { type: "text" },
      enabled: { type: "boolean" },
      requires_approval: { type: "boolean" },
      risk_hints: { type: "jsonb" }
    }
  },
  {
    name: "control_center_call_agent_config",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      phone_number: { type: "text" },
      sms_enabled: { type: "boolean" },
      outbound_calling_enabled: { type: "boolean" },
      human_support_number: { type: "text", nullable: true },
      handoff_to_human_enabled: { type: "boolean" },
      manual_agent_instructions: { type: "text" },
      override_opening_line: { type: "text", nullable: true },
      call_recording_disclaimer_enabled: { type: "boolean" },
      provider_type: { type: "text", nullable: true },
      provider_config_metadata: { type: "jsonb" },
      default_behavior_flags: { type: "jsonb" }
    }
  },
  {
    name: "control_center_config",
    columns: {
      id: { type: "text", primaryKey: true },
      tenant_id: { type: "text" },
      version: { type: "integer" },
      created_at: { type: "timestamptz" },
      updated_at: { type: "timestamptz" },
      deleted_at: { type: "timestamptz", nullable: true },
      created_by_actor_id: { type: "text", nullable: true },
      created_by_actor_role: { type: "text", nullable: true },
      updated_by_actor_id: { type: "text", nullable: true },
      updated_by_actor_role: { type: "text", nullable: true },
      default_timezone: { type: "text" },
      default_sender_behavior: { type: "text" },
      allowed_channels: { type: "jsonb" },
      channel_fallback_policy: { type: "text" },
      sandbox_mode: { type: "text" },
      default_risk_approval_mode: { type: "text" },
      seeded_demo_flags: { type: "jsonb" }
    }
  }
];
