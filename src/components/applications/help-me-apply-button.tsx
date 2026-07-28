"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HandHelping } from "lucide-react";

import { startApplicationPlan } from "@/lib/applications/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The shared "move this into my applications" entry point — used on the
 * opportunity detail page's "How to apply" section. Once a plan exists
 * (either already, from a prior click, or freshly created here), the
 * button becomes a direct link into the workspace instead of staying a
 * disabled "done" state, since the student's next move is always "go work
 * on it there".
 */
function HelpMeApplyButton({
  opportunityId,
  initialPlanId = null,
  size = "default",
}: {
  opportunityId: string;
  initialPlanId?: string | null;
  size?: "sm" | "default";
}) {
  const [planId, setPlanId] = useState<string | null>(initialPlanId);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startApplicationPlan(opportunityId);
      if (result.error) {
        setAnnouncement(result.error);
        return;
      }
      if (result.planId) setPlanId(result.planId);
      setAnnouncement("Added to My Applications.");
    });
  }

  if (planId) {
    return (
      <Link href={`/applications/${planId}`} className={cn(buttonVariants({ variant: "secondary", size }), "gap-1.5")}>
        <HandHelping aria-hidden="true" className="size-3.5" />
        Continue application
      </Link>
    );
  }

  return (
    <>
      <Button type="button" variant="secondary" size={size} onClick={handleClick} disabled={isPending} className="gap-1.5">
        <HandHelping aria-hidden="true" className="size-3.5" />
        Help me apply
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

export { HelpMeApplyButton };
