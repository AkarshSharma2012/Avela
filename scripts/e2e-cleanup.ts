/**
 * Removes every E2E-marked account (spec section 16).
 *
 *   npm run e2e:cleanup -- --dry-run   # list what would be removed, change nothing
 *   npm run e2e:cleanup                # actually remove them
 *
 * Requires ALLOW_E2E_TEST_USERS=true — fails closed otherwise. Idempotent:
 * running this a second time in a row finds nothing left and exits cleanly.
 */

import { loadEnvConfig } from "@next/env";

import { cleanupE2ePersonas } from "../src/lib/e2e/cleanup";

loadEnvConfig(process.cwd());

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { candidates, deleted, errors } = await cleanupE2ePersonas({ dryRun });

  if (dryRun) {
    console.log(`[e2e] Dry run — ${candidates.length} account(s) would be removed:`);
    for (const candidate of candidates) console.log(`  - ${candidate.email}`);
  } else {
    console.log(`[e2e] Removed ${deleted.length} of ${candidates.length} matched account(s).`);
    for (const candidate of deleted) console.log(`  - ${candidate.email}`);
  }

  if (errors.length > 0) {
    console.error(`[e2e] ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[e2e] Cleanup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
