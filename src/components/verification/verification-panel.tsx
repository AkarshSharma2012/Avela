"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EvidenceFilePicker } from "@/components/verification/evidence-file-picker";
import { OfficialUrlForm } from "@/components/verification/official-url-form";
import { RequestVerificationDialog } from "@/components/verification/request-verification-dialog";
import { VerificationBadge } from "@/components/verification/verification-badge";
import { getPortfolioFileDownloadUrl } from "@/lib/portfolio/actions";
import { VERIFICATION_METHOD_LABELS } from "@/lib/verification/constants";
import { cancelVerificationRequest, resendVerificationRequest } from "@/lib/verification/actions";
import type { RequestStatus } from "@/lib/verification/request";
import type { PortfolioFile } from "@/types/portfolio";
import type { PortfolioVerification } from "@/types/verification";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EvidenceLink({ verification, files }: { verification: PortfolioVerification; files: PortfolioFile[] }) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verification.evidence_url) {
    return (
      <a
        href={verification.evidence_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {verification.evidence_url}
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    );
  }

  if (verification.evidence_file_id) {
    const file = files.find((f) => f.id === verification.evidence_file_id);
    if (!file) return null;
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={isOpening}
          onClick={async () => {
            setIsOpening(true);
            const result = await getPortfolioFileDownloadUrl(file.id);
            setIsOpening(false);
            if (result.error || !result.url) {
              setError(result.error ?? "Couldn't open that file.");
              return;
            }
            window.open(result.url, "_blank", "noopener,noreferrer");
          }}
        >
          {file.label ?? file.original_filename}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">No evidence added yet.</p>;
}

/**
 * The Portfolio item workspace's Verification section (spec section 5):
 * badge, what supports the claim, what's missing, dates, evidence, actions,
 * and respectful review feedback — never hides an unverified item, never
 * implies absolute truth either way.
 */
function VerificationPanel({
  itemId,
  itemTitle,
  verification,
  requestStatus,
  files,
}: {
  itemId: string;
  itemTitle: string;
  verification: PortfolioVerification | null;
  requestStatus: RequestStatus;
  files: PortfolioFile[];
}) {
  const [editingEvidence, setEditingEvidence] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const level = verification?.verification_level ?? "unverified";
  const hasEvidence = Boolean(verification?.evidence_file_id || verification?.evidence_url);
  const showReviewNotes = verification?.review_notes && (level === "needs_review" || level === "rejected");

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelVerificationRequest(itemId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setActionError(null);
      setAnnouncement("Request cancelled.");
      router.refresh();
    });
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendVerificationRequest(itemId);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setActionError(null);
      setAnnouncement("Verification email resent.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge level={level} />
        {verification?.verification_method && (
          <span className="text-xs text-muted-foreground">via {VERIFICATION_METHOD_LABELS[verification.verification_method]}</span>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What supports this</dt>
          <dd className="mt-1">{verification ? <EvidenceLink verification={verification} files={files} /> : <p className="text-sm text-muted-foreground">No evidence added yet.</p>}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Last verified</dt>
          <dd className="mt-1 text-sm text-foreground">{formatDate(verification?.verified_at ?? null) ?? "Not yet verified"}</dd>
        </div>
        {requestStatus === "pending" && verification?.expires_at && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Request expires</dt>
            <dd className="mt-1 text-sm text-foreground">{formatDate(verification.expires_at)}</dd>
          </div>
        )}
        {verification?.verifier_name && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Verifier</dt>
            <dd className="mt-1 text-sm text-foreground">
              {verification.verifier_name}
              {verification.verifier_organization ? ` — ${verification.verifier_organization}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {showReviewNotes && (
        <p className="rounded-md border border-dashed border-gold/40 bg-gold/10 px-3.5 py-3 text-sm text-foreground">
          {verification!.review_notes}
        </p>
      )}

      {level === "unverified" && !hasEvidence && (
        <p className="text-sm text-muted-foreground">
          This entry doesn&apos;t need proof to stay on your portfolio — adding evidence or requesting a quick
          confirmation just gives it a stronger support level.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditingEvidence((value) => !value)}>
          {hasEvidence ? "Replace evidence" : "Add evidence"}
        </Button>

        {requestStatus === "pending" ? (
          <>
            <span className="text-xs text-muted-foreground">Waiting on {verification?.verifier_name ?? "your verifier"}</span>
            <Button type="button" variant="ghost" size="sm" onClick={handleResend} disabled={isPending}>
              Resend
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
              Cancel request
            </Button>
          </>
        ) : (
          <RequestVerificationDialog itemId={itemId} itemTitle={itemTitle} />
        )}

        <a href="#details-heading" className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
          Fix details
        </a>
      </div>

      {editingEvidence && (
        <div className="flex flex-col gap-4 rounded-md border border-dashed border-border bg-secondary px-3.5 py-3">
          <EvidenceFilePicker itemId={itemId} files={files} isReplace={hasEvidence} onDone={() => setEditingEvidence(false)} />
          <div className="border-t border-border pt-3">
            <OfficialUrlForm itemId={itemId} isReplace={hasEvidence} onDone={() => setEditingEvidence(false)} />
          </div>
        </div>
      )}

      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export { VerificationPanel };
