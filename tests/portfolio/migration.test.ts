import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(__dirname, "../../supabase/migrations/20260802000000_student_portfolio.sql");

const sql = readFileSync(MIGRATION_PATH, "utf-8");

function policyOperationsByTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?for (select|insert|update|delete)`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function policiesForTable(source: string, table: string): string[] {
  const pattern = new RegExp(`create policy[^;]*?on public\\.${table}[^;]*?;`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

describe("portfolio_items — shape", () => {
  it("constrains item_type to the fourteen documented values", () => {
    const types = [
      "activity",
      "award",
      "project",
      "leadership",
      "volunteer_service",
      "work_experience",
      "course",
      "certification",
      "skill",
      "essay_response",
      "recommendation_contact",
      "document",
      "link",
      "custom",
    ];
    const check = sql.match(/item_type text not null check \(([\s\S]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const type of types) {
      expect(check?.[1]).toContain(`'${type}'`);
    }
  });

  it("constrains visibility to visible/archived, defaulting to visible", () => {
    expect(sql).toMatch(/visibility text not null default 'visible' check \(visibility in \('visible', 'archived'\)\)/);
  });

  it("prevents an item from being both 'still doing this' and having a fixed end date", () => {
    expect(sql).toMatch(/constraint portfolio_items_current_no_end check \(not is_current or end_date is null\)/);
  });

  it("requires end_date to be on or after start_date when both are set", () => {
    expect(sql).toMatch(/constraint portfolio_items_date_order check/);
  });

  it("foreign-keys to auth.users with cascade delete", () => {
    expect(sql).toMatch(/portfolio_items[\s\S]*?user_id uuid not null references auth\.users\(id\) on delete cascade/);
  });

  it("indexes by user, by (user, item_type), by (user, visibility), and tags via GIN", () => {
    expect(sql).toMatch(/create index if not exists portfolio_items_user_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_items_user_type_idx\s+on public\.portfolio_items \(user_id, item_type\);/);
    expect(sql).toMatch(/create index if not exists portfolio_items_user_visibility_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_items_tags_idx\s+on public\.portfolio_items using gin \(tags\);/);
  });

  it("wires an updated_at trigger using the shared set_updated_at function", () => {
    expect(sql).toMatch(/create trigger portfolio_items_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\);/);
  });
});

describe("portfolio_items — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.portfolio_items enable row level security;/);
  });

  it("grants full select/insert/update/delete, every policy scoped to auth.uid() = user_id", () => {
    const operations = policyOperationsByTable(sql, "portfolio_items").sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);
    for (const policy of policiesForTable(sql, "portfolio_items")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });
});

describe("portfolio_files — shape", () => {
  it("allows a null portfolio_item_id (an unfiled file) but cascades when set", () => {
    expect(sql).toMatch(/portfolio_item_id uuid references public\.portfolio_items\(id\) on delete cascade/);
  });

  it("constrains mime_type to the four allowed types", () => {
    const check = sql.match(/mime_type text not null check \(\s*mime_type in \(([\s\S]*?)\)\s*\)/);
    expect(check).not.toBeNull();
    expect(check?.[1]).toContain("application/pdf");
    expect(check?.[1]).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(check?.[1]).toContain("image/png");
    expect(check?.[1]).toContain("image/jpeg");
  });

  it("bounds file_size to a positive value under a generous hard ceiling", () => {
    expect(sql).toMatch(/file_size integer not null check \(file_size > 0 and file_size <= 20971520\)/);
  });

  it("indexes by user and by portfolio item", () => {
    expect(sql).toMatch(/create index if not exists portfolio_files_user_idx/);
    expect(sql).toMatch(/create index if not exists portfolio_files_item_idx/);
  });
});

describe("portfolio_files — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.portfolio_files enable row level security;/);
  });

  it("grants full select/insert/update/delete, every policy scoped to auth.uid() = user_id", () => {
    const operations = policyOperationsByTable(sql, "portfolio_files").sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);
    for (const policy of policiesForTable(sql, "portfolio_files")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("insert/update reverify a non-null portfolio_item_id belongs to the same student", () => {
    const insertPolicy = sql.match(/create policy "Users can attach files to their own portfolio items"[\s\S]*?;/);
    const updatePolicy = sql.match(/create policy "Users can update their own portfolio files"[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(updatePolicy).not.toBeNull();
    expect(insertPolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.portfolio_items pi/);
    expect(updatePolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.portfolio_items pi/);
  });
});

describe("application_evidence_links — shape", () => {
  it("constrains evidence_purpose to the eight documented values", () => {
    const purposes = [
      "resume",
      "essay",
      "recommendation",
      "transcript",
      "award_proof",
      "project_sample",
      "eligibility_proof",
      "other",
    ];
    const check = sql.match(/evidence_purpose text not null check \(([\s\S]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const purpose of purposes) {
      expect(check?.[1]).toContain(`'${purpose}'`);
    }
  });

  it("requires exactly one link per (application_plan, portfolio_item, evidence_purpose)", () => {
    expect(sql).toMatch(/unique \(application_plan_id, portfolio_item_id, evidence_purpose\)/);
  });

  it("foreign-keys to application_plans and portfolio_items with cascade delete", () => {
    expect(sql).toMatch(/application_plan_id uuid not null references public\.application_plans\(id\) on delete cascade/);
    expect(sql).toMatch(/portfolio_item_id uuid not null references public\.portfolio_items\(id\) on delete cascade/);
  });
});

describe("application_evidence_links — RLS", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.application_evidence_links enable row level security;/);
  });

  it("grants select/insert/delete (no update), every policy scoped to auth.uid() = user_id", () => {
    const operations = policyOperationsByTable(sql, "application_evidence_links").sort();
    expect(operations).toEqual(["delete", "insert", "select"]);
    for (const policy of policiesForTable(sql, "application_evidence_links")) {
      expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    }
  });

  it("insert reverifies both the application plan and the portfolio item belong to the same student", () => {
    const insertPolicy = sql.match(/create policy "Users can attach evidence to their own applications"[\s\S]*?;/);
    expect(insertPolicy).not.toBeNull();
    expect(insertPolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.application_plans p/);
    expect(insertPolicy?.[0]).toMatch(/exists \(\s*select 1 from public\.portfolio_items pi/);
  });
});

describe("student-portfolio storage bucket", () => {
  it("is created as private with a file size limit and mime allowlist", () => {
    expect(sql).toMatch(/insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/);
    expect(sql).toMatch(/'student-portfolio',\s*\n\s*'student-portfolio',\s*\n\s*false,/);
    expect(sql).toMatch(/public = false/);
  });

  it("scopes every storage.objects policy to the bucket and the caller's own uid-prefixed folder", () => {
    const objectPolicies = [...sql.matchAll(/create policy[^;]*?on storage\.objects[^;]*?;/gi)].map((match) => match[0]);
    expect(objectPolicies.length).toBe(4);
    for (const policy of objectPolicies) {
      expect(policy).toMatch(/bucket_id = 'student-portfolio'/);
      expect(policy).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
    }
  });

  it("grants storage access to exactly select/insert/update/delete — never to the anon role", () => {
    const objectPolicies = [...sql.matchAll(/create policy[^;]*?on storage\.objects[^;]*?;/gi)].map((match) => match[0]);
    const operations = objectPolicies
      .map((policy) => policy.match(/for (select|insert|update|delete)/i)?.[1]?.toLowerCase())
      .filter((op): op is string => Boolean(op))
      .sort();
    expect(operations).toEqual(["delete", "insert", "select", "update"]);
    for (const policy of objectPolicies) {
      expect(policy).not.toMatch(/to anon/i);
      expect(policy).toMatch(/to authenticated/i);
    }
  });
});
