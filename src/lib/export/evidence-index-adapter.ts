import type { ExportAdapter, ExportBundle } from "@/lib/export/types";

/** A flat evidence index (spec Part 11) — one line per artifact across every included item, for a reviewer who wants a checklist rather than the full narrative. */
export const evidenceIndexAdapter: ExportAdapter = {
  kind: "evidence_index",
  fileExtension: "txt",
  generate(bundle: ExportBundle): string {
    const lines: string[] = [`Evidence index — ${bundle.title}`, ""];

    for (const item of bundle.items) {
      if (item.evidence.length === 0) continue;
      lines.push(item.title);
      for (const evidence of item.evidence) {
        lines.push(`  - ${evidence.label ?? evidence.filename}`);
      }
      lines.push("");
    }

    if (lines.length === 2) lines.push("No evidence was included with this export.");

    return lines.join("\n").trimEnd() + "\n";
  },
};
