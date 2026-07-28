import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import { EVIDENCE_PURPOSE_LABELS } from "@/lib/portfolio/constants";
import type { ApplicationUsingItem } from "@/lib/portfolio/evidence-repository";

function ApplicationsUsingItem({ applications }: { applications: ApplicationUsingItem[] }) {
  if (applications.length === 0) {
    return <p className="text-sm text-muted-foreground">Not attached to any application yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {applications.map((application) => (
        <li
          key={application.applicationPlanId}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3.5 py-2.5"
        >
          <Link
            href={`/applications/${application.applicationPlanId}`}
            className="min-w-0 truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            {application.opportunityTitle}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {application.purposes.map((purpose) => (
              <Chip key={purpose} size="sm">
                {EVIDENCE_PURPOSE_LABELS[purpose]}
              </Chip>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export { ApplicationsUsingItem };
