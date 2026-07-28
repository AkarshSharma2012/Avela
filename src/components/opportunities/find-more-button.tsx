import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Plain link to wherever the next unseen batch of real catalog results
 * lives — a server-rendered nav, not a client fetch, matching Pagination's
 * existing pattern (no fake loading/progress state). `href` is caller-built
 * so this one component works for both the dashboard's `?shown=` offset and
 * the Opportunities page's `?page=` pagination.
 */
function FindMoreButton({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "default", size: "lg" }), className)}
    >
      Find more opportunities
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

export { FindMoreButton };
