import { z } from "zod";

const booleanishSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_DEMO_DATA: booleanishSchema.default(false),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  DEFAULT_TENANT_SLUG: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
  CLIENT_CONNECT_LINK_SECRET: z.string().optional(),
  INTEGRATION_NETSUITE_CLIENT_ID: z.string().optional(),
  INTEGRATION_NETSUITE_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_NETSUITE_ACCOUNT_ID: z.string().optional(),
  INTEGRATION_NETSUITE_BASE_URL: z.string().optional(),
  INTEGRATION_QUICKBOOKS_CLIENT_ID: z.string().optional(),
  INTEGRATION_QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_QUICKBOOKS_REALM_ID: z.string().optional(),
  INTEGRATION_QUICKBOOKS_CONNECT_REDIRECT_URI: z.string().optional(),
  INTEGRATION_QUICKBOOKS_CONNECT_DEFAULT_ENVIRONMENT: z.string().optional(),
  INTEGRATION_XERO_CLIENT_ID: z.string().optional(),
  INTEGRATION_XERO_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_XERO_TENANT_ID: z.string().optional(),
  INTEGRATION_ZOHO_CLIENT_ID: z.string().optional(),
  INTEGRATION_ZOHO_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_ZOHO_ORGANIZATION_ID: z.string().optional(),
  INTEGRATION_ODOO_BASE_URL: z.string().optional(),
  INTEGRATION_ODOO_DATABASE: z.string().optional(),
  INTEGRATION_ODOO_USERNAME: z.string().optional(),
  INTEGRATION_ODOO_PASSWORD: z.string().optional(),
  INTEGRATION_ODOO_COMPANY_ID: z.string().optional(),
  INTEGRATION_ODOO_DEFAULT_JOURNAL_ID: z.string().optional(),
  INTEGRATION_ODOO_DEFAULT_PRODUCT_ID: z.string().optional(),
  INTEGRATION_DEAR_ACCOUNT_ID: z.string().optional(),
  INTEGRATION_DEAR_API_KEY: z.string().optional(),
  INTEGRATION_GOOGLE_SHEETS_CLIENT_EMAIL: z.string().optional(),
  INTEGRATION_GOOGLE_SHEETS_PRIVATE_KEY: z.string().optional(),
  INTEGRATION_GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  INTEGRATION_EMAIL_HOST: z.string().optional(),
  INTEGRATION_EMAIL_PORT: z.coerce.number().int().positive().optional(),
  INTEGRATION_EMAIL_USERNAME: z.string().optional(),
  INTEGRATION_EMAIL_PASSWORD: z.string().optional(),
  INTEGRATION_EMAIL_MAILBOX: z.string().optional(),
  INTEGRATION_YIELD_PROJECT_ID: z.string().optional(),
  INTEGRATION_YIELD_REGION: z.string().optional(),
  INTEGRATION_PERFIOS_API_KEY: z.string().optional(),
  INTEGRATION_PERFIOS_BASE_URL: z.string().optional(),
  INTEGRATION_BUSINESS_CENTRAL_BASE_URL: z.string().optional(),
  INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_ID: z.string().optional(),
  INTEGRATION_BUSINESS_CENTRAL_CONNECT_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_BUSINESS_CENTRAL_CONNECT_REDIRECT_URI: z.string().optional(),
  INTEGRATION_BUSINESS_CENTRAL_CONNECT_DEFAULT_ENVIRONMENT: z.string().optional(),
  INTEGRATION_GMAIL_CONNECT_CLIENT_ID: z.string().optional(),
  INTEGRATION_GMAIL_CONNECT_CLIENT_SECRET: z.string().optional(),
  INTEGRATION_GMAIL_CONNECT_REDIRECT_URI: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OUTREACH_EMAIL_DRAFT_MODEL: z.string().optional(),
  RETELL_API_KEY: z.string().optional(),
  RETELL_BASE_URL: z.string().url().optional(),
  RETELL_FROM_NUMBER: z.string().optional(),
  RETELL_OUTBOUND_AGENT_ID: z.string().optional(),
  RETELL_CUSTOM_FUNCTION_BASE_URL: z.string().url().optional(),
  RETELL_CUSTOM_FUNCTION_SECRET: z.string().optional(),
  RETELL_WEBHOOK_SECRET: z.string().optional(),
  RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION: booleanishSchema.optional(),
  RETELL_CALL_INBOX_POLLING_ENABLED: booleanishSchema.optional(),
  RETELL_CALL_INBOX_POLLING_INTERVAL_SECONDS: z.coerce.number().int().positive().optional(),
  RETELL_CALL_INBOX_POLLING_LIMIT: z.coerce.number().int().positive().optional(),
  COLLECTIONS_BROKEN_PROMISE_ESCALATION_THRESHOLD: z.coerce.number().int().positive().default(2),
  COLLECTIONS_BROKEN_PROMISE_ESCALATION_WINDOW_DAYS: z.coerce.number().int().positive().default(90),
  INTEGRATION_SAP_BUSINESS_ONE_SYNC_ENABLED: booleanishSchema.optional(),
  INTEGRATION_SAP_BUSINESS_ONE_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;
