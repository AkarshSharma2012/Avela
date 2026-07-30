import { describe, expect, it } from "vitest";

import { responseStatusToDimensionStatus } from "@/lib/confirmations/dimension-mapping";
import { getConfirmationRequestForReviewer } from "@/lib/confirmations/actions";

describe("responseStatusToDimensionStatus", () => {
  it("maps can_confirm to externally_confirmed — a real third-party human response is allowed to confirm, unlike AI", () => {
    expect(responseStatusToDimensionStatus("can_confirm")).toBe("externally_confirmed");
  });

  it("maps mostly_accurate to strongly_supported, never externally_confirmed", () => {
    expect(responseStatusToDimensionStatus("mostly_accurate")).toBe("strongly_supported");
  });

  it("maps can_confirm_participation_only to partially_supported", () => {
    expect(responseStatusToDimensionStatus("can_confirm_participation_only")).toBe("partially_supported");
  });

  it("never downgrades a dimension on cannot_verify — not knowing something is not evidence against it", () => {
    expect(responseStatusToDimensionStatus("cannot_verify")).toBeNull();
  });
});

describe("getConfirmationRequestForReviewer — fails closed on an obviously invalid token", () => {
  it("returns null for an empty token without touching the database", async () => {
    expect(await getConfirmationRequestForReviewer("")).toBeNull();
  });

  it("returns null for a too-short token without touching the database", async () => {
    expect(await getConfirmationRequestForReviewer("short")).toBeNull();
  });
});
