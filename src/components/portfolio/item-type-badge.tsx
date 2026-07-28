import { PORTFOLIO_ITEM_TYPE_LABELS } from "@/lib/portfolio/constants";
import { cn } from "@/lib/utils";
import type { PortfolioItemType } from "@/types/database";

function ItemTypeBadge({ itemType, className }: { itemType: PortfolioItemType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary",
        className
      )}
    >
      {PORTFOLIO_ITEM_TYPE_LABELS[itemType]}
    </span>
  );
}

export { ItemTypeBadge };
