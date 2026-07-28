import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { ItemTypeBadge } from "@/components/portfolio/item-type-badge";
import { Chip } from "@/components/ui/chip";
import { isPortfolioItemIncomplete } from "@/lib/portfolio/strength";
import type { PortfolioItem } from "@/types/portfolio";

function formatDateRange(item: PortfolioItem): string | null {
  if (!item.start_date && !item.end_date && !item.is_current) return null;
  const start = item.start_date ? new Date(item.start_date).getUTCFullYear() : null;
  const end = item.is_current ? "present" : item.end_date ? new Date(item.end_date).getUTCFullYear() : null;
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}–present`;
  return null;
}

function PortfolioItemCard({ item, fileCount = 0 }: { item: PortfolioItem; fileCount?: number }) {
  const dateRange = formatDateRange(item);
  const incomplete = isPortfolioItemIncomplete(item);

  return (
    <article className="flex flex-col gap-2.5 rounded-md border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ItemTypeBadge itemType={item.item_type} />
          <h3 className="mt-1.5 font-heading text-base text-foreground">
            <Link
              href={`/portfolio/items/${item.id}`}
              className="rounded-sm hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {item.title}
            </Link>
          </h3>
          {item.organization && <p className="text-sm text-muted-foreground">{item.organization}</p>}
        </div>
      </div>

      {item.outcome && <p className="line-clamp-2 text-sm text-foreground">{item.outcome}</p>}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {dateRange && <Chip size="sm">{dateRange}</Chip>}
        {fileCount > 0 && <Chip size="sm">{fileCount} file{fileCount === 1 ? "" : "s"}</Chip>}
        {item.tags.slice(0, 3).map((tag) => (
          <Chip key={tag} size="sm">
            {tag}
          </Chip>
        ))}
      </div>

      {incomplete && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          Add a few more details to strengthen this item.
        </p>
      )}
    </article>
  );
}

export { PortfolioItemCard };
