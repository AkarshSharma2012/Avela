import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Plain link to the next deterministic offset — a server-rendered nav, not a client fetch, matching Pagination's existing pattern (no fake loading/progress state). */
function FindMoreButton({ nextShown, className }: { nextShown: number; className?: string }) {
  return (
    <Link
      href={`/dashboard?shown=${nextShown}`}
      className={cn(buttonVariants({ variant: "default", size: "lg" }), className)}
    >
      Find more opportunities
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

export { FindMoreButton };
