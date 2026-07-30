import { describe, expect, it } from "vitest";

import { getReviewLinkForReviewer } from "@/lib/review-links/actions";

describe("getReviewLinkForReviewer — fails closed on an obviously invalid token", () => {
  it("returns null for an empty token without touching the database", async () => {
    expect(await getReviewLinkForReviewer("")).toBeNull();
  });

  it("returns null for a too-short token without touching the database", async () => {
    expect(await getReviewLinkForReviewer("short")).toBeNull();
  });
});
