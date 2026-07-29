"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { savePersonalProjectDetails } from "@/lib/portfolio/actions";
import type { PersonalProjectRequiredInput } from "@/lib/portfolio/personal-project";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The three short required prompts behind "personal project" and "physical
 * or creative project" in the spec's Step 2 — same underlying table either
 * way (portfolio_personal_project_details), so one form serves both; only
 * the surrounding copy in EvidenceStep differs.
 */
function PersonalProjectForm({ itemId, initial }: { itemId: string; initial: PersonalProjectRequiredInput }) {
  const [whatYouMade, setWhatYouMade] = useState(initial.whatYouMade);
  const [whyYouMadeIt, setWhyYouMadeIt] = useState(initial.whyYouMadeIt);
  const [yourPart, setYourPart] = useState(initial.yourPart);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePersonalProjectDetails(itemId, { whatYouMade, whyYouMadeIt, yourPart });
      if (result.error) {
        setError(result.error);
        setSaved(false);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ppd-what-${itemId}`}>What did you make?</Label>
        <textarea
          id={`ppd-what-${itemId}`}
          className={TEXTAREA_CLASS}
          rows={2}
          value={whatYouMade}
          onChange={(event) => {
            setWhatYouMade(event.target.value);
            setSaved(false);
          }}
          disabled={isPending}
          placeholder="A sentence or two is enough."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ppd-why-${itemId}`}>Why did you make it?</Label>
        <textarea
          id={`ppd-why-${itemId}`}
          className={TEXTAREA_CLASS}
          rows={2}
          value={whyYouMadeIt}
          onChange={(event) => {
            setWhyYouMadeIt(event.target.value);
            setSaved(false);
          }}
          disabled={isPending}
          placeholder="What made you want to start this?"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ppd-part-${itemId}`}>What part did you personally complete?</Label>
        <textarea
          id={`ppd-part-${itemId}`}
          className={TEXTAREA_CLASS}
          rows={2}
          value={yourPart}
          onChange={(event) => {
            setYourPart(event.target.value);
            setSaved(false);
          }}
          disabled={isPending}
          placeholder="Be specific about your own contribution."
        />
      </div>

      <FieldError errors={error ? [error] : undefined} />
      {saved && !error && <p className="text-sm text-success">Saved.</p>}

      <Button
        type="submit"
        size="sm"
        className="w-fit"
        disabled={isPending || !whatYouMade.trim() || !whyYouMadeIt.trim() || !yourPart.trim()}
      >
        {isPending ? "Saving…" : "Save answers"}
      </Button>
    </form>
  );
}

export { PersonalProjectForm };
