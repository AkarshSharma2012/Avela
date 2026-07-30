import type { Metadata } from "next";

import { GuidedCaptureFlow } from "@/components/portfolio/capture/guided-capture-flow";
import { requireProfile } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Add to your portfolio — Avela" };

/**
 * Milestone 10.9 — the default entry point for creating a portfolio item
 * (spec Part 1/2), replacing the raw long-form as the first thing a
 * student sees. The classic form is still reachable — see
 * AddItemPanel's "Use the classic form instead" link — for students who
 * prefer typing everything directly; it is simply no longer the default.
 */
export default async function NewPortfolioItemPage() {
  await requireProfile();
  return <GuidedCaptureFlow />;
}
