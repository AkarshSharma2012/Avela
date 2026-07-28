import type { EvidencePurpose, PortfolioFileMimeType, PortfolioItemType } from "@/types/database";

export const PORTFOLIO_ITEM_TYPES: readonly { value: PortfolioItemType; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "award", label: "Award" },
  { value: "project", label: "Project" },
  { value: "leadership", label: "Leadership" },
  { value: "volunteer_service", label: "Volunteer / Community Service" },
  { value: "work_experience", label: "Work Experience" },
  { value: "course", label: "Course" },
  { value: "certification", label: "Certification" },
  { value: "skill", label: "Skill" },
  { value: "essay_response", label: "Essay / Written Response" },
  { value: "recommendation_contact", label: "Recommendation Contact" },
  { value: "document", label: "Document" },
  { value: "link", label: "Link" },
  { value: "custom", label: "Other" },
];

export const PORTFOLIO_ITEM_TYPE_LABELS: Record<PortfolioItemType, string> = Object.fromEntries(
  PORTFOLIO_ITEM_TYPES.map((option) => [option.value, option.label])
) as Record<PortfolioItemType, string>;

export const EVIDENCE_PURPOSES: readonly { value: EvidencePurpose; label: string }[] = [
  { value: "resume", label: "Resume" },
  { value: "essay", label: "Essay" },
  { value: "recommendation", label: "Recommendation" },
  { value: "transcript", label: "Transcript" },
  { value: "award_proof", label: "Award proof" },
  { value: "project_sample", label: "Project sample" },
  { value: "eligibility_proof", label: "Eligibility proof" },
  { value: "other", label: "Other" },
];

export const EVIDENCE_PURPOSE_LABELS: Record<EvidencePurpose, string> = Object.fromEntries(
  EVIDENCE_PURPOSES.map((option) => [option.value, option.label])
) as Record<EvidencePurpose, string>;

/** File extension used only when generating a storage filename / showing a type hint — never the actual type check, which is always the MIME type. */
export const PORTFOLIO_MIME_EXTENSIONS: Record<PortfolioFileMimeType, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const ALLOWED_PORTFOLIO_MIME_TYPES: readonly PortfolioFileMimeType[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];

export const ALLOWED_PORTFOLIO_FILE_LABEL = "PDF, Word (.docx), PNG, or JPG";

/**
 * Single source of truth for the upload size limit — change here only.
 * The migration's own DB-level check (20MB) is a separate, deliberately
 * looser backstop that never has to move in lockstep with this constant —
 * see that migration's comment on portfolio_files.file_size.
 */
export const MAX_PORTFOLIO_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const STUDENT_PORTFOLIO_BUCKET = "student-portfolio";

/** Long enough to open or download a file once; short enough that a copied/leaked link goes stale quickly. */
export const PORTFOLIO_SIGNED_URL_EXPIRY_SECONDS = 60 * 5;
