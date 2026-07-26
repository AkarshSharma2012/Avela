import { describe, expect, it } from "vitest";

import {
  decodeHtmlEntities,
  extractFromHtmlMetadata,
  extractFromJsonLd,
  extractFromOpenGraph,
  isLowConfidence,
  llmAssistedExtractor,
  mergeExtractedFields,
  stripHtmlToText,
} from "@/lib/opportunities/extraction";

describe("extractFromJsonLd", () => {
  it("extracts title, organization, and deadline from a JSON-LD block", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
        { "@type": "EducationalOccupationalProgram", "name": "Example Fellowship", "provider": { "name": "Example Foundation" }, "applicationDeadline": "2027-03-15" }
      </script>
      </head></html>
    `;
    const result = extractFromJsonLd(html);
    expect(result.title?.value).toBe("Example Fellowship");
    expect(result.organization?.value).toBe("Example Foundation");
    expect(result.deadline?.value).toBe("2027-03-15");
    expect(result.title?.method).toBe("json_ld");
    expect(result.title?.evidence.length).toBeGreaterThan(0);
  });

  it("skips a malformed JSON-LD block rather than throwing", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>`;
    expect(() => extractFromJsonLd(html)).not.toThrow();
    expect(extractFromJsonLd(html).title).toBeUndefined();
  });
});

describe("extractFromOpenGraph", () => {
  it("extracts title and site name from meta tags", () => {
    const html = `<meta property="og:title" content="Example Fellowship" /><meta property="og:site_name" content="Example Foundation" />`;
    const result = extractFromOpenGraph(html);
    expect(result.title?.value).toBe("Example Fellowship");
    expect(result.organization?.value).toBe("Example Foundation");
    expect(result.title?.method).toBe("open_graph");
  });

  it("ignores a generic CMS archive/taxonomy label instead of trusting it as the real title (regression: societyforscience.org/regeneron-sts/'s og:title literally says 'Regeneron STS Pages Archive')", () => {
    const result = extractFromOpenGraph('<meta property="og:title" content="Regeneron STS Pages Archive" />');
    expect(result.title).toBeUndefined();
  });

  it("still trusts a legitimate og:title that merely mentions a real program", () => {
    const result = extractFromOpenGraph('<meta property="og:title" content="Summer Research Program" />');
    expect(result.title?.value).toBe("Summer Research Program");
  });
});

describe("extractFromHtmlMetadata", () => {
  it("falls back to <title> at low confidence", () => {
    const result = extractFromHtmlMetadata("<title>Example Fellowship</title>");
    expect(result.title?.value).toBe("Example Fellowship");
    expect(result.title?.confidence).toBeLessThan(70);
  });

  it("decodes HTML entities in the page title instead of storing them literally (regression: MIT MITES's real title contains an undecoded en dash)", () => {
    const result = extractFromHtmlMetadata(
      "<title>Mites &#8211; MIT Introduction to Technology, Engineering and Science</title>"
    );
    expect(result.title?.value).toBe("Mites – MIT Introduction to Technology, Engineering and Science");
    expect(result.title?.value).not.toContain("&#8211;");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    expect(decodeHtmlEntities("Fish &amp; Wildlife")).toBe("Fish & Wildlife");
    expect(decodeHtmlEntities("Students&rsquo; Program")).toBe("Students’ Program");
  });

  it("decodes decimal and hex numeric entities", () => {
    expect(decodeHtmlEntities("Mites &#8211; MIT")).toBe("Mites – MIT");
    expect(decodeHtmlEntities("Mites &#x2013; MIT")).toBe("Mites – MIT");
  });

  it("leaves an unrecognized entity-shaped string as-is rather than guessing", () => {
    expect(decodeHtmlEntities("Ben &notarealentity; Jerry")).toBe("Ben &notarealentity; Jerry");
  });

  it("leaves plain text with no entities unchanged", () => {
    expect(decodeHtmlEntities("Plain Program Title")).toBe("Plain Program Title");
  });
});

describe("stripHtmlToText — entity decoding", () => {
  it("decodes typographic entities in body text, not just <title>", () => {
    const text = stripHtmlToText("<p>Applicants&rsquo; deadline is March 15 &#8211; apply now.</p>");
    expect(text).toContain("Applicants’ deadline is March 15 – apply now.");
  });
});

describe("isLowConfidence", () => {
  it("flags a null value as low confidence regardless of the number", () => {
    expect(isLowConfidence({ value: null, confidence: 95, evidence: "", method: "manual" })).toBe(
      true
    );
  });

  it("flags anything below the threshold", () => {
    expect(isLowConfidence({ value: "x", confidence: 50, evidence: "", method: "manual" })).toBe(
      true
    );
    expect(isLowConfidence({ value: "x", confidence: 90, evidence: "", method: "manual" })).toBe(
      false
    );
  });
});

describe("mergeExtractedFields", () => {
  it("prefers the first non-null value per field, in priority order", () => {
    const jsonLd = extractFromJsonLd(
      '<script type="application/ld+json">{"name":"From JSON-LD"}</script>'
    );
    const openGraph = extractFromOpenGraph('<meta property="og:title" content="From OG" />');
    const merged = mergeExtractedFields(jsonLd, openGraph);
    expect(merged.title?.value).toBe("From JSON-LD");
  });
});

describe("llmAssistedExtractor", () => {
  it("is an unimplemented placeholder, not a silent fabrication", async () => {
    await expect(llmAssistedExtractor("some content")).rejects.toThrow();
  });
});
