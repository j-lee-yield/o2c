import { describe, expect, it } from "vitest";
import { buildSeedTasks } from "./tasks.js";

describe("task seed bundle", () => {
  it("covers each first-class task surface and status set", () => {
    const tasks = buildSeedTasks();

    expect(tasks.some((task) => task.surfaces.includes("home"))).toBe(true);
    expect(tasks.some((task) => task.surfaces.includes("customers"))).toBe(true);
    expect(tasks.some((task) => task.surfaces.includes("collections"))).toBe(true);
    expect(tasks.some((task) => task.surfaces.includes("cash_app"))).toBe(true);
    expect(tasks.some((task) => task.surfaces.includes("deductions"))).toBe(true);
    expect(tasks.some((task) => task.surfaces.includes("org_credit_line"))).toBe(true);

    expect(tasks.some((task) => task.status === "open")).toBe(true);
    expect(tasks.some((task) => task.status === "completed")).toBe(true);
    expect(tasks.some((task) => task.status === "closed")).toBe(true);
    expect(tasks.some((task) => task.status === "dismissed")).toBe(true);

    expect(tasks.every((task) => task.sourceLinks.length > 0)).toBe(true);
  });
});
