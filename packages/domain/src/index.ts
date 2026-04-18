export * from "./shared/types.js";
export * from "./shared/state-machine.js";

export * from "./modules/accounts/schema.js";
export * from "./modules/accounts/index.js";

export * from "./modules/activity-logs/schema.js";
export * from "./modules/activity-logs/index.js";

export * from "./modules/approvals/index.js";
export * from "./modules/credit-facilities/index.js";

export * from "./modules/documents/schema.js";

export * from "./modules/integrations/index.js";
export * from "./modules/learning-layer/index.js";

export * from "./modules/invoices/schema.js";
export * from "./modules/invoices/machine.js";
export * from "./modules/invoices/index.js";

export * from "./modules/tasks/index.js";
export * from "./modules/collections/index.js";
export * from "./modules/control-center/index.js";
export * from "./modules/cash-application/index.js";
export * from "./modules/customer-profiles/index.js";
export * from "./modules/deductions/schema.js";
export * from "./modules/deductions/index.js";
export * from "./modules/payment-applications/schema.js";
export * from "./modules/payment-applications/index.js";

export * from "./modules/payments/schema.js";
export * from "./modules/payments/machine.js";
export * from "./modules/payments/index.js";

export * from "./modules/remittances/schema.js";
export * from "./modules/remittances/machine.js";
export * from "./modules/remittances/index.js";

export * from "./modules/promises-to-pay/schema.js";
export * from "./modules/promises-to-pay/machine.js";
export * from "./modules/promises-to-pay/index.js";

export * from "./modules/exceptions/schema.js";
export * from "./modules/exceptions/machine.js";
export * from "./modules/exceptions/index.js";

import { accountsModule } from "./modules/accounts/index.js";
import { activityLogsModule } from "./modules/activity-logs/index.js";
import { approvalsModule } from "./modules/approvals/index.js";
import { creditFacilitiesModule } from "./modules/credit-facilities/index.js";
import { cashApplicationModule } from "./modules/cash-application/index.js";
import { collectionsModule } from "./modules/collections/index.js";
import { controlCenterModule } from "./modules/control-center/index.js";
import { customerProfilesModule } from "./modules/customer-profiles/index.js";
import { deductionsModule } from "./modules/deductions/index.js";
import { exceptionsModule } from "./modules/exceptions/index.js";
import { integrationsModule } from "./modules/integrations/index.js";
import { learningLayerModule } from "./modules/learning-layer/index.js";
import { invoicesModule } from "./modules/invoices/index.js";
import { paymentApplicationsModule } from "./modules/payment-applications/index.js";
import { paymentsModule } from "./modules/payments/index.js";
import { promisesToPayModule } from "./modules/promises-to-pay/index.js";
import { remittancesModule } from "./modules/remittances/index.js";
import { tasksModule } from "./modules/tasks/index.js";

export const domainModules = [
  accountsModule,
  invoicesModule,
  paymentsModule,
  paymentApplicationsModule,
  remittancesModule,
  promisesToPayModule,
  exceptionsModule,
  approvalsModule,
  creditFacilitiesModule,
  activityLogsModule,
  integrationsModule,
  learningLayerModule,
  tasksModule,
  customerProfilesModule,
  deductionsModule,
  collectionsModule,
  controlCenterModule,
  cashApplicationModule
];
