"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EVIDENCE_PURPOSES, EVIDENCE_PURPOSE_LABELS } from "@/lib/portfolio/constants";
import { attachEvidence, detachEvidence } from "@/lib/portfolio/actions";
import type { MissingEvidenceSuggestion } from "@/lib/applications/evidence-suggestions";
import type { EvidencePurpose } from "@/types/database";
import type { EvidenceLinkWithItem } from "@/types/portfolio";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/** The application workspace's Evidence section — attach/detach portfolio items grouped by purpose, plus honest, clearly-labeled "you might also want to add..." suggestions (never a claim this application actually requires anything, see evidence-suggestions.ts). */
function EvidenceSection({
  applicationPlanId,
  links,
  availableItems,
  suggestions,
}: {
  applicationPlanId: string;
  links: EvidenceLinkWithItem[];
  availableItems: { id: string; title: string }[];
  suggestions: MissingEvidenceSuggestion[];
}) {
  const [selectedItemId, setSelectedItemId] = useState(availableItems[0]?.id ?? "");
  const [purpose, setPurpose] = useState<EvidencePurpose>("resume");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const grouped = new Map<EvidencePurpose, EvidenceLinkWithItem[]>();
  for (const link of links) {
    const existing = grouped.get(link.evidence_purpose) ?? [];
    existing.push(link);
    grouped.set(link.evidence_purpose, existing);
  }

  function handleAttach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemId) return;
    startTransition(async () => {
      const result = await attachEvidence({ applicationPlanId, portfolioItemId: selectedItemId, evidencePurpose: purpose });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setAnnouncement("Evidence attached.");
      router.refresh();
    });
  }

  function handleDetach(linkId: string, itemTitle: string) {
    startTransition(async () => {
      const result = await detachEvidence(linkId, applicationPlanId);
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(`Removed "${itemTitle}".`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evidence attached yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...grouped.entries()].map(([purposeKey, entries]) => (
            <div key={purposeKey}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {EVIDENCE_PURPOSE_LABELS[purposeKey]}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {entries.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <Link
                      href={`/portfolio/items/${link.item.id}`}
                      className="min-w-0 truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    >
                      {link.item.title}
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDetach(link.id, link.item.title)}
                      disabled={isPending}
                      aria-label={`Remove evidence: ${link.item.title}`}
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-dashed border-border bg-secondary px-3.5 py-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.purpose} className="text-xs text-muted-foreground">
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}

      {availableItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add items to your{" "}
          <Link href="/portfolio" className="text-primary underline-offset-4 hover:underline">
            Portfolio
          </Link>{" "}
          to attach them here.
        </p>
      ) : (
        <form onSubmit={handleAttach} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evidence-item">Portfolio item</Label>
            <select
              id="evidence-item"
              className={SELECT_CLASS}
              value={selectedItemId}
              onChange={(event) => setSelectedItemId(event.target.value)}
              disabled={isPending}
            >
              {availableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evidence-purpose">For</Label>
            <select
              id="evidence-purpose"
              className={SELECT_CLASS}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as EvidencePurpose)}
              disabled={isPending}
            >
              {EVIDENCE_PURPOSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={isPending || !selectedItemId}>
            <Plus aria-hidden="true" className="size-3.5" />
            Attach
          </Button>
        </form>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { EvidenceSection };
