import { describe, expect, it } from "vitest";
import {
  canonicalObjectNames,
  canonicalSchemaVersion,
  canonicalSourceMappings,
  canonicalStagingRecordNames,
  listCanonicalSourceMappings
} from "./schema.js";

describe("canonical schema manifest", () => {
  it("locks the shared schema as v1", () => {
    expect(canonicalSchemaVersion).toBe("v1");
    expect(canonicalObjectNames).toContain("invoice");
    expect(canonicalObjectNames).toContain("payment");
    expect(canonicalStagingRecordNames).toContain("imported_invoice_snapshot");
  });

  it("declares a canonical mapping path for every currently supported incoming source", () => {
    expect(canonicalSourceMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceKey: "business_central.invoice", targetObject: "invoice" }),
        expect.objectContaining({ sourceKey: "spreadsheet_upload.invoice", targetObject: "invoice" }),
        expect.objectContaining({ sourceKey: "yield.bir_invoice", targetObject: "invoice" }),
        expect.objectContaining({ sourceKey: "yield.remittance", targetObject: "remittance" }),
        expect.objectContaining({ sourceKey: "perfios.bank_statement", targetObject: "payment" })
      ])
    );
  });

  it("returns detached copies of the mapping manifest", () => {
    const mappings = listCanonicalSourceMappings();
    mappings[0]!.notes = "changed";

    expect(canonicalSourceMappings[0]!.notes).not.toBe("changed");
  });
});
