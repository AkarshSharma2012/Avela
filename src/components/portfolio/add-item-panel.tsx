"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PortfolioItemForm } from "@/components/portfolio/portfolio-item-form";

/**
 * Milestone 10.9: the default action now sends a student into the guided
 * capture flow (/portfolio/new, spec Part 1) instead of opening the raw
 * long-form inline. The classic form is still one click away — never
 * removed, just no longer the default — for a student who already knows
 * exactly what they want to type.
 */
function AddItemPanel() {
  const [showClassicForm, setShowClassicForm] = useState(false);

  if (showClassicForm) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-border bg-card px-5 py-4">
          <PortfolioItemForm onCancel={() => setShowClassicForm(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/portfolio/new" className={buttonVariants({ variant: "default" })}>
        <Plus aria-hidden="true" className="size-4" />
        Add item
      </Link>
      <button
        type="button"
        onClick={() => setShowClassicForm(true)}
        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        Use the classic form instead
      </button>
    </div>
  );
}

export { AddItemPanel };
