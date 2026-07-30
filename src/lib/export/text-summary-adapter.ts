import type { ExportAdapter, ExportBundle } from "@/lib/export/types";

/** Plain-text activity summary (spec Part 11) — the most universally-acceptable format; every application system that accepts a resume/activity list can consume this. */
export const textSummaryAdapter: ExportAdapter = {
  kind: "text_summary",
  fileExtension: "txt",
  generate(bundle: ExportBundle): string {
    const lines: string[] = [bundle.title, `Prepared by ${bundle.studentDisplayName} via Avela`, ""];

    for (const item of bundle.items) {
      lines.push(item.title);
      if (item.organization) lines.push(item.organization);
      if (item.description) lines.push(item.description);
      lines.push(`Support level: ${item.claimSupportHeadline}`);
      lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
  },
};
