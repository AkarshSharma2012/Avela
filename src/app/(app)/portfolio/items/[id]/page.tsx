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
import { getAuthenticatedUser, requireProfile } from "@/lib/auth/dal";
import { listApplicationsUsingItem } from "@/lib/portfolio/evidence-repository";
import { getPortfolioItem, listFilesForItem } from "@/lib/portfolio/repository";
import { createClient } from "@/lib/supabase/server";

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

  const [files, applicationsUsingItem] = await Promise.all([
    listFilesForItem(supabase, profile.id, id),
    listApplicationsUsingItem(supabase, profile.id, id),
  ]);

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
