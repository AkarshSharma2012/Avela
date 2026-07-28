"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { SOURCE_TYPE_LABELS } from "@/lib/osint/constants";
import { getOsintConsentPreview, startOsintCheck } from "@/lib/osint/actions";
import type { ConsentSummary } from "@/lib/osint/consent";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  studentDisplayName: "Your name",
  title: "Entry title",
  organization: "Organization",
  role: "Role",
  dates: "Dates",
  url: "Linked URL",
};

/**
 * The consent step (spec section 3): shows exactly which fields and public
 * sources may be searched before anything runs, requires an explicit
 * checkbox, and can always be cancelled with nothing sent. Never a single
 * "confirm" click that quietly starts a background search.
 */
function OsintConsentDialog({ itemId, itemTitle, isRecheck }: { itemId: string; itemTitle: string; isRecheck: boolean }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ConsentSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !summary) {
      startTransition(async () => {
        const result = await getOsintConsentPreview(itemId);
        if (result.error || !result.summary) {
          setLoadError(result.error ?? "Couldn't load what would be searched.");
          return;
        }
        setSummary(result.summary);
      });
    }
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await startOsintCheck(itemId, consentGiven);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      setSubmitError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger className={cn(buttonVariants({ variant: isRecheck ? "outline" : "default", size: "sm" }))}>
        {isRecheck ? "Recheck public sources" : "Check public sources"}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-[var(--duration-fast)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-5 shadow-lg transition-all duration-[var(--duration-fast)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="font-heading text-lg text-foreground">Check public sources</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            For &ldquo;{itemTitle}&rdquo; — we&apos;ll look for public information that supports this entry. This is one
            more kind of evidence, never a replacement for your own uploads or a verifier&apos;s confirmation, and it
            never labels an entry &ldquo;false.&rdquo;
          </Dialog.Description>

          {!summary && !loadError && <p className="mt-4 text-sm text-muted-foreground">Loading what would be searched…</p>}
          {loadError && <FieldError errors={[loadError]} />}

          {summary && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded-md border border-dashed border-border bg-secondary px-3.5 py-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Fields that may be searched:</p>
                <p className="mt-1">{summary.fields.map((field) => FIELD_LABELS[field] ?? field).join(", ")}</p>
                <p className="mt-2 font-medium text-foreground">Public sources that may be queried:</p>
                <p className="mt-1">{summary.sourceTypes.map((type) => SOURCE_TYPE_LABELS[type]).join(", ")}</p>
                <p className="mt-2">
                  Only public, official pages and public APIs — never login-protected pages, data brokers, or private
                  social media.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm text-foreground">
                <Checkbox checked={consentGiven} onCheckedChange={(checked) => setConsentGiven(checked === true)} disabled={isPending} />
                <span>I understand what will be searched and agree to run this check.</span>
              </label>

              <FieldError errors={submitError ? [submitError] : undefined} />

              <div className="mt-1 flex items-center justify-end gap-2">
                <Dialog.Close className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</Dialog.Close>
                <Button type="button" size="sm" onClick={handleConfirm} disabled={isPending || !consentGiven}>
                  {isPending ? "Checking…" : "Start check"}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { OsintConsentDialog };
