"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PortfolioItemForm } from "@/components/portfolio/portfolio-item-form";

/** Collapsed by default so it never crowds the Portfolio Center — same pattern CustomReminderForm uses. */
function AddItemPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        Add item
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-5 py-4">
      <PortfolioItemForm onCancel={() => setOpen(false)} />
    </div>
  );
}

export { AddItemPanel };
