import { EvidenceFilePicker } from "@/components/verification/evidence-file-picker";
import { PersonalProjectForm } from "@/components/verification/wizard/personal-project-form";
import { FileList } from "@/components/portfolio/file-list";
import { FileUploadForm } from "@/components/portfolio/file-upload-form";
import type { PersonalProjectRequiredInput } from "@/lib/portfolio/personal-project";
import type { PortfolioFile } from "@/types/portfolio";

/** Step 2's "Add photos or files" branch — covers both "personal project" and "physical or creative project" from the spec, which share the same underlying answers; only the upload hint below differs slightly by item type. */
function EvidenceStep({
  itemId,
  files,
  hasEvidence,
  initialAnswers,
}: {
  itemId: string;
  files: PortfolioFile[];
  hasEvidence: boolean;
  initialAnswers: PersonalProjectRequiredInput;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Upload your work</p>
        <p className="text-xs text-muted-foreground">A finished photo or file works best — a progress shot is welcome too.</p>
        <FileList files={files} />
        <FileUploadForm portfolioItemId={itemId} />
      </div>

      {files.length > 0 && !hasEvidence && (
        <div className="rounded-md border border-dashed border-border bg-secondary px-3.5 py-3">
          <EvidenceFilePicker itemId={itemId} files={files} isReplace={false} />
        </div>
      )}

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium text-foreground">A few short answers</p>
        <PersonalProjectForm itemId={itemId} initial={initialAnswers} />
      </div>
    </div>
  );
}

export { EvidenceStep };
