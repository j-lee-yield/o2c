import { afterAll, describe, expect, it } from "vitest";
import { buildApiApp } from "./app.js";

const app = buildApiApp();

afterAll(async () => {
  await app.close();
});

describe("credit facilities API", () => {
  it("surfaces org credit line as a demo stub", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/credit_facilities",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("demo_stub");
    expect(body.loanDashboard.title).toContain("demo");
    expect(body.disclaimer).toContain("demo/stub");
    expect(body.creditFacilities[0].actionPath).toContain("/org-credit-line/demo");
  });
});
