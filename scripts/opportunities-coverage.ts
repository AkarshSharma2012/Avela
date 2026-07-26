/**
 * Internal catalog-coverage report (Milestone 7 spec section 10) — read
 * only, service-role, never exposed to students. Prints counts by type,
 * format, cost, grade, interest tag, and verification label, plus a list
 * of gaps (e.g. "no Grade 8 options") for whoever is deciding which
 * sources to add next. Not analytics shown to students anywhere in the
 * app.
 *
 * Usage:
 *   npm run opportunities:coverage
 */

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { computeCoverageReport, formatCoverageReport } from "../src/lib/opportunities/coverage";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it) — see docs/security.md."
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await supabase.from("opportunities").select("*").eq("is_active", true).eq("is_sample", false);
  if (error) {
    console.error("[coverage] failed to load opportunities:", error.message);
    process.exitCode = 1;
    return;
  }

  const report = computeCoverageReport(data ?? []);
  console.log(formatCoverageReport(report));
}

main();
