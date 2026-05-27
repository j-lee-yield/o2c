import { queryJsonRows } from "@o2c/database";

export interface RetellPromiseToPayContextRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  state:
    | "detected_unconfirmed"
    | "accepted"
    | "due_today"
    | "kept"
    | "broken"
    | "superseded"
    | "cancelled";
  parentAccountId: string;
  billingAccountId: string;
  contactId?: string;
  installmentLineIds?: string[];
  promisedAmountCents: number;
  currency: string;
  promiseDate: string;
  metadata: Record<string, unknown>;
}

export function loadPromiseToPayContextRows(input: {
  databaseUrl: string;
  billingAccountId: string;
  contactId: string;
  invoiceIds: string[];
  queryRows?: typeof queryJsonRows<RetellPromiseToPayContextRow>;
}): RetellPromiseToPayContextRow[] {
  const invoiceIdsJson = JSON.stringify(input.invoiceIds);
  const queryRows =
    input.queryRows ??
    ((databaseUrl: string, sql: string) =>
      queryJsonRows<RetellPromiseToPayContextRow>(databaseUrl, sql));

  try {
    return queryRows(
      input.databaseUrl,
      buildPromiseToPayContextSql({
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        invoiceIdsJson,
        includeInstallmentLineColumn: true,
      }),
    );
  } catch (error) {
    if (!isMissingInstallmentLineIdsColumnError(error)) {
      throw error;
    }

    return queryRows(
      input.databaseUrl,
      buildPromiseToPayContextSql({
        billingAccountId: input.billingAccountId,
        contactId: input.contactId,
        invoiceIdsJson,
        includeInstallmentLineColumn: false,
      }),
    );
  }
}

function buildPromiseToPayContextSql(input: {
  billingAccountId: string;
  contactId: string;
  invoiceIdsJson: string;
  includeInstallmentLineColumn: boolean;
}) {
  const installmentLineIdsSelect = input.includeInstallmentLineColumn
    ? `COALESCE(
          installment_line_ids,
          metadata->'installmentLineIds',
          metadata->'installment_line_ids'
        ) AS "installmentLineIds",`
    : `COALESCE(
          metadata->'installmentLineIds',
          metadata->'installment_line_ids'
        ) AS "installmentLineIds",`;

  return `
      SELECT row_to_json(q)
      FROM (
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          state,
          parent_account_id::text AS "parentAccountId",
          billing_account_id::text AS "billingAccountId",
          contact_id::text AS "contactId",
          ${installmentLineIdsSelect}
          promised_amount_cents::integer AS "promisedAmountCents",
          currency,
          promise_date::text AS "promiseDate",
          metadata
        FROM promise_to_pay
        WHERE deleted_at IS NULL
          AND billing_account_id = '${quoteSql(input.billingAccountId)}'::uuid
          AND state IN ('detected_unconfirmed', 'accepted', 'due_today', 'broken')
          AND (
            contact_id IS NULL
            OR contact_id = '${quoteSql(input.contactId)}'::uuid
          )
          AND (
            COALESCE(metadata->'invoiceIds', metadata->'invoice_ids') IS NULL
            OR COALESCE(metadata->'invoiceIds', metadata->'invoice_ids') ?| ARRAY(
              SELECT jsonb_array_elements_text('${quoteSql(input.invoiceIdsJson)}'::jsonb)
            )
          )
        ORDER BY promise_date ASC, updated_at DESC
        LIMIT 20
      ) q
    `;
}

function isMissingInstallmentLineIdsColumnError(error: unknown) {
  return (
    error instanceof Error &&
    /installment_line_ids/.test(error.message) &&
    /does not exist/.test(error.message)
  );
}

function quoteSql(value: string) {
  return value.replace(/'/g, "''");
}
