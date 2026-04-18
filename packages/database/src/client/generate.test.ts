import { describe, expect, it } from "vitest";
import {
  buildSchemaSnapshot,
  renderSchemaSnapshotModule
} from "./generate.js";

describe("database client generation", () => {
  it("builds a schema snapshot from the current database schema", () => {
    const snapshot = buildSchemaSnapshot();

    expect(snapshot.version).toBe("v1");
    expect(snapshot.tables.payment_application).toBeDefined();
    expect(snapshot.tables.invoice).toEqual(
      expect.arrayContaining([
        "branch_id",
        "invoice_contact_id",
        "invoice_date",
        "collectible_amount_cents",
        "disputed_amount_cents"
      ])
    );
    expect(snapshot.tables.imported_invoice_snapshot).toBeDefined();
    expect(snapshot.tables.uploaded_document_processing_record).toBeDefined();
    expect(snapshot.tables.remittance_processing_record).toBeDefined();
    expect(snapshot.tables.learning_event).toBeDefined();
    expect(snapshot.tables.communication_attempt).toBeDefined();
    expect(snapshot.enums.payment_application_state).toEqual(["proposed", "applied", "reversed"]);
  });

  it("renders a deterministic TypeScript module", () => {
    const moduleSource = renderSchemaSnapshotModule(buildSchemaSnapshot(), "2026-03-29T00:00:00.000Z");

    expect(moduleSource).toContain('export const generatedAt = "2026-03-29T00:00:00.000Z";');
    expect(moduleSource).toContain('"version": "v1"');
    expect(moduleSource).toContain('"payment_application": [');
    expect(moduleSource).toContain('"learning_event": [');
    expect(moduleSource).toContain('"communication_attempt": [');
    expect(moduleSource).toContain('"payment_application_state"');
  });
});
