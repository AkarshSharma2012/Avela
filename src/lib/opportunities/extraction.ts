export type ExtractionMethod =
  | "html_metadata"
  | "json_ld"
  | "open_graph"
  | "structured_api"
  | "llm_assisted"
  | "manual";

/**
 * Every extracted value carries its own confidence, evidence, and method —
 * never a bare value — so a low-confidence guess can never silently become
 * a "verified" fact downstream. `confidence` is 0-100; callers deciding
 * whether to trust a field for verification purposes should treat anything
 * below `LOW_CONFIDENCE_THRESHOLD` as "needs review", not "known".
 */
export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  /** The raw snippet or location this value was read from, so a human reviewer can check the source, not just trust the extractor. */
  evidence: string;
  method: ExtractionMethod;
};

export const LOW_CONFIDENCE_THRESHOLD = 70;

export function isLowConfidence(field: ExtractedField<unknown>): boolean {
  return field.value === null || field.confidence < LOW_CONFIDENCE_THRESHOLD;
}

export type ExtractedOpportunityFields = {
  title?: ExtractedField<string>;
  organization?: ExtractedField<string>;
  deadline?: ExtractedField<string>;
  grades?: ExtractedField<{ minGrade: number | null; maxGrade: number | null }>;
  format?: ExtractedField<string>;
  cost?: ExtractedField<{ costType: string; costAmount: number | null }>;
  commitment?: ExtractedField<number>;
  restrictions?: ExtractedField<string>;
  tags?: ExtractedField<string[]>;
};

function field<T>(
  value: T | null,
  confidence: number,
  evidence: string,
  method: ExtractionMethod
): ExtractedField<T> {
  return { value, confidence, evidence, method };
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  trade: "™",
  copy: "©",
  reg: "®",
};

/**
 * Decodes both named (`&amp;`, `&rsquo;`, ...) and numeric (`&#8211;`,
 * `&#x2013;`) HTML entities. Applied to every raw regex-captured
 * title/organization value before it's stored — real page `<title>`
 * tags routinely contain typographic entities (en dashes, curly quotes)
 * that a naive substring capture leaves literally as `&#8211;` in stored
 * data otherwise (confirmed on MIT MITES's real page title). An entity
 * this map doesn't recognize is left as-is rather than guessed at.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** `<title>` and `<meta name="description">` — the lowest-effort, lowest-confidence deterministic source, used only as a fallback. */
export function extractFromHtmlMetadata(html: string): ExtractedOpportunityFields {
  const result: ExtractedOpportunityFields = {};

  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (titleMatch) {
    const title = decodeHtmlEntities(titleMatch[1]).trim();
    result.title = field(title || null, title ? 55 : 0, titleMatch[0], "html_metadata");
  }

  return result;
}

/**
 * A handful of common CMS taxonomy/listing labels (`... Archive`,
 * `Category: ...`, `Tag: ...`, `Page 2 of 5`) that WordPress/Drupal-style
 * sites often leave in `og:title` on pages whose Open Graph metadata was
 * never customized for that specific page — confirmed live on
 * societyforscience.org/regeneron-sts/, whose `og:title` literally reads
 * "Regeneron STS Pages Archive" while the same page's real `<title>` tag
 * correctly says "Regeneron Science Talent Search - Society for Science".
 * A generic label like this is not "the official title... supported by
 * the page" even though `og:title` is normally a higher-confidence,
 * deliberately-authored source — so it's excluded here and the merge
 * falls through to JSON-LD/HTML-metadata instead of trusting it blindly.
 */
function looksLikeGenericArchiveLabel(title: string): boolean {
  return /\b(pages?\s+)?archives?\b|^category:|^tag:|\bpage \d+ of \d+\b/i.test(title);
}

/** `<meta property="og:...">` tags — moderate confidence, since sites populate these deliberately for link previews. */
export function extractFromOpenGraph(html: string): ExtractedOpportunityFields {
  const result: ExtractedOpportunityFields = {};

  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i.exec(html);
  if (ogTitle) {
    const title = decodeHtmlEntities(ogTitle[1]).trim();
    if (title && !looksLikeGenericArchiveLabel(title)) {
      result.title = field(title, 70, ogTitle[0], "open_graph");
    }
  }

  const ogSiteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["'][^>]*>/i.exec(
    html
  );
  if (ogSiteName) {
    const siteName = decodeHtmlEntities(ogSiteName[1]).trim();
    result.organization = field(siteName || null, 65, ogSiteName[0], "open_graph");
  }

  return result;
}

/**
 * `<script type="application/ld+json">` blocks — the highest-confidence
 * deterministic source, since it's structured data the page author
 * explicitly published for machine consumption (schema.org). Any block
 * that fails to parse is skipped rather than guessed at.
 */
export function extractFromJsonLd(html: string): ExtractedOpportunityFields {
  const result: ExtractedOpportunityFields = {};
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const record = candidate as Record<string, unknown>;

      if (!result.title && typeof record.name === "string") {
        result.title = field(decodeHtmlEntities(record.name).trim(), 90, block[1].slice(0, 300), "json_ld");
      }

      const deadline = record.applicationDeadline ?? record.validThrough;
      if (!result.deadline && typeof deadline === "string") {
        result.deadline = field(deadline, 85, block[1].slice(0, 300), "json_ld");
      }

      const provider = record.provider ?? record.organizer ?? record.hiringOrganization;
      if (!result.organization && provider) {
        const providerName =
          typeof provider === "string"
            ? provider
            : typeof (provider as Record<string, unknown>).name === "string"
              ? ((provider as Record<string, unknown>).name as string)
              : null;
        if (providerName) {
          result.organization = field(
            decodeHtmlEntities(providerName).trim(),
            90,
            block[1].slice(0, 300),
            "json_ld"
          );
        }
      }
    }
  }

  return result;
}

/**
 * Placeholder for a future LLM-assisted extraction pass. Deliberately
 * unimplemented (not wired to any model provider) — this milestone builds
 * the interface only, per the spec ("LLM-assisted extraction may suggest
 * ... later"). Any real implementation must still return `ExtractedField`s
 * with genuine per-field confidence/evidence, not a single blanket
 * confidence for the whole record.
 */
export type LlmAssistedExtractor = (rawContent: string) => Promise<ExtractedOpportunityFields>;

export const llmAssistedExtractor: LlmAssistedExtractor = async () => {
  throw new Error(
    "LLM-assisted extraction is not implemented yet — this is an interface placeholder for a future milestone."
  );
};

/**
 * Strips a raw HTML page down to plain visible text: `<script>`/`<style>`
 * blocks and semantic chrome landmarks (`<nav>`, `<header>`, `<footer>`,
 * `<aside>`) removed entirely, every remaining tag replaced with a space,
 * entities decoded (via `decodeHtmlEntities`, the same decoder
 * title/organization extraction uses — real prose is full of typographic
 * entities like `&#8217;`/`&rsquo;` this must not leave undecoded either),
 * whitespace collapsed. The chrome landmarks are stripped because
 * confirmed live on NIST's site: its `<nav>` sidebar lists sibling
 * programs ("Middle School Science Teachers...") that a naive whole-page
 * scan misread as the actual (high-school-only) SHIP program's own
 * eligibility text. Federal .gov sites are required (Section 508/WCAG) to
 * mark chrome with these semantic landmarks, so this is a reliable
 * signal, not a page-specific hack. Deliberately not a full HTML
 * parser/readability algorithm — good enough to run normalization.ts's
 * regex-based extractors against real prose, at the cost of not handling
 * nested same-tag chrome regions perfectly.
 */
export function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * Heuristically finds an "apply here"-style link in real page markup —
 * grounded in the actual fetched HTML, not a guess. Looks for an anchor
 * whose `href` or visible text mentions "apply"/"application". Medium
 * confidence: it's a real link from the page, but picking the *right*
 * one among several is still a heuristic.
 */
export function extractApplicationLinkCandidate(html: string, baseUrl: string): ExtractedField<string> {
  const anchors = html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi);
  for (const anchor of anchors) {
    const href = anchor[1];
    const text = anchor[2];
    if (/appl(y|ication)/i.test(href) || /appl(y|ication)/i.test(text)) {
      try {
        const resolved = new URL(href, baseUrl).toString();
        return field(resolved, 70, anchor[0], "html_metadata");
      } catch {
        continue;
      }
    }
  }
  return field<string>(null, 0, "", "html_metadata");
}

/** Merges extractor outputs in priority order (first non-null wins per field) — JSON-LD > Open Graph > HTML metadata, matching their relative confidence. */
export function mergeExtractedFields(
  ...results: ExtractedOpportunityFields[]
): ExtractedOpportunityFields {
  const merged: ExtractedOpportunityFields = {};
  for (const result of results) {
    for (const key of Object.keys(result) as (keyof ExtractedOpportunityFields)[]) {
      if (merged[key] === undefined && result[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each field's value type differs per key, keys are looped generically
        (merged as any)[key] = result[key];
      }
    }
  }
  return merged;
}
