// @vitest-environment jsdom
/**
 * Milestone 10.10B2A — same accessible-success-state pattern as
 * verifier-response-form.test.tsx, applied to the sibling reviewer flow
 * (/confirm/[token]). See docs/audit-10.10b1/accessibility-defects.md
 * defect #1: this form's success message had no role/aria-live and left
 * focus on <body>.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationResponseForm } from "@/components/confirmations/confirmation-response-form";

const submitConfirmationResponseAction = vi.fn();

vi.mock("@/lib/confirmations/actions", () => ({
  submitConfirmationResponseAction: (...args: unknown[]) => submitConfirmationResponseAction(...args),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ConfirmationResponseForm — success state accessibility and focus", () => {
  it("does not show any success state or move focus before submission", () => {
    render(<ConfirmationResponseForm token="tok" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("on a successful response, renders a role=status success container with a heading, and moves focus to it", async () => {
    submitConfirmationResponseAction.mockResolvedValue({ success: true });
    render(<ConfirmationResponseForm token="tok" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I can confirm this" }));
    });

    const status = await screen.findByRole("status");
    expect(status.querySelector("h2")).not.toBeNull();
    expect(status.textContent).toContain("Response recorded");
    expect(status.textContent).toContain("Thanks — your response has been recorded.");
    expect(document.activeElement).toBe(status);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("never shows the success state or moves focus when the server action reports failure", async () => {
    submitConfirmationResponseAction.mockResolvedValue({ success: false, error: "This confirmation has already been submitted." });
    render(<ConfirmationResponseForm token="tok" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I cannot verify this" }));
    });

    expect(screen.queryByRole("status")).toBeNull();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("already been submitted");
    // The success container never mounts on a failed response, so the
    // focus-move asserted for the success case above never fires either.
    expect(screen.queryByRole("status")).toBeNull();
  });
});
