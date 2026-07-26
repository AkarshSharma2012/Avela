import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { buildPageHref, type OpportunityFilters } from "@/lib/opportunities/search-params";
import { cn } from "@/lib/utils";

function Pagination({
  filters,
  totalCount,
  pageSize,
}: {
  filters: OpportunityFilters;
  totalCount: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const page = filters.page;

  return (
    <nav aria-label="Opportunities pagination" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link
          href={buildPageHref(filters, page - 1)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
          Previous
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>

      {page < totalPages ? (
        <Link
          href={buildPageHref(filters, page + 1)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Next
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

export { Pagination };
