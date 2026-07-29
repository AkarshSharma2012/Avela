import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec section 13: Agent-Reach must never actually be installed as a
 * dependency of this repository — only the adapter *interface* exists.
 * This is a permanent regression guard, not a one-time check.
 */

function listSourceFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFilesRecursive(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Agent-Reach is never actually installed", () => {
  it("package.json has no panniantong/agent-reach dependency of any kind", () => {
    const packageJson = readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8");
    const parsed = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
    const suspiciousDeps = Object.keys(allDeps).filter((name) => /panniantong|agent-reach/i.test(name));
    expect(suspiciousDeps).toEqual([]);
  });

  it("no source file imports an npm package named panniantong or agent-reach (local @/lib/research/agent-reach-provider aliases are fine — that's our own adapter file, not a package)", () => {
    const src = path.resolve(__dirname, "../../src");
    const npmPackageImportPattern = /(?:from\s+|require\()\s*["'](?!\.|@\/)([^"']*(?:panniantong|agent-reach)[^"']*)["']/gi;

    const offenders: string[] = [];
    for (const file of listSourceFilesRecursive(src)) {
      const content = readFileSync(file, "utf-8");
      if (npmPackageImportPattern.test(content)) {
        offenders.push(path.relative(src, file));
      }
      npmPackageImportPattern.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });

  it("never imports node's child_process module anywhere under src/lib/research — no subprocess is ever spawned by this adapter", () => {
    const researchDir = path.resolve(__dirname, "../../src/lib/research");
    // Matches only an actual import/require of the module (the unambiguous
    // signal of subprocess capability) — never a coincidental substring like
    // RegExp.prototype.exec(), which every JS file legitimately uses.
    const childProcessImportPattern = /from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\)/;
    for (const file of listSourceFilesRecursive(researchDir)) {
      const content = readFileSync(file, "utf-8");
      expect(childProcessImportPattern.test(content), `child_process import found in ${path.relative(researchDir, file)}`).toBe(false);
    }
  });
});
