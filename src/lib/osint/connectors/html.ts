/**
 * Minimal, dependency-free HTML helpers for the official-page connector.
 * Deliberately not a full HTML/DOM parser or a headless browser (spec
 * section 8: "no JavaScript execution by default," and section 1: "do not
 * build a general arbitrary web scraper") — just enough regex-based
 * extraction to pull a title, plain text, and any JSON-LD blocks out of a
 * page the student's own claim already links to.
 */

const MAX_EXTRACT_LENGTH = 20_000;

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])) {
        blocks.push(...((parsed as { "@graph": unknown[] })["@graph"]));
      } else {
        blocks.push(parsed);
      }
    } catch {
      // Malformed JSON-LD on the page — skip it, never fail the whole fetch over one bad script block.
    }
  }
  return blocks.slice(0, 20);
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1] ?? "").trim().slice(0, 300) : null;
}

export function extractPlainText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim().slice(0, MAX_EXTRACT_LENGTH);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function pageMentions(text: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return text.toLowerCase().includes(needle.trim().toLowerCase());
}
