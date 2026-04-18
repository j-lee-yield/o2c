export type JobDefinition = {
  name: string;
  queue: string;
  description: string;
};

export const jobRegistry: JobDefinition[] = [
  {
    name: "integration-sync",
    queue: "integrations",
    description: "Runs connector sync batches per tenant."
  },
  {
    name: "workflow-dispatch",
    queue: "workflow",
    description: "Dispatches long-running orchestration steps."
  },
  {
    name: "collections-follow-up",
    queue: "collections",
    description: "Schedules downstream outreach and reminders."
  },
  {
    name: "deductions-upload-hook",
    queue: "deductions",
    description: "Converts upload ingestion outcomes into deduction workspace cases."
  },
  {
    name: "deductions-ap-portal-hook",
    queue: "deductions",
    description: "Projects AP portal jobs into deduction claims and support bundles."
  },
  {
    name: "learning-profile-recompute",
    queue: "learning",
    description: "Recomputes explainable customer behavior profiles from persisted history."
  },
  {
    name: "pilot-writeback-dispatch",
    queue: "integrations",
    description: "Pushes staged pilot ERP writebacks for the demo runtime."
  }
];
