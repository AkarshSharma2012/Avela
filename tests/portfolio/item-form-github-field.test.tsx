// @vitest-environment jsdom
/**
 * Milestone 10.7 UI redesign: the manual GitHub username field on the item
 * Details form must read as a plain, optional, secondary field — visually
 * smaller than the connected-account card in the support wizard, with copy
 * that never implies typing a username proves ownership.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortfolioItemForm } from "@/components/portfolio/portfolio-item-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/portfolio/actions", () => ({
  createPortfolioItem: vi.fn(),
  updatePortfolioItem: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("PortfolioItemForm — manual GitHub username field", () => {
  it("uses the exact never-verifies-ownership helper copy from the spec", () => {
    render(<PortfolioItemForm />);
    expect(
      screen.getByText("Optional — used only to help find public repositories. It does not verify account ownership.")
    ).toBeTruthy();
  });

  it("is styled smaller/secondary rather than as a primary control", () => {
    render(<PortfolioItemForm />);
    const label = screen.getByText("GitHub username (optional)");
    expect(label.className).toContain("text-xs");
    expect(label.className).toContain("text-muted-foreground");

    const input = screen.getByPlaceholderText("yourusername");
    expect(input.className).toContain("h-8");
  });
});
