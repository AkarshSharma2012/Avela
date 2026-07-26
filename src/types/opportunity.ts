// Frontend-only shape for Milestone 4's opportunity data — no `opportunities`
// table exists yet, so this is not generated from `src/types/database.ts`.
// Field choices mirror the filter categories called for in the Opportunities
// page: type, format, location, grade eligibility, cost, deadline, commitment.

export type OpportunityType =
  | "internship"
  | "competition"
  | "volunteer"
  | "summer_program"
  | "research"
  | "scholarship"
  | "club";

export type OpportunityFormat = "virtual" | "in_person" | "hybrid";

export type OpportunityCost = "free" | "paid";

export type OpportunityCommitment = "short_term" | "year_round" | "summer";

export type Opportunity = {
  id: string;
  title: string;
  organization: string;
  description: string;
  type: OpportunityType;
  format: OpportunityFormat;
  location: string | null;
  minGradeLevel: number | null;
  maxGradeLevel: number | null;
  cost: OpportunityCost;
  deadline: string | null;
  commitment: OpportunityCommitment;
};
