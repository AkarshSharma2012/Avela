import { OpportunityCardSkeleton } from "@/components/opportunities/opportunity-card-skeleton";

export default function OpportunitiesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 sm:py-12">
      <div aria-hidden="true" className="animate-pulse space-y-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-72 max-w-full rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>

      <div
        role="status"
        aria-label="Loading opportunities"
        className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <OpportunityCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
