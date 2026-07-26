import { describe, expect, it } from "vitest";

import {
  extractFromHtmlMetadata,
  extractFromJsonLd,
  extractFromOpenGraph,
  isLowConfidence,
  llmAssistedExtractor,
  mergeExtractedFields,
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
});

describe("extractFromHtmlMetadata", () => {
  it("falls back to <title> at low confidence", () => {
    const result = extractFromHtmlMetadata("<title>Example Fellowship</title>");
    expect(result.title?.value).toBe("Example Fellowship");
    expect(result.title?.confidence).toBeLessThan(70);
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
