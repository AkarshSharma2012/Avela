// @vitest-environment jsdom
/**
 * Milestone 10.10B2A — accessibility regression coverage for the
 * verifier-facing success state on /verify/[token]. The B1 audit found the
 * success message was rendered with no `role`/`aria-live` (never announced
 * to assistive technology) and left focus on `<body>` (defect #1 and the
 * primary goal's focus-loss item). This pins: a clear heading, `role`
 * status semantics, and focus landing on the success container — only
 * after a real successful submission, never on mount and never on error.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifierResponseForm } from "@/components/verification/verifier-response-form";

const confirmVerifierClaim = vi.fn();
const declineVerifierClaim = vi.fn();
const requestCorrectionFromVerifier = vi.fn();

vi.mock("@/lib/verification/actions", () => ({
  confirmVerifierClaim: (...args: unknown[]) => confirmVerifierClaim(...args),
  declineVerifierClaim: (...args: unknown[]) => declineVerifierClaim(...args),
  requestCorrectionFromVerifier: (...args: unknown[]) => requestCorrectionFromVerifier(...args),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("VerifierResponseForm — success state accessibility and focus", () => {
  it("does not show any success state or move focus before submission", () => {
    render(<VerifierResponseForm token="tok" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("on successful confirmation, renders a role=status success container with a heading and concise text, and moves focus to it", async () => {
    confirmVerifierClaim.mockResolvedValue({});
    render(<VerifierResponseForm token="tok" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, this is accurate" }));
    });

    const status = await screen.findByRole("status");
    expect(status.querySelector("h2")).not.toBeNull();
    expect(status.textContent).toContain("Response recorded");
    expect(status.textContent).toContain("Thanks — your confirmation has been recorded.");

    // Focus moved to the success container, not left on <body> or the
    // (now-unmounted) button.
    expect(document.activeElement).toBe(status);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("on decline, renders the decline-specific message inside the same accessible success pattern", async () => {
    declineVerifierClaim.mockResolvedValue({});
    render(<VerifierResponseForm token="tok" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I can't confirm this" }));
    });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Thanks for letting us know — this has been flagged for a closer look.");
    expect(document.activeElement).toBe(status);
  });

  it("on a successful correction request, renders the correction-specific message and moves focus there", async () => {
    requestCorrectionFromVerifier.mockResolvedValue({});
    render(<VerifierResponseForm token="tok" />);

    fireEvent.click(screen.getByRole("button", { name: "Something needs fixing" }));
    const textarea = screen.getByLabelText("What should be corrected?");
    fireEvent.change(textarea, { target: { value: "Wrong dates." } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send note" }));
    });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Thanks — your note has been sent back to the student.");
    expect(document.activeElement).toBe(status);
  });

  it("never shows the success state or moves focus when the server action returns an error", async () => {
    confirmVerifierClaim.mockResolvedValue({ error: "This verification link isn't valid, or has already been used." });
    render(<VerifierResponseForm token="tok" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, this is accurate" }));
    });

    expect(screen.queryByRole("status")).toBeNull();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn't valid");
    // The success container never mounts on an error, so focus-move to it
    // (asserted for the success cases above) never fires either — an error
    // must never trigger the success announcement/focus path.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is fully keyboard-operable: tabbing to the confirm button and activating it with Enter submits and reaches the announced success state", async () => {
    confirmVerifierClaim.mockResolvedValue({});
    const user = userEvent.setup();
    render(<VerifierResponseForm token="tok" />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Yes, this is accurate" }));

    await user.keyboard("{Enter}");

    const status = await screen.findByRole("status");
    expect(document.activeElement).toBe(status);
  });
});
