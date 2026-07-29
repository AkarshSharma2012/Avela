// @vitest-environment jsdom
/**
 * Milestone 10.8 universal entry flow: category, project context, and the
 * three required narrative prompts on the item creation form. Editing an
 * existing item is intentionally left untouched by this flow (matches the
 * itemType field's own "only shown on create" pattern).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortfolioItemForm } from "@/components/portfolio/portfolio-item-form";
import { createPortfolioItem } from "@/lib/portfolio/actions";
import type { PortfolioItem } from "@/types/portfolio";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/portfolio/actions", () => ({
  createPortfolioItem: vi.fn(async () => ({ itemId: "new-item" })),
  updatePortfolioItem: vi.fn(async () => ({})),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EXISTING_ITEM: PortfolioItem = {
  id: "item-1",
  user_id: "user-1",
  item_type: "activity",
  title: "Existing item",
  organization: null,
  description: null,
  start_date: null,
  end_date: null,
  is_current: false,
  hours_per_week: null,
  weeks_per_year: null,
  role: null,
  outcome: null,
  skills: [],
  tags: [],
  url: null,
  github_username: null,
  project_context: null,
  activity_category_key: null,
  template_version: 1,
  last_material_hash: null,
  material_hash_updated_at: null,
  visibility: "visible",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PortfolioItemForm — category, context, and narrative (create only)", () => {
  it("shows the category and context pickers, and the three required prompts, when creating", () => {
    render(<PortfolioItemForm />);
    expect(screen.getByLabelText(/what kind of activity or project is it/i)).toBeTruthy();
    expect(screen.getByLabelText(/what's the context/i)).toBeTruthy();
    expect(screen.getByLabelText(/what did you do or make/i)).toBeTruthy();
    expect(screen.getByLabelText(/why did you do it/i)).toBeTruthy();
    expect(screen.getByLabelText(/what part did you personally complete/i)).toBeTruthy();
  });

  it("hides the category/context/narrative fields entirely when editing an existing item", () => {
    render(<PortfolioItemForm item={EXISTING_ITEM} />);
    expect(screen.queryByLabelText(/what kind of activity or project is it/i)).toBeNull();
    expect(screen.queryByLabelText(/what did you do or make/i)).toBeNull();
  });

  it("rewords the required prompts to the go-kart wording once 'Mechanical build' is chosen", () => {
    render(<PortfolioItemForm />);
    fireEvent.change(screen.getByLabelText(/what kind of activity or project is it/i), { target: { value: "mechanical_build" } });
    expect(screen.getByLabelText(/what did you build\?/i)).toBeTruthy();
    expect(screen.getByLabelText(/why did you build it\?/i)).toBeTruthy();
  });

  it("disables the submit button until the three required prompts are filled in", () => {
    render(<PortfolioItemForm />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "My project" } });
    const submit = screen.getByRole("button", { name: /add item/i });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/what did you do or make/i), { target: { value: "Built something" } });
    fireEvent.change(screen.getByLabelText(/why did you do it/i), { target: { value: "Wanted to learn" } });
    fireEvent.change(screen.getByLabelText(/what part did you personally complete/i), { target: { value: "All of it" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("submits the category, context, and narrative together with the item fields", async () => {
    render(<PortfolioItemForm />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Go-kart" } });
    fireEvent.change(screen.getByLabelText(/what kind of activity or project is it/i), { target: { value: "mechanical_build" } });
    fireEvent.change(screen.getByLabelText(/what's the context/i), { target: { value: "personal_project" } });
    fireEvent.change(screen.getByLabelText(/what did you build\?/i), { target: { value: "A go-kart" } });
    fireEvent.change(screen.getByLabelText(/why did you build it\?/i), { target: { value: "For fun" } });
    fireEvent.change(screen.getByLabelText(/what part did you personally complete\?/i), { target: { value: "All of it" } });

    fireEvent.submit(screen.getByRole("button", { name: /add item/i }).closest("form")!);

    expect(vi.mocked(createPortfolioItem)).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Go-kart", activityCategoryKey: "mechanical_build", projectContext: "personal_project" }),
      expect.objectContaining({ whatYouDid: "A go-kart", whyYouDidIt: "For fun", yourPart: "All of it" })
    );
  });
});
