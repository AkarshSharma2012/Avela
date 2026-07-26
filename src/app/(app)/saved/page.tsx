import type { Metadata } from "next";
import { Bookmark } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Saved — Avela",
};

export default function SavedPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div className="stagger-children">
        <p className="animate-fade-up mb-3 text-xs font-medium tracking-wide text-primary uppercase">
          Saved
        </p>
        <h1 className="animate-fade-up font-heading text-3xl text-foreground sm:text-4xl">
          Opportunities you save.
        </h1>
        <p className="animate-fade-up mt-3 max-w-lg text-base leading-relaxed text-text-secondary">
          Save an opportunity while browsing and it will appear here, ready to revisit later.
        </p>
      </div>

      {/* Future saved-opportunity list renders here once discovery is enabled. */}
      <div className="animate-fade-up mt-8">
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet."
          description="Once opportunity discovery is enabled, anything you save will show up here."
          action={{ label: "Explore Opportunities", href: "/opportunities" }}
        />
      </div>
    </div>
  );
}
