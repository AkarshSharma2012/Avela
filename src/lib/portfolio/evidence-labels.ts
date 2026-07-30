/**
 * Plain-language translations of the honest-but-internal evidence lifecycle
 * enums (src/types/database.ts) — the raw enum values (e.g.
 * "unsupported_for_automatic_analysis") were previously shown verbatim to
 * students (see draft-card.tsx's old `e.extractionStatus.replace(/_/g, " ")`)
 * even though the codebase's own comment on `PortfolioFileExtractionStatus`
 * insists these are "first-class states, never hidden" — the fix is a
 * friendlier label, not hiding the state. Every enum member is covered so a
 * lookup here can never fall through to `undefined`.
 */

import {
  Award,
  BookOpen,
  Building2,
  Camera,
  CircleDashed,
  FileText,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Link2,
  Music,
  Paperclip,
  PenLine,
  ShieldCheck,
  UserCheck,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { PortfolioFileExtractionStatus, PortfolioFileSourceKind, PortfolioFileVisibility } from "@/types/database";

export const EXTRACTION_STATUS_LABELS: Record<PortfolioFileExtractionStatus, string> = {
  received: "Received",
  stored: "Saved",
  extraction_pending: "Reviewing",
  readable: "Read successfully",
  partially_readable: "Partly read",
  unsupported_for_automatic_analysis: "Saved for manual review",
  relevant: "Relevant to this item",
  irrelevant: "Not relevant to this item",
  supports_claim: "Supports your claim",
  independently_confirmed: "Confirmed by source",
  needs_review: "Needs a closer look",
  extraction_failed: "Couldn't be read — saved anyway",
  metadata_only: "Basic details found",
};

export const SOURCE_KIND_LABELS: Record<PortfolioFileSourceKind, string> = {
  public_url: "Public link",
  private_url: "Private link",
  git_repository: "Code repository",
  live_website: "Live website",
  image: "Image",
  screenshot: "Screenshot",
  process_image: "Process photo",
  pdf: "PDF",
  plain_text: "Written note",
  document: "Document",
  presentation: "Presentation",
  certificate: "Certificate",
  competition_result: "Competition result",
  official_result_page: "Official result page",
  audio_link: "Audio link",
  video_link: "Video link",
  audio_upload: "Audio file",
  video_upload: "Video file",
  design_file: "Design file",
  prototype_file: "Prototype file",
  research_paper: "Research paper",
  research_poster: "Research poster",
  publication: "Publication",
  school_page: "School page",
  organization_page: "Organization page",
  portfolio_page: "Portfolio page",
  recommendation: "Recommendation",
  reviewer_confirmation: "Reviewer confirmation",
  email_confirmation: "Email confirmation",
  student_explanation: "Your explanation",
  possession_challenge: "Ownership check",
  manual_offline: "Offline evidence",
  unknown: "Evidence",
};

export const SOURCE_KIND_ICON: Record<PortfolioFileSourceKind, LucideIcon> = {
  public_url: Link2,
  private_url: Link2,
  git_repository: GitBranch,
  live_website: Globe,
  image: ImageIcon,
  screenshot: ImageIcon,
  process_image: Camera,
  pdf: FileText,
  plain_text: PenLine,
  document: FileText,
  presentation: FileText,
  certificate: Award,
  competition_result: Award,
  official_result_page: Award,
  audio_link: Music,
  video_link: Video,
  audio_upload: Music,
  video_upload: Video,
  design_file: FileText,
  prototype_file: FileText,
  research_paper: BookOpen,
  research_poster: BookOpen,
  publication: BookOpen,
  school_page: Building2,
  organization_page: Building2,
  portfolio_page: Globe,
  recommendation: UserCheck,
  reviewer_confirmation: UserCheck,
  email_confirmation: UserCheck,
  student_explanation: PenLine,
  possession_challenge: ShieldCheck,
  manual_offline: Paperclip,
  unknown: CircleDashed,
};

export const VISIBILITY_LABEL: Record<PortfolioFileVisibility, string> = {
  private: "Private",
  summary_only: "Summary only",
  shared: "Shared",
};

/** Never throws — an unrecognized status string (e.g. a draft-time `DetectedEvidence.extractionStatus`, which is typed as a loose `string`) falls back to a title-cased version of itself rather than `undefined`. */
export function friendlyExtractionStatus(status: string): string {
  if (status in EXTRACTION_STATUS_LABELS) return EXTRACTION_STATUS_LABELS[status as PortfolioFileExtractionStatus];
  return status.replace(/_/g, " ");
}
