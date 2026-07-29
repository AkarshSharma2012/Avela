/**
 * Creates the six temporary E2E personas (spec section 16).
 *
 *   npm run e2e:seed                 # create all 6 personas + sample items
 *   npm run e2e:seed -- --reveal     # also print credentials (never in production)
 *
 * Requires ALLOW_E2E_TEST_USERS=true — fails closed otherwise. Credentials
 * are only ever printed when --reveal is explicitly passed and
 * NODE_ENV !== "production"; by default only the (synthetic, safe) emails
 * and persona labels are printed, never a password.
 */

import { loadEnvConfig } from "@next/env";

import { seedE2ePersonas } from "../src/lib/e2e/seed";

loadEnvConfig(process.cwd());

async function main() {
  const reveal = process.argv.includes("--reveal") && process.env.NODE_ENV !== "production";

  const { seeded, errors } = await seedE2ePersonas();

  console.log(`[e2e] Seeded ${seeded.length} persona(s):`);
  for (const entry of seeded) {
    console.log(`  - ${entry.persona.label} (${entry.persona.key}): ${entry.email}${entry.sampleItemId ? " — sample item created" : ""}`);
    if (reveal) console.log(`    password: ${entry.password}`);
  }
  if (errors.length > 0) {
    console.error(`[e2e] ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[e2e] Seeding failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
