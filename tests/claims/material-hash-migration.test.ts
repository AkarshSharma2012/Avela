import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260810000000_material_hash.sql"), "utf-8");

describe("portfolio_items material-hash columns", () => {
  it("adds a nullable, sha256-length-bounded last_material_hash column", () => {
    expect(sql).toMatch(/add column if not exists last_material_hash text check \(last_material_hash is null or length\(last_material_hash\) = 64\)/);
  });

  it("adds a nullable material_hash_updated_at timestamp column", () => {
    expect(sql).toMatch(/add column if not exists material_hash_updated_at timestamptz/);
  });
});
