import { describe, expect, it } from "vitest";

import { suggestStarterTasks } from "@/lib/applications/constants";

describe("suggestStarterTasks", () => {
  it("gives every opportunity type the same universal steps", () => {
    const club = suggestStarterTasks("club");
    const titles = club.map((task) => task.title);
    expect(titles).toContain("Review eligibility");
    expect(titles).toContain("Read the official requirements");
    expect(titles).toContain("Collect required documents");
    expect(titles).toContain("Review your application");
    expect(titles).toContain("Submit your application");
  });

  it("does not claim every opportunity needs every task — a light type gets fewer suggestions than a heavy one", () => {
    const club = suggestStarterTasks("club");
    const research = suggestStarterTasks("research");
    expect(club.length).toBeLessThan(research.length);
    expect(club.map((task) => task.title)).not.toContain("Prepare your resume");
    expect(club.map((task) => task.title)).not.toContain("Request a recommendation");
  });

  it("includes the type-typical prep tasks for a research program", () => {
    const titles = suggestStarterTasks("research").map((task) => task.title);
    expect(titles).toContain("Prepare your resume");
    expect(titles).toContain("Request a recommendation");
    expect(titles).toContain("Draft your essay or response");
    expect(titles).toContain("Prepare for an interview");
  });

  it("lets a known per-listing flag override the type default", () => {
    // Scholarships default to requiring an essay...
    const defaultTitles = suggestStarterTasks("scholarship").map((task) => task.title);
    expect(defaultTitles).toContain("Draft your essay or response");

    // ...but a listing that's confirmed not to need one shouldn't suggest drafting it.
    const overriddenTitles = suggestStarterTasks("scholarship", { essayRequired: false }).map((task) => task.title);
    expect(overriddenTitles).not.toContain("Draft your essay or response");
  });

  it("adds a recommendation task when a listing confirms it's required, even for a type that doesn't default to one", () => {
    const titles = suggestStarterTasks("internship", { recommendationRequired: true }).map((task) => task.title);
    expect(titles).toContain("Request a recommendation");
  });

  it("always keeps eligibility/requirements first and submission last", () => {
    const tasks = suggestStarterTasks("summer_program");
    expect(tasks[0].title).toBe("Review eligibility");
    expect(tasks[1].title).toBe("Read the official requirements");
    expect(tasks[tasks.length - 1].title).toBe("Submit your application");
  });
});
