// Backed by public.portfolio_items / public.portfolio_files /
// public.application_evidence_links — see
// supabase/migrations/20260802000000_student_portfolio.sql. Re-exports enum
// types from database.ts rather than redeclaring them (same convention as
// types/application.ts and types/reminder.ts).

import type { Database } from "@/types/database";

export type {
  EvidencePurpose,
  PortfolioFileMimeType,
  PortfolioItemType,
  PortfolioItemVisibility,
} from "@/types/database";

export type PortfolioItem = Database["public"]["Tables"]["portfolio_items"]["Row"];

export type PortfolioFile = Database["public"]["Tables"]["portfolio_files"]["Row"];

export type ApplicationEvidenceLink = Database["public"]["Tables"]["application_evidence_links"]["Row"];

export type PortfolioEntryNarrative = Database["public"]["Tables"]["portfolio_entry_narrative"]["Row"];

export type PortfolioTeamDetails = Database["public"]["Tables"]["portfolio_team_details"]["Row"];

export type PortfolioTeamCollaborator = Database["public"]["Tables"]["portfolio_team_collaborators"]["Row"];

/** A portfolio item with its attached files — the shape the item workspace page reads. */
export type PortfolioItemWithFiles = PortfolioItem & {
  files: PortfolioFile[];
};

/** An evidence link joined with just enough of its portfolio item to render an attached-evidence row without a second round trip per link. */
export type EvidenceLinkWithItem = ApplicationEvidenceLink & {
  item: PortfolioItem;
};
