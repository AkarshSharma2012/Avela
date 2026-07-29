// @vitest-environment jsdom
/**
 * Milestone 10.7 UI redesign: behavioral coverage for the guided support
 * wizard (PortfolioSupportSection) that replaced the old all-at-once
 * Verification/Public sources sections. Heavy sub-steps (GithubStep,
 * EvidenceStep, LinkStep, VerifierStep, VerificationPanel, OsintCheckPanel)
 * are stubbed out here — they each pull in real server actions — so these
 * tests stay focused on the wizard shell's own behavior: step visibility,
 * navigation, persistence across leaving/returning, and that verification
 * stays optional. Each stubbed step still renders the props it was given,
 * so "irrelevant fields stay hidden" can be asserted from the outside. No
 * jest-dom matchers here — plain DOM/vitest assertions only, so this test
 * doesn't need any shared vitest.config setupFiles change.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortfolioSupportSection } from "@/components/verification/portfolio-support-section";
import type { ClaimSupportSummary } from "@/lib/claims/rollup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/verification/wizard/github-step", () => ({
  GithubStep: () => <div data-testid="step-content">connect-account-step</div>,
}));
vi.mock("@/components/verification/wizard/generic-profile-challenge-step", () => ({
  GenericProfileChallengeStep: ({ provider }: { provider: { studentFacingName: string } }) => (
    <div data-testid="step-content">connect-account-step:{provider.studentFacingName}</div>
  ),
}));
vi.mock("@/components/verification/wizard/evidence-step", () => ({
  EvidenceStep: ({ initialAnswers }: { initialAnswers: { whatYouMade: string } }) => (
    <div data-testid="step-content">add-files-step:{initialAnswers.whatYouMade || "(empty)"}</div>
  ),
}));
vi.mock("@/components/verification/wizard/link-step", () => ({
  LinkStep: () => <div data-testid="step-content">add-link-step</div>,
}));
vi.mock("@/components/verification/wizard/verifier-step", () => ({
  VerifierStep: () => <div data-testid="step-content">ask-confirm-step</div>,
}));
vi.mock("@/components/verification/verification-panel", () => ({
  VerificationPanel: () => <div data-testid="verification-panel">verification-panel</div>,
}));
vi.mock("@/components/portfolio/osint/osint-check-panel", () => ({
  OsintCheckPanel: () => <div data-testid="osint-panel">osint-panel</div>,
}));

const NOT_YET_SUPPORTED_SUMMARY: ClaimSupportSummary = {
  level: "not_yet_supported",
  headline: "Not yet supported",
  checkedCount: 0,
  totalCount: 3,
  rows: [
    { dimension: "project_or_activity_exists", label: "Project found", status: "not_checked", statusLabel: "Not checked", stale: false },
    { dimension: "identity_control", label: "Your identity", status: "not_checked", statusLabel: "Not checked", stale: false },
    { dimension: "impact_or_outcome", label: "Impact or outcome", status: "not_checked", statusLabel: "Not checked", stale: false },
  ],
};

// useWizardState caches the last-read persisted state per item id at module
// scope (see use-wizard-state.ts) so a real remount doesn't re-read
// sessionStorage needlessly. That means each test needs its own item id —
// otherwise a later test would see the previous test's in-memory cache
// instead of a clean sessionStorage read, independent of the beforeEach clear.
let currentItemId = "item-0";

function baseProps(overrides: Partial<React.ComponentProps<typeof PortfolioSupportSection>> = {}) {
  return {
    item: { id: currentItemId, title: "Robotics Club", role: null, activity_category_key: "coding" },
    files: [],
    verification: null,
    requestStatus: "not_requested" as const,
    claimSupportSummary: NOT_YET_SUPPORTED_SUMMARY,
    osintCheck: null,
    osintEligible: true,
    githubIdentity: null,
    githubConnectAvailable: true,
    personalProjectAnswers: { whatYouMade: "", whyYouMadeIt: "", yourPart: "" },
    ...overrides,
  };
}

function openWizard() {
  fireEvent.click(screen.getByRole("button", { name: /support this entry/i }));
}

let idCounter = 0;

beforeEach(() => {
  sessionStorage.clear();
  currentItemId = `item-${idCounter++}`;
});

afterEach(() => {
  cleanup();
});

describe("PortfolioSupportSection — guided wizard", () => {
  it("keeps the wizard closed until 'Support this entry' is clicked, and shows one main card per step", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    expect(screen.queryByText(/step 1 of 4/i)).toBeNull();

    openWizard();
    expect(screen.getByText(/step 1 of 4/i)).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: /choose a support method/i })).toBeTruthy();
  });

  it("shows only the chosen method's Step 2 content — never more than one at a time", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();

    fireEvent.click(screen.getByRole("radio", { name: /add a public link/i }));

    expect(screen.getByText(/step 2 of 4/i)).toBeTruthy();
    const stepContents = screen.getAllByTestId("step-content");
    expect(stepContents).toHaveLength(1);
    expect(stepContents[0]!.textContent).toContain("add-link-step");
    // The other three methods' content must never be rendered alongside it.
    expect(screen.queryByText("connect-account-step")).toBeNull();
    expect(screen.queryByText("ask-confirm-step")).toBeNull();
  });

  it("supports Back and Continue navigation between steps", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();
    fireEvent.click(screen.getByRole("radio", { name: /ask someone to confirm/i }));
    expect(screen.getByText(/step 2 of 4/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByText(/step 3 of 4/i)).toBeTruthy();
    expect(screen.getByText(/review what you've added/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByText(/step 2 of 4/i)).toBeTruthy();
    expect(screen.getByTestId("step-content").textContent).toContain("ask-confirm-step");
  });

  it("'Do this later' closes the wizard without requiring any method — verification stays optional", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();
    expect(screen.getByText(/step 1 of 4/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /do this later/i }));

    expect(screen.queryByText(/step 1 of 4/i)).toBeNull();
    // Closing the wizard never blocks anything else on the page — the compact card is still there
    // (the same headline also appears inside the collapsed advanced-details breakdown, hence getAllBy).
    expect(screen.getAllByText(/support level: not yet supported/i).length).toBeGreaterThan(0);
  });

  it("remembers step and method across leaving and returning to the item (sessionStorage)", () => {
    const { unmount } = render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();
    fireEvent.click(screen.getByRole("radio", { name: /add photos or files/i }));
    expect(screen.getByText(/step 2 of 4/i)).toBeTruthy();
    unmount();

    // Re-mounting simulates navigating away and back to the same item.
    render(<PortfolioSupportSection {...baseProps()} />);
    expect(screen.getByText(/step 2 of 4/i)).toBeTruthy();
    expect(screen.getByTestId("step-content").textContent).toContain("add-files-step");
  });

  it("carries previously saved answers through when a step is revisited", () => {
    const { unmount } = render(
      <PortfolioSupportSection {...baseProps({ personalProjectAnswers: { whatYouMade: "A trebuchet", whyYouMadeIt: "", yourPart: "" } })} />
    );
    openWizard();
    fireEvent.click(screen.getByRole("radio", { name: /add photos or files/i }));
    expect(screen.getByTestId("step-content").textContent).toContain("A trebuchet");

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByTestId("step-content").textContent).toContain("A trebuchet");
    unmount();
  });

  it("never offers 'Connect an account' for a category with no relevant provider (e.g. family responsibility)", () => {
    render(<PortfolioSupportSection {...baseProps({ item: { id: currentItemId, title: "Helping at home", role: null, activity_category_key: "family_responsibility" } })} />);
    openWizard();
    expect(screen.queryByRole("radio", { name: /connect an account/i })).toBeNull();
    // The rest of the methods stay available — family/home work is never blocked from support entirely.
    expect(screen.getByRole("radio", { name: /add photos or files/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /show my process/i })).toBeTruthy();
  });

  it("offers 'Connect an account' for a category with a relevant, connectable provider (e.g. painting)", () => {
    render(<PortfolioSupportSection {...baseProps({ item: { id: currentItemId, title: "A watercolor series", role: null, activity_category_key: "painting" } })} />);
    openWizard();
    expect(screen.getByRole("radio", { name: /connect an account/i })).toBeTruthy();
  });

  it("routes 'Connect an account' to the generic (non-GitHub) challenge step for a non-coding category", () => {
    render(<PortfolioSupportSection {...baseProps({ item: { id: currentItemId, title: "A watercolor series", role: null, activity_category_key: "painting" } })} />);
    openWizard();
    fireEvent.click(screen.getByRole("radio", { name: /connect an account/i }));
    expect(screen.getByTestId("step-content").textContent).toContain("connect-account-step:");
    expect(screen.queryByText("connect-account-step")).toBeNull(); // never the GitHub step for this category
  });

  it("'Show my process' reuses the same evidence step as 'Add photos or files' rather than a duplicate component", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();
    fireEvent.click(screen.getByRole("radio", { name: /show my process/i }));
    expect(screen.getByTestId("step-content").textContent).toContain("add-files-step");
  });

  it("shows the connected GitHub account as a distinct visual card, separate from the manual username field", async () => {
    const { GithubConnectedCard } = await import("@/components/verification/wizard/github-connected-card");
    render(
      <GithubConnectedCard
        identity={{
          id: "id-1",
          user_id: "u-1",
          provider: "github",
          provider_subject: "123",
          provider_username: "octostudent",
          provider_profile_url: "https://github.com/octostudent",
          display_name: null,
          avatar_url: null,
          granted_scopes: [],
          verified_at: "2026-01-01T00:00:00.000Z",
          last_checked_at: null,
          disconnected_at: null,
          metadata: {},
          created_at: "",
          updated_at: "",
        }}
      />
    );
    expect(screen.getByText("@octostudent")).toBeTruthy();
    expect(screen.getByText(/connected/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view profile/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeTruthy();
  });

  it("keeps the advanced verification details collapsed by default", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    const details = document.getElementById("advanced-verification-details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText(/see verification details/i)).toBeTruthy();
  });

  it("opens the advanced details section from the compact card's 'See details' button", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /see details/i }));
    const details = document.getElementById("advanced-verification-details") as HTMLDetailsElement;
    expect(details.open).toBe(true);
  });

  it("hides the public-source step content for item types that aren't eligible for it", () => {
    render(<PortfolioSupportSection {...baseProps({ osintEligible: false })} />);
    expect(screen.queryByTestId("osint-panel")).toBeNull();
  });

  it("uses 'Improve support' instead of 'Support this entry' once something has been checked", () => {
    render(
      <PortfolioSupportSection
        {...baseProps({
          claimSupportSummary: { ...NOT_YET_SUPPORTED_SUMMARY, checkedCount: 1, headline: "Some support", level: "some_support" },
        })}
      />
    );
    expect(screen.getByRole("button", { name: /improve support/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^support this entry$/i })).toBeNull();
  });

  it("uses responsive, single-column-first classes so the method cards never force horizontal overflow on small screens", () => {
    render(<PortfolioSupportSection {...baseProps()} />);
    openWizard();
    const radiogroup = screen.getByRole("radiogroup", { name: /choose a support method/i });
    expect(radiogroup.className).toContain("grid-cols-1");
    expect(radiogroup.className).toMatch(/sm:grid-cols-2/);
  });
});
