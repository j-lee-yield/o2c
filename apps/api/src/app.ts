import Fastify from "fastify";
import { loadEnv } from "@o2c/config";
import { createDatabaseClientConfig } from "@o2c/database";
import { registerAccountRoutes } from "./modules/accounts.js";
import { registerAccessControlRoutes } from "./modules/access-control.js";
import { registerApprovalRoutes } from "./modules/approvals.js";
import { registerBirInvoiceReviewRoutes } from "./modules/bir-invoice-review.js";
import { registerBusinessCentralRoutes } from "./modules/business-central.js";
import { registerCashApplicationRoutes } from "./modules/cash-application.js";
import { registerClientConnectInviteRoutes } from "./modules/client-connect-invites.js";
import { registerCollectionsCallInboxRoutes } from "./modules/collections-call-inbox.js";
import { registerCollectionsEmailRoutes } from "./modules/collections-email.js";
import { registerCreditFacilityRoutes } from "./modules/credit-facilities.js";
import { registerControlCenterRoutes } from "./modules/control-center.js";
import { registerCustomerProfileRoutes } from "./modules/customer-profiles.js";
import { registerDeductionRoutes } from "./modules/deductions.js";
import { registerEmailOutboundRoutes } from "./modules/email-outbound.js";
import { registerGmailIntegrationRoutes } from "./modules/email-gmail.js";
import { registerInvoiceImportRoutes } from "./modules/invoice-imports.js";
import { registerIntegrationInspectorRoutes } from "./modules/integration-inspector.js";
import { registerInvoiceIndexRoutes } from "./modules/invoices.js";
import { registerOperatorFeedbackRoutes } from "./modules/operator-feedback.js";
import { registerOperatorConsoleRoutes } from "./modules/operator-console.js";
import { registerOdooRoutes } from "./modules/odoo.js";
import { registerOutreachIntelligenceRoutes } from "./modules/outreach-intelligence.js";
import { registerPaymentRoutes } from "./modules/payments.js";
import { registerPilotReadinessRoutes } from "./modules/pilot-readiness.js";
import { registerQuickBooksRoutes } from "./modules/quickbooks.js";
import { registerRemittanceIngestionRoutes } from "./modules/remittance-ingestion.js";
import { registerRetellRoutes } from "./modules/retell/routes.js";
import { registerModules } from "./modules/register-modules.js";
import { registerSapBusinessOneRoutes } from "./modules/sap-business-one.js";
import { registerTaskRoutes } from "./modules/tasks.js";

export const buildApiApp = () => {
  const env = loadEnv();
  const db = createDatabaseClientConfig();
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });

  app.get("/health", async () => ({
    status: "ok",
    database: db.connectionString.length > 0 ? "configured" : "missing",
    modules: "registered"
  }));

  registerModules(app);
  registerAccessControlRoutes(app);
  registerAccountRoutes(app);
  registerApprovalRoutes(app);
  registerBirInvoiceReviewRoutes(app);
  registerBusinessCentralRoutes(app);
  registerCashApplicationRoutes(app);
  registerClientConnectInviteRoutes(app);
  registerCollectionsCallInboxRoutes(app);
  registerCollectionsEmailRoutes(app);
  registerCreditFacilityRoutes(app);
  registerControlCenterRoutes(app);
  registerCustomerProfileRoutes(app);
  registerDeductionRoutes(app);
  registerEmailOutboundRoutes(app);
  registerGmailIntegrationRoutes(app);
  registerInvoiceImportRoutes(app);
  registerIntegrationInspectorRoutes(app);
  registerInvoiceIndexRoutes(app);
  registerOperatorFeedbackRoutes(app);
  registerOdooRoutes(app);
  registerOperatorConsoleRoutes(app);
  registerOutreachIntelligenceRoutes(app);
  registerPilotReadinessRoutes(app);
  registerPaymentRoutes(app);
  registerRemittanceIngestionRoutes(app);
  registerRetellRoutes(app);
  registerQuickBooksRoutes(app);
  registerSapBusinessOneRoutes(app);
  registerTaskRoutes(app);

  return app;
};
