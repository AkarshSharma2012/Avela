"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setPortfolioItemVisibility } from "@/lib/portfolio/actions";
import type { PortfolioItemVisibility } from "@/types/database";

/** The "hide" action from the spec — never a delete. An archived item is excluded from the Portfolio Center's default view and from resume summaries, but keeps everything (including any attached evidence links) and can be restored any time. */
function ArchiveToggleButton({ itemId, visibility }: { itemId: string; visibility: PortfolioItemVisibility }) {
  const [current, setCurrent] = useState(visibility);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isArchived = current === "archived";

  function handleClick() {
    const next: PortfolioItemVisibility = isArchived ? "visible" : "archived";
    setCurrent(next);
    startTransition(async () => {
      const result = await setPortfolioItemVisibility(itemId, next);
      if (result.error) {
        setCurrent(current);
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isArchived ? (
          <>
            <ArchiveRestore aria-hidden="true" className="size-3.5" />
            Restore item
          </>
        ) : (
          <>
            <Archive aria-hidden="true" className="size-3.5" />
            Hide item
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ArchiveToggleButton };
