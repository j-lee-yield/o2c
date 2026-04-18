import type { SeedScenario } from "@o2c/contracts";
import type {
  AccountBehaviorProfile,
  BillingAccount,
  Branch,
  CallOutcome,
  ChannelBehaviorProfile,
  CommunicationAttempt,
  ContactBehaviorProfile,
  CustomerInvoice,
  EmailOutcome,
  LearningEvent,
  NextBestActionScore,
  OperatorFeedback,
  ParentAccount,
  Payment,
  PromiseToPay,
  Task,
  SmsOutcome,
  UploadedDocument,
} from "@o2c/domain";
import { buildPilotDemoCatalog } from "./pilot-demo.js";
import { buildLearningLayerSeedBundle } from "./fixtures/learning-layer.js";
import { buildSeedTasks } from "./fixtures/tasks.js";

export type DemoSeedBundle = {
  scenario: SeedScenario;
  parentAccounts: ParentAccount[];
  billingAccounts: BillingAccount[];
  branches: Branch[];
  invoices: CustomerInvoice[];
  payments: Payment[];
  uploadedDocuments: UploadedDocument[];
  promisesToPay: PromiseToPay[];
  tasks: Task[];
  communicationAttempts: CommunicationAttempt[];
  channelBehaviorProfiles: ChannelBehaviorProfile[];
  emailOutcomes: EmailOutcome[];
  smsOutcomes: SmsOutcome[];
  callOutcomes: CallOutcome[];
  learningEvents: LearningEvent[];
  accountBehaviorProfiles: AccountBehaviorProfile[];
  contactBehaviorProfiles: ContactBehaviorProfile[];
  operatorFeedback: OperatorFeedback[];
  nextBestActionScores: NextBestActionScore[];
};

export function buildDemoSeedBundle(): DemoSeedBundle {
  const catalog = buildPilotDemoCatalog();
  const learning = buildLearningLayerSeedBundle();

  return {
    scenario: catalog.scenario,
    parentAccounts: catalog.parentAccounts,
    billingAccounts: catalog.billingAccounts,
    branches: catalog.branches,
    invoices: catalog.invoices,
    payments: catalog.payments,
    uploadedDocuments: catalog.uploadedDocuments,
    promisesToPay: catalog.promisesToPay,
    tasks: buildSeedTasks(),
    communicationAttempts: learning.communicationAttempts,
    channelBehaviorProfiles: learning.channelBehaviorProfiles,
    emailOutcomes: learning.emailOutcomes,
    smsOutcomes: learning.smsOutcomes,
    callOutcomes: learning.callOutcomes,
    learningEvents: learning.learningEvents,
    accountBehaviorProfiles: learning.accountBehaviorProfiles,
    contactBehaviorProfiles: learning.contactBehaviorProfiles,
    operatorFeedback: learning.operatorFeedback,
    nextBestActionScores: learning.nextBestActionScores,
  };
}

export * from "./pilot-demo.js";
export * from "./pilot-readiness.js";
export * from "./pilot-runtime.js";
export * from "./fixtures/bir-invoice-ingestion.js";
export * from "./fixtures/learning-layer.js";
export * from "./fixtures/tasks.js";
