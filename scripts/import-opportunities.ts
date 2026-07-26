/**
 * Admin-only import path for real opportunities — the "safe server-side
 * script" required by Milestone 4. Never exposed through any Next.js
 * route, Server Action, or client-reachable API: it only runs from a
 * developer/admin's own machine or CI, using the Supabase service-role
 * key, which bypasses `opportunities`' RLS (no client-facing policy grants
 * insert/update/delete — see the Milestone 4 migration).
 *
 * Usage:
 *   node scripts/import-opportunities.ts path/to/opportunities.json
 *
 * The input is a JSON array of objects shaped like `public.opportunities`
 * (camelCase not accepted — use the exact column names). `id` is optional;
 * include it to update an existing row, omit it to insert a new one. Every
 * record is validated before anything is written — if any record fails
 * validation, nothing is imported. `is_sample` is not accepted from the
 * input file: this path is for real opportunities, never sample/demo data
 * (that's `supabase/seed.sql`'s job, and the two are kept deliberately
 * separate — see docs/database.md).
 *
 * Example record:
 *   {
 *     "title": "Summer Coding Bootcamp",
 *     "organization": "Example Foundation",
 *     "description": "A two-week intro to web development.",
 *     "opportunity_type": "summer_program",
 *     "format": "virtual",
 *     "remote_allowed": true,
 *     "cost_type": "free",
 *     "interest_tags": ["Computer Science"],
 *     "application_url": "https://example.org/apply",
 *     "is_verified": true
 *   }
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (never NEXT_PUBLIC_ —
 * see docs/security.md). Node 22+ runs this file directly with no build
 * step (native TypeScript support), so no extra dependency was added just
 * for this script.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// @next/env is published as CommonJS; import its default and destructure,
// rather than a named import, so this runs under Node's ESM loader.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

// Relative import, not the "@/" alias: this file runs directly via
// `node scripts/import-opportunities.ts` (Node's native TS support), not
// through Next.js's bundler, so tsconfig path aliases aren't resolved here.
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

const OPPORTUNITY_TYPES = [
  "internship",
  "competition",
  "volunteer",
  "summer_program",
  "research",
  "scholarship",
  "club",
] as const;

const OPPORTUNITY_FORMATS = ["virtual", "in_person", "hybrid"] as const;
const OPPORTUNITY_COST_TYPES = ["free", "paid"] as const;

const INTEREST_TAGS = [
  "Business", "Entrepreneurship", "Technology", "Computer Science",
  "Engineering", "Medicine", "Public Health", "Psychology", "Law",
  "Government", "Environmental Science", "Biology", "Mathematics",
  "Writing", "Journalism", "Visual Arts", "Music", "Theater",
  "Filmmaking", "Sports", "Education", "Community Service", "Finance",
  "Design",
] as const;

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

const isoDateString = z.string().refine(isValidDate, "Must be a valid date string");

const opportunityImportSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    organization: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    opportunity_type: z.enum(OPPORTUNITY_TYPES),
    format: z.enum(OPPORTUNITY_FORMATS),
    location_text: z.string().trim().max(200).nullable().optional(),
    remote_allowed: z.boolean().default(false),
    min_grade: z.number().int().min(6).max(12).nullable().optional(),
    max_grade: z.number().int().min(6).max(12).nullable().optional(),
    cost_type: z.enum(OPPORTUNITY_COST_TYPES),
    cost_amount: z.number().min(0).nullable().optional(),
    interest_tags: z.array(z.enum(INTEREST_TAGS)).default([]),
    application_deadline: isoDateString.nullable().optional(),
    start_date: isoDateString.nullable().optional(),
    end_date: isoDateString.nullable().optional(),
    weekly_commitment_hours: z.number().positive().nullable().optional(),
    duration_text: z.string().trim().max(200).nullable().optional(),
    application_url: z.string().url(),
    source_url: z.string().url().nullable().optional(),
    image_url: z.string().url().nullable().optional(),
    is_active: z.boolean().default(true),
    is_verified: z.boolean().default(false),
  })
  .refine(
    (record) =>
      record.min_grade == null || record.max_grade == null || record.max_grade >= record.min_grade,
    { message: "max_grade must be >= min_grade", path: ["max_grade"] }
  );

const importFileSchema = z.array(opportunityImportSchema).min(1, "Import file must contain at least one record");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/import-opportunities.ts <path-to-file.json>");
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it) — see docs/security.md."
    );
    process.exitCode = 1;
    return;
  }

  const raw = readFileSync(path.resolve(filePath), "utf-8");
  const parsed = importFileSchema.safeParse(JSON.parse(raw));

  if (!parsed.success) {
    console.error(`Validation failed — nothing was imported. ${parsed.error.issues.length} issue(s):`);
    for (const issue of parsed.error.issues) {
      console.error(`  [record ${String(issue.path[0])}] ${issue.path.slice(1).join(".")}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Every optional field is normalized to an explicit `null` (rather than
  // an absent key) so every record in a batch has the exact same set of
  // keys — PostgREST's bulk insert/upsert requires that, or it rejects the
  // whole batch. `id` is handled separately: it's the one field that must
  // stay *absent* (not null) for new rows, so the database can generate it.
  const normalized = parsed.data.map((record) => ({
    id: record.id,
    title: record.title,
    organization: record.organization,
    description: record.description,
    opportunity_type: record.opportunity_type,
    format: record.format,
    location_text: record.location_text ?? null,
    remote_allowed: record.remote_allowed,
    min_grade: record.min_grade ?? null,
    max_grade: record.max_grade ?? null,
    cost_type: record.cost_type,
    cost_amount: record.cost_amount ?? null,
    interest_tags: record.interest_tags,
    application_deadline: record.application_deadline ?? null,
    start_date: record.start_date ?? null,
    end_date: record.end_date ?? null,
    weekly_commitment_hours: record.weekly_commitment_hours ?? null,
    duration_text: record.duration_text ?? null,
    application_url: record.application_url,
    source_url: record.source_url ?? null,
    image_url: record.image_url ?? null,
    is_active: record.is_active,
    is_verified: record.is_verified,
    is_sample: false as const,
  }));

  const toUpsert = normalized.filter(
    (record): record is typeof record & { id: string } => record.id !== undefined
  );
  const toInsert = normalized
    .filter((record) => record.id === undefined)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit `id` from `rest`
    .map(({ id, ...rest }) => rest);

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const imported: { id: string; title: string }[] = [];

  if (toInsert.length > 0) {
    const { data, error } = await supabase.from("opportunities").insert(toInsert).select("id, title");
    if (error) {
      console.error("Import failed while inserting new records:", error.message);
      process.exitCode = 1;
      return;
    }
    imported.push(...(data ?? []));
  }

  if (toUpsert.length > 0) {
    const { data, error } = await supabase
      .from("opportunities")
      .upsert(toUpsert, { onConflict: "id" })
      .select("id, title");
    if (error) {
      console.error("Import failed while upserting existing records:", error.message);
      process.exitCode = 1;
      return;
    }
    imported.push(...(data ?? []));
  }

  console.log(`Imported ${imported.length} opportunity row(s):`);
  for (const row of imported) {
    console.log(`  - ${row.title} (${row.id})`);
  }
}

main();
