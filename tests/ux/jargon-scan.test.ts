import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec section 12: "technical terms such as OSINT, RDAP, SPF, DMARC,
 * hashes, fuzzy matching, or OAuth scopes never appear in student-facing
 * copy." This is a rule about visible text, not internal naming — Milestone
 * 10.6 already has well-established, tested module/component names like
 * `OsintCheckPanel` and `osint-support-badge.tsx`, and this test must never
 * demand renaming working code to satisfy a literal-minded scan. So rather
 * than scanning whole files, this extracts only what a student could
 * actually read: quoted string literals and JSX text nodes — never tag
 * names, prop names, type names, function names, or import paths.
 * Reviewer-only surfaces are excluded outright, since this rule is about
 * what a *student* sees, not internal tooling.
 */

const JARGON_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "OSINT", pattern: /osint/i },
  { label: "RDAP", pattern: /\brdap\b/i },
  { label: "SPF", pattern: /\bspf\b/i },
  { label: "DMARC", pattern: /\bdmarc\b/i },
  { label: "hash/hashes", pattern: /\bhash(es)?\b/i },
  { label: "fuzzy matching", pattern: /fuzzy match/i },
  { label: "OAuth scope(s)", pattern: /oauth scope/i },
];

const REVIEWER_ONLY_PATH_SEGMENTS = ["/review/", "osint-reviewer", "reviewer-decision", "reviewer-auth"];

/** No glob library needed — Node's own recursive readdir is enough to collect every .tsx file under a directory. */
function listTsxFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsxFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripImportsAndComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const STRING_LITERAL_PATTERN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const JSX_TEXT_NODE_PATTERN = />([^<>{}]+)</g;

/** Structural/non-visible attributes (ids, hrefs, class names, react keys, data-* hooks, etc.) — their values are never rendered as copy a student reads, so the whole attr="value" token is dropped before extraction rather than being mistaken for visible text. */
const NON_VISIBLE_ATTR_PATTERN =
  /\b(?:id|href|className|class|key|data-[\w-]+|src|role|rel|htmlFor|name|type|target|method|action|aria-labelledby|aria-describedby|for)\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})/g;

/** Only what a student could actually read: JSX text nodes and quoted string literals in visible-ish props (label/placeholder/aria-label/alt/title/value) — never tag names, prop names, type names, function names, or structural attribute values. */
function extractUserFacingText(source: string): string {
  const withoutStructuralAttrs = source.replace(NON_VISIBLE_ATTR_PATTERN, "");
  const stringLiterals = withoutStructuralAttrs.match(STRING_LITERAL_PATTERN) ?? [];
  const jsxTextNodes = [...withoutStructuralAttrs.matchAll(JSX_TEXT_NODE_PATTERN)].map((match) => match[1]!).filter((text) => text.trim().length > 0);
  return [...stringLiterals, ...jsxTextNodes].join(" \n ");
}

describe("student-facing UI is free of technical/OSINT jargon", () => {
  const root = path.resolve(__dirname, "../../src");
  const files = [...listTsxFilesRecursive(path.join(root, "components")), ...listTsxFilesRecursive(path.join(root, "app"))];

  const studentFacingFiles = files.filter((file) => !REVIEWER_ONLY_PATH_SEGMENTS.some((segment) => file.replace(/\\/g, "/").includes(segment)));

  expect(studentFacingFiles.length).toBeGreaterThan(0);

  it.each(studentFacingFiles.map((file) => [path.relative(root, file), file] as const))("%s", (_relative, file) => {
    const source = stripImportsAndComments(readFileSync(file, "utf-8"));
    const visibleText = extractUserFacingText(source);
    for (const { label, pattern } of JARGON_PATTERNS) {
      expect(pattern.test(visibleText), `${label} found in visible text of ${_relative}`).toBe(false);
    }
  });
});
