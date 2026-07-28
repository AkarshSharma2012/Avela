"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OsintConsentDialog } from "@/components/portfolio/osint/osint-consent-dialog";
import { OsintSupportBadge } from "@/components/portfolio/osint/osint-support-badge";
import { AUTHORITY_LEVEL_LABELS, SOURCE_TYPE_LABELS } from "@/lib/osint/constants";
import { deleteOsintEvidence } from "@/lib/osint/actions";
import { buildSupportLevelMessage } from "@/lib/osint/messages";
import type { OsintCheckWithFindings, PortfolioOsintEvidence } from "@/types/osint";

/** RDAP and URL reputation are domain/safety context only — spec section 6: they must never be shown as authorship evidence and never count toward the support score (see orchestrator.ts, where both source types are explicitly excluded from scoring). */
const CONTEXT_ONLY_SOURCE_TYPES = new Set(["icann_rdap", "url_reputation"]);

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** GitHub's evidence is a single row with every signal folded into extracted_fields (spec section 5: never duplicate "github.com" cards) — this breaks it back out into the labeled sub-checks the student sees. */
function githubEvidenceLines(evidence: PortfolioOsintEvidence): string[] {
  const fields = evidence.extracted_fields as Record<string, unknown>;
  const lines: string[] = [];
  if (fields.ownerLoginMatch === true) lines.push("Repository owner matches your connected GitHub account");
  if (fields.contributorLoginMatch === true) lines.push("Your connected account appears as a contributor");
  if (fields.orgMemberMatch === true) lines.push("Your connected account is a public member of the owning organization");
  if (fields.commitAuthorLoginMatch === true) lines.push("Commits are authored by your connected account");
  if (fields.datesAlign === true) lines.push("Repository history overlaps the dates on this entry");
  if (fields.readmeOrDescriptionMatch === true) lines.push("README or description matches this entry");
  if (fields.deploymentUrlMatch === true) lines.push("Deployment URL matches this entry");
  if (lines.length === 0 && fields.titleOnlyMatch === true) lines.push("Project title matches (name only — not ownership proof)");
  if (lines.length === 0 && fields.displayNameOnlyMatch === true) lines.push("Display name loosely matches (name only — not ownership proof)");
  if (lines.length === 0) lines.push("Repository found, but nothing yet ties it to your account");
  return lines;
}

/**
 * Public-source (OSINT) findings for one portfolio item (spec sections 3,
 * 9): consent-gated "Check public sources" action, progress/sources
 * checked, evidence, conflicts, support level, transparent score
 * explanation, and a delete action — additive to (never a replacement
 * for) the Verification section above it.
 */
function OsintCheckPanel({ itemId, itemTitle, check }: { itemId: string; itemTitle: string; check: OsintCheckWithFindings | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteOsintEvidence(itemId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  const isRunning = check?.status === "running" || check?.status === "pending";
  const authorshipEvidence = (check?.evidence ?? []).filter((e) => !CONTEXT_ONLY_SOURCE_TYPES.has(e.source_type));
  const contextEvidence = (check?.evidence ?? []).filter((e) => CONTEXT_ONLY_SOURCE_TYPES.has(e.source_type));
  const githubNeedsIdentity = (check?.evidence ?? []).some(
    (e) => e.source_type === "github" && (e.extracted_fields as Record<string, unknown>).connectedUsernameMissing === true
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Public-source checking is an additional, optional evidence source — it looks for public information that
        supports this entry, and it never labels an entry &ldquo;false&rdquo; or &ldquo;fake.&rdquo;
      </p>

      {check ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {check.final_support_level ? <OsintSupportBadge level={check.final_support_level} /> : <span className="text-xs text-muted-foreground">Checking…</span>}
            {typeof check.score === "number" && <span className="text-xs text-muted-foreground">Score: {check.score}/100</span>}
          </div>

          {check.final_support_level && <p className="text-sm text-foreground">{buildSupportLevelMessage(check.final_support_level)}</p>}

          {githubNeedsIdentity && (
            <p className="rounded-md border border-dashed border-gold/40 bg-gold/10 px-3 py-2 text-sm text-foreground">
              Connect or enter your GitHub username so we can verify repository ownership.
            </p>
          )}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Last checked</dt>
              <dd className="mt-1 text-sm text-foreground">{formatDateTime(check.completed_at ?? check.started_at) ?? (isRunning ? "In progress…" : "Not yet run")}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sources checked</dt>
              <dd className="mt-1 text-sm text-foreground">{check.evidence.length === 0 ? "None found" : `${check.evidence.length} source${check.evidence.length === 1 ? "" : "s"}`}</dd>
            </div>
          </dl>

          {authorshipEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Supporting evidence</p>
              <ul className="mt-2 flex flex-col gap-2">
                {authorshipEvidence.map((evidence) => (
                  <li key={evidence.id} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{SOURCE_TYPE_LABELS[evidence.source_type]}</span>
                      <span className="text-xs text-muted-foreground">{AUTHORITY_LEVEL_LABELS[evidence.authority_level]}</span>
                    </div>
                    <a
                      href={evidence.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {evidence.source_domain}
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                    {evidence.source_type === "github" && (
                      <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                        {githubEvidenceLines(evidence).map((line) => (
                          <li key={line}>• {line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contextEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Safety and domain context</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Background information only — this never counts toward the support score above and never confirms who wrote or owns this entry.
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {contextEvidence.map((evidence) => (
                  <li key={evidence.id} className="rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{SOURCE_TYPE_LABELS[evidence.source_type]}</span>
                    <a
                      href={evidence.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {evidence.source_domain}
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {check.conflicts.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Worth a look</p>
              <ul className="mt-2 flex flex-col gap-2">
                {check.conflicts.map((conflict) => (
                  <li key={conflict.id} className="rounded-md border border-dashed border-gold/40 bg-gold/10 px-3 py-2 text-sm text-foreground">
                    {conflict.respectful_message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {check.score_breakdown.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Score explanation</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {check.score_breakdown.map((line, index) => (
                  <li key={index}>
                    {line.points > 0 ? "+" : ""}
                    {line.points}: {line.label}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No public-source check has been run for this entry yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <OsintConsentDialog itemId={itemId} itemTitle={itemTitle} isRecheck={Boolean(check)} />
        {check && (
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
            Delete public-source evidence
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { OsintCheckPanel };
