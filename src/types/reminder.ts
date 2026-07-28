// Backed by public.student_reminders — see
// supabase/migrations/20260801000000_student_reminders.sql. Re-exports the
// enum types from database.ts rather than redeclaring them, so the two can
// never silently drift apart (same convention as types/application.ts).

import type { Database } from "@/types/database";

export type { ReminderSource, ReminderType } from "@/types/database";

export type StudentReminder = Database["public"]["Tables"]["student_reminders"]["Row"];

/** A reminder joined with just enough context to render it and link to what it's about — the shape reminder cards read. */
export type ReminderWithContext = StudentReminder & {
  opportunityTitle: string | null;
  applicationPlanId: string | null;
  opportunityId: string | null;
};
