// Backed by public.application_plans / public.application_tasks — see
// supabase/migrations/20260731000000_application_plans.sql. Re-exports the
// enum type from database.ts rather than redeclaring it, so the two can
// never silently drift apart.

import type { Database } from "@/types/database";

export type { ApplicationPlanStatus } from "@/types/database";

export type ApplicationPlan = Database["public"]["Tables"]["application_plans"]["Row"];

export type ApplicationTask = Database["public"]["Tables"]["application_tasks"]["Row"];

/** An application plan joined with its opportunity and task checklist — the shape the workspace page and Application Center read. */
export type ApplicationPlanWithDetails = ApplicationPlan & {
  opportunity: import("@/types/opportunity").Opportunity;
  tasks: ApplicationTask[];
};
