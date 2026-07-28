"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError } from "@/components/ui/field-error";
import { deletePortfolioItem } from "@/lib/portfolio/actions";
import { cn } from "@/lib/utils";

function DeleteItemButton({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deletePortfolioItem(itemId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/portfolio");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ConfirmDialog
        trigger={
          <span className={cn(buttonVariants({ variant: "destructive", size: "sm" }), "gap-1.5")}>
            <Trash2 aria-hidden="true" className="size-3.5" />
            {isPending ? "Removing…" : "Delete item"}
          </span>
        }
        title="Delete this item?"
        description={`"${itemTitle}" and any files attached to it will be permanently removed, and it will be detached from any application it's linked to. This can't be undone.`}
        onConfirm={handleConfirm}
      />
      {error && <FieldError errors={[error]} />}
    </div>
  );
}

export { DeleteItemButton };
