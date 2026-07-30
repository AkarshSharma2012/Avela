import { NextResponse } from "next/server";

import { evidenceIndexAdapter } from "@/lib/export/evidence-index-adapter";
import { buildExportFilename } from "@/lib/export/filename";
import { textSummaryAdapter } from "@/lib/export/text-summary-adapter";
import { getReviewLinkForReviewer } from "@/lib/review-links/actions";
import type { ExportBundle } from "@/lib/export/types";

export const dynamic = "force-dynamic";

/**
 * Plain-text export foundation (spec Part 11) — a reviewer-facing download
 * for the same review link they're already viewing. Never exposes the
 * link's token or any internal id in the filename. `?type=evidence_index`
 * selects the evidence-index adapter; anything else (including omitted)
 * uses the plain-text summary.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getReviewLinkForReviewer(token);
  if (!view) return NextResponse.json({ error: "This review link isn't available." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const bundle: ExportBundle = {
    studentDisplayName: "the student",
    title: view.title,
    items: view.items.map((item) => ({
      title: item.itemTitle,
      organization: item.organization,
      description: item.description,
      claimSupportHeadline: item.claimSupportSummary.headline,
      evidence: item.evidence.map((e) => ({ filename: e.filename, label: e.label })),
    })),
  };

  const adapter = type === "evidence_index" ? evidenceIndexAdapter : textSummaryAdapter;
  const body = adapter.generate(bundle);
  const filename = buildExportFilename(view.title, adapter.kind === "evidence_index" ? "evidence-index" : "project-overview", adapter.fileExtension);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
