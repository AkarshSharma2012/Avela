-- Milestone 10.8 — Universal Evidence Roles (spec section 11).
--
-- Widens portfolio_files.evidence_role (added nullable in
-- 20260809000000_personal_project_details.sql, 14 values) to the full
-- 23-value spec list, adding: research_or_notes, performance,
-- data_or_results, code_or_source, publication, official_result,
-- teacher_confirmation, coach_confirmation, possession_or_control. Same
-- drop-and-re-add-the-auto-named-constraint approach as
-- 20260813000000_activity_taxonomy_and_project_context.sql's
-- project_context widening — purely additive, no existing file's
-- evidence_role value is invalidated, nothing is backfilled.

alter table public.portfolio_files
  drop constraint if exists portfolio_files_evidence_role_check;

alter table public.portfolio_files
  add constraint portfolio_files_evidence_role_check check (
    evidence_role is null or evidence_role in (
      -- Milestone 10.7 — original fourteen.
      'concept_or_plan', 'sketch_or_draft', 'materials_or_tools', 'work_in_progress',
      'final_artifact', 'demonstration', 'reflection', 'collaborator_confirmation',
      'supervisor_confirmation', 'customer_or_recipient_confirmation', 'event_or_display',
      'receipt_or_material_record', 'process_log', 'other',
      -- Milestone 10.8 — nine additions for universal coverage.
      'research_or_notes', 'performance', 'data_or_results', 'code_or_source',
      'publication', 'official_result', 'teacher_confirmation', 'coach_confirmation',
      'possession_or_control'
    )
  );

comment on column public.portfolio_files.evidence_role is
  'What kind of evidence this file is (spec section 11) — supports authorship/process/outcome claims across every activity type, not just offline/physical work. Null = not classified.';
