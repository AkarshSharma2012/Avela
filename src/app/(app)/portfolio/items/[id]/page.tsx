import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { ApplicationsUsingItem } from "@/components/portfolio/applications-using-item";
import { ArchiveToggleButton } from "@/components/portfolio/archive-toggle-button";
import { CompletenessChecklist } from "@/components/portfolio/completeness-checklist";
import { DeleteItemButton } from "@/components/portfolio/delete-item-button";
import { FileList } from "@/components/portfolio/file-list";
import { FileUploadForm } from "@/components/portfolio/file-upload-form";
import { ItemTypeBadge } from "@/components/portfolio/item-type-badge";
import { PortfolioItemForm } from "@/components/portfolio/portfolio-item-form";
import { PortfolioSupportSection } from "@/components/verification/portfolio-support-section";
import { getAuthenticatedUser, requireProfile } from "@/lib/auth/dal";
import { listDimensionsForItem } from "@/lib/claims/repository";
import { summarizeClaimDimensions } from "@/lib/claims/rollup";
import { getMyConnectedGithubIdentity, isGithubConnectAvailable } from "@/lib/identity/actions";
import { isOsintEligible } from "@/lib/osint/claim-eligibility";
import { getLatestCheckForItem, listConflictsForCheck, listEvidenceForCheck } from "@/lib/osint/repository";
import { listApplicationsUsingItem } from "@/lib/portfolio/evidence-repository";
import { getPersonalProjectDetails, getPortfolioItem, listFilesForItem } from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase/server";
import { deriveRequestStatus } from "@/lib/verification/request";
import { getVerificationForItem, metadataOf } from "@/lib/verification/repository";
import type { OsintCheckWithFindings } from "@/types/osint";

type PageParams = { id: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (!user) return { title: "Portfolio Item — Avela" };

  const supabase = await createClient();
  const item = await getPortfolioItem(supabase, user.id, id);
  return { title: item ? `${item.title} — My Portfolio — Avela` : "Portfolio Item — Avela" };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="animate-fade-up mt-8">
      <h2 id={id} className="text-xs font-medium tracking-wide text-primary uppercase">
        {title}
      </h2>
      <div className="mt-3 rounded-md border border-border bg-card px-5 py-4">{children}</div>
    </section>
  );
}

export default async function PortfolioItemWorkspacePage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const item = await getPortfolioItem(supabase, profile.id, id);
  if (!item) {
    notFound();
  }

  const [files, applicationsUsingItem, verification, dimensions, personalProjectDetails, githubIdentityResult, githubConnectAvailable] = await Promise.all([
    listFilesForItem(supabase, profile.id, id),
    listApplicationsUsingItem(supabase, profile.id, id),
    getVerificationForItem(supabase, profile.id, id),
    listDimensionsForItem(supabase, profile.id, id),
    getPersonalProjectDetails(supabase, profile.id, id),
    getMyConnectedGithubIdentity(),
    isGithubConnectAvailable(),
  ]);
  const claimSupportSummary = summarizeClaimDimensions(dimensions);
  const personalProjectAnswers = {
    whatYouMade: personalProjectDetails?.what_you_made ?? "",
    whyYouMadeIt: personalProjectDetails?.why_you_made_it ?? "",
    yourPart: personalProjectDetails?.your_part ?? "",
  };
  const requestStatus = verification
    ? deriveRequestStatus({
        requestedAt: verification.requested_at,
        verifiedAt: verification.verified_at,
        expiresAt: verification.expires_at,
        verificationLevel: verification.verification_level,
        metadata: metadataOf(verification),
      })
    : "not_requested";

  let osintCheck: OsintCheckWithFindings | null = null;
  if (isOsintEligible(item.item_type)) {
    const latestCheck = await getLatestCheckForItem(supabase, profile.id, id);
    if (latestCheck) {
      const [evidence, conflicts] = await Promise.all([
        listEvidenceForCheck(supabase, profile.id, latestCheck.id),
        listConflictsForCheck(supabase, profile.id, latestCheck.id),
      ]);
      osintCheck = { ...latestCheck, evidence, conflicts };
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:py-12">
      <Link
        href="/portfolio"
        className="animate-fade-up inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to My Portfolio
      </Link>

      <div className="stagger-children mt-6">
        <div className="animate-fade-up flex flex-wrap items-start justify-between gap-3">
          <div>
            <ItemTypeBadge itemType={item.item_type} />
            <h1 className="mt-2 font-heading text-3xl text-foreground sm:text-4xl">{item.title}</h1>
            {item.organization && <p className="mt-1 text-base text-muted-foreground">{item.organization}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <ArchiveToggleButton itemId={item.id} visibility={item.visibility} />
            <DeleteItemButton itemId={item.id} itemTitle={item.title} />
          </div>
        </div>

        {item.visibility === "archived" && (
          <p className="animate-fade-up mt-4 rounded-md border border-dashed border-muted-foreground/40 bg-secondary px-4 py-3 text-sm text-muted-foreground">
            This item is hidden — it won&apos;t show up in your Portfolio Center&apos;s main view or in resume summaries, but
            any evidence link already attached to it still works.
          </p>
        )}

        <PortfolioSupportSection
          item={item}
          files={files}
          verification={verification}
          requestStatus={requestStatus}
          claimSupportSummary={claimSupportSummary}
          osintCheck={osintCheck}
          osintEligible={isOsintEligible(item.item_type)}
          githubIdentity={githubIdentityResult.identity}
          githubConnectAvailable={githubConnectAvailable}
          personalProjectAnswers={personalProjectAnswers}
        />

        <Section id="details-heading" title="Details">
          <PortfolioItemForm item={item} />
        </Section>

        <Section id="summary-heading" title="Resume-ready summary">
          <CompletenessChecklist item={item} />
        </Section>

        <Section id="files-heading" title="Files">
          <div className="flex flex-col gap-4">
            <FileList files={files} />
            <FileUploadForm portfolioItemId={item.id} />
          </div>
        </Section>

        <Section id="applications-heading" title="Applications using this evidence">
          <ApplicationsUsingItem applications={applicationsUsingItem} />
        </Section>
      </div>
    </div>
  );
}
