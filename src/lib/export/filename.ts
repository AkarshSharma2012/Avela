/**
 * Professional, predictable export filenames (spec Part 11) — never an
 * internal id, secret token, or database key. Deterministic given the
 * same (name, kind) pair, so two exports of the same thing produce the
 * same filename rather than a random one.
 */

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

export function buildExportFilename(subject: string, kind: "project-overview" | "evidence-index" | "demo-links", extension: string): string {
  return `${slugify(subject)}_${kind}.${extension}`;
}
