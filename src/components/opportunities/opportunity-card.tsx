import { Chip } from "@/components/ui/chip";
import type { Opportunity } from "@/types/opportunity";

const FORMAT_LABELS: Record<Opportunity["format"], string> = {
  virtual: "Virtual",
  in_person: "In person",
  hybrid: "Hybrid",
};

const COST_LABELS: Record<Opportunity["cost"], string> = {
  free: "Free",
  paid: "Paid",
};

const COMMITMENT_LABELS: Record<Opportunity["commitment"], string> = {
  short_term: "Short-term",
  year_round: "Year-round",
  summer: "Summer",
};

/**
 * Presentational structure for a single opportunity — built ahead of the
 * data source (Milestone 4) so the discovery UI can be wired up without a
 * layout change later. Not rendered with fake data anywhere yet.
 */
function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card px-5 py-4">
      <div>
        <h3 className="font-heading text-lg text-foreground">{opportunity.title}</h3>
        <p className="text-sm text-muted-foreground">{opportunity.organization}</p>
      </div>

      <p className="text-sm leading-relaxed text-text-secondary">{opportunity.description}</p>

      <div className="flex flex-wrap gap-2">
        <Chip size="sm">{FORMAT_LABELS[opportunity.format]}</Chip>
        <Chip size="sm">{COST_LABELS[opportunity.cost]}</Chip>
        <Chip size="sm">{COMMITMENT_LABELS[opportunity.commitment]}</Chip>
        {opportunity.location && <Chip size="sm">{opportunity.location}</Chip>}
      </div>
    </article>
  );
}

export { OpportunityCard };
