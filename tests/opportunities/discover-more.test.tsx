// @vitest-environment jsdom
/**
 * Regression coverage for the "Find more opportunities" bug: the button must
 * never go dead/silent, and every FindMoreActionResult status must render an
 * honest, distinct, actionable message — never the old generic
 * "Discovery isn't available right now" catch-all for every failure mode.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoverMore } from "@/components/opportunities/discover-more";
import type { FindMoreActionResult } from "@/lib/opportunities/discovery-actions";

const findMoreAction = vi.fn<() => Promise<FindMoreActionResult>>();

vi.mock("@/lib/opportunities/discovery-actions", () => ({
  findMoreAction: () => findMoreAction(),
}));

vi.mock("@/components/opportunities/opportunity-card", () => ({
  OpportunityCard: ({ opportunity }: { opportunity: { id: string; title: string } }) => (
    <div data-testid={`card-${opportunity.id}`}>{opportunity.title}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

type FoundRecommendation = Extract<FindMoreActionResult, { ok: true }>["recommendations"][number];

function makeRecommendation(id: string): FoundRecommendation {
  return {
    opportunity: { id, title: `Opportunity ${id}` } as unknown as FoundRecommendation["opportunity"],
    matchResult: { tier: "strong_fit", reasons: [] },
    eligibilityResult: { status: "eligible", reasons: [] },
    sourceName: null,
  };
}

async function clickSearch() {
  const button = screen.getByRole("button", { name: /search for more opportunities|search again/i });
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("DiscoverMore", () => {
  it("starts in a ready-to-discover state with a live, clickable button", () => {
    render(<DiscoverMore />);
    const button = screen.getByRole("button", { name: /search for more opportunities/i });
    expect(button).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("shows a busy/progress state while pending, and disables the button", async () => {
    let resolve!: (value: FindMoreActionResult) => void;
    findMoreAction.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<DiscoverMore />);
    const button = screen.getByRole("button", { name: /search for more opportunities/i });

    await act(async () => {
      fireEvent.click(button);
    });

    // While pending, the button (and any other click target) is replaced
    // entirely by the spinner/progress region — not merely disabled — so
    // there is nothing left in the DOM a rapid second click could hit.
    expect(screen.getByText(/finding more opportunities/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /search for more opportunities/i })).toBeNull();

    await act(async () => {
      resolve({ ok: true, status: "ok", message: null, recommendations: [] });
      await Promise.resolve();
    });
  });

  it("never fires a second request while one is already in flight (rapid double-click)", async () => {
    let resolve!: (value: FindMoreActionResult) => void;
    findMoreAction.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<DiscoverMore />);
    const button = screen.getByRole("button", { name: /search for more opportunities/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(findMoreAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ ok: true, status: "ok", message: null, recommendations: [] });
      await Promise.resolve();
    });
  });

  it("renders new matches when the server finds some", async () => {
    findMoreAction.mockResolvedValue({
      ok: true,
      status: "ok",
      message: "Found 1 new match.",
      recommendations: [makeRecommendation("new-1")],
    });

    render(<DiscoverMore />);
    await clickSearch();

    expect(await screen.findByText("Found 1 new match.")).toBeTruthy();
    expect(screen.getByTestId("card-new-1")).toBeTruthy();
  });

  it("shows an honest 'no new matches' message with a saved-matches action, not a dead end", async () => {
    findMoreAction.mockResolvedValue({
      ok: true,
      status: "no_strong_matches",
      message: "I searched for more, but I couldn't verify any additional strong matches right now.",
      recommendations: [],
    });

    render(<DiscoverMore />);
    await clickSearch();

    expect(await screen.findByText(/couldn't verify any additional strong matches/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view saved matches/i })).toBeTruthy();
    // The button must still be live for a real retry, not disabled forever.
    expect(screen.getByRole("button", { name: /search again/i }).hasAttribute("disabled")).toBe(false);
  });

  it("shows a distinct profile_incomplete state with an 'Improve profile' action", async () => {
    findMoreAction.mockResolvedValue({
      ok: true,
      status: "profile_incomplete",
      message: "Add a few interests or goals to your profile so I know what kinds of opportunities to look for.",
      recommendations: [],
    });

    render(<DiscoverMore />);
    await clickSearch();

    expect(await screen.findByText(/add a few interests or goals/i)).toBeTruthy();
    const profileLink = screen.getByRole("link", { name: /improve profile/i });
    expect(profileLink.getAttribute("href")).toBe("/profile");
  });

  it("shows a retryable temporary-problem state for source_failure_total, never the old dead generic message", async () => {
    findMoreAction.mockResolvedValue({
      ok: true,
      status: "source_failure_total",
      message: "Searching new sources isn't working right now — please try again in a bit.",
      recommendations: [],
    });

    render(<DiscoverMore />);
    await clickSearch();

    expect(await screen.findByText(/isn't working right now/i)).toBeTruthy();
    const retryButton = screen.getByRole("button", { name: /search again/i });
    expect(retryButton.hasAttribute("disabled")).toBe(false);
  });

  it("surfaces an ok:false action failure with a real retry, not a silently dead button", async () => {
    findMoreAction.mockResolvedValue({ ok: false, message: "Something went wrong while searching for more opportunities — please try again." });

    render(<DiscoverMore />);
    await clickSearch();

    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /search again/i }).hasAttribute("disabled")).toBe(false);
  });

  it("retrying after a failure calls the action again and can succeed", async () => {
    findMoreAction
      .mockResolvedValueOnce({ ok: false, message: "Something went wrong — please try again." })
      .mockResolvedValueOnce({
        ok: true,
        status: "ok",
        message: "Found 1 new match.",
        recommendations: [makeRecommendation("retry-1")],
      });

    render(<DiscoverMore />);
    await clickSearch();
    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();

    await clickSearch();
    expect(await screen.findByText("Found 1 new match.")).toBeTruthy();
    expect(findMoreAction).toHaveBeenCalledTimes(2);
  });
});
