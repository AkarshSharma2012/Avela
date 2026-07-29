import { OfficialUrlForm } from "@/components/verification/official-url-form";
import { OsintConsentDialog } from "@/components/portfolio/osint/osint-consent-dialog";

/** Step 2's "Add a public link" branch — saving the link, plus (when this item type supports it) an optional check for other public information. */
function LinkStep({
  itemId,
  itemTitle,
  isReplace,
  isPublicSourceEligible,
  hasPublicSourceCheck,
}: {
  itemId: string;
  itemTitle: string;
  isReplace: boolean;
  isPublicSourceEligible: boolean;
  hasPublicSourceCheck: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <OfficialUrlForm itemId={itemId} isReplace={isReplace} />

      {isPublicSourceEligible && (
        <div className="rounded-md border border-dashed border-border bg-secondary px-3.5 py-3">
          <p className="text-sm text-foreground">Want us to also look for public information that supports this?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional — this never labels an entry as false, it only adds more context.
          </p>
          <div className="mt-2">
            <OsintConsentDialog itemId={itemId} itemTitle={itemTitle} isRecheck={hasPublicSourceCheck} />
          </div>
        </div>
      )}
    </div>
  );
}

export { LinkStep };
