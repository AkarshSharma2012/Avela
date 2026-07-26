"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveOpportunity, unsaveOpportunity } from "@/lib/opportunities/save-actions";
import { cn } from "@/lib/utils";

/**
 * Optimistically toggles saved state, reverting only if the Server Action
 * reports an error. The visually-hidden live region announces the outcome
 * so screen-reader users get the same "Saved" / "Removed from saved"
 * confirmation sighted users see from the button's own label change.
 */
function SaveButton({
  opportunityId,
  initiallySaved,
  size = "sm",
}: {
  opportunityId: string;
  initiallySaved: boolean;
  size?: "sm" | "default";
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = next
        ? await saveOpportunity(opportunityId)
        : await unsaveOpportunity(opportunityId);

      if (result.error) {
        setSaved(!next);
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement(next ? "Saved to your list." : "Removed from your saved list.");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={saved ? "secondary" : "outline"}
        size={size}
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved opportunities" : "Save opportunity"}
      >
        <Bookmark aria-hidden="true" className={cn("size-3.5", saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

export { SaveButton };
