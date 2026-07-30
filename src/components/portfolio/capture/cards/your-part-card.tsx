"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { getYourPartStarters } from "@/lib/portfolio/capture/category-prompts";
import type { PassionGroup } from "@/lib/portfolio/taxonomy";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

/**
 * Team-vs-personal separation (spec Part 1 Card 3): "yourPart" is always
 * about the individual student, never assumed from a team/organization
 * result. The prompt copy itself says "personally" to keep that
 * distinction visible, and nothing here ever auto-fills this field from a
 * team outcome.
 */
function YourPartCard({
  prompt,
  passionGroup,
  yourPart,
  onYourPartChange,
  whyYouDidIt,
  onWhyChange,
  error,
  onBack,
  onContinue,
}: {
  prompt: string;
  passionGroup: PassionGroup | null;
  yourPart: string;
  onYourPartChange: (value: string) => void;
  whyYouDidIt: string;
  onWhyChange: (value: string) => void;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const starters = getYourPartStarters(passionGroup);

  function insertStarter(starter: string) {
    const needsSpace = yourPart.length > 0 && !yourPart.endsWith(" ") && !yourPart.endsWith("\n");
    onYourPartChange(`${yourPart}${needsSpace ? " " : ""}${starter} `);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">Your part</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is what schools care about most — be specific.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-4">
        <Label htmlFor="your-part" className="text-base font-semibold text-foreground">
          {prompt}
        </Label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sentence starters">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => insertStarter(starter)}
              className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-xs font-medium text-primary transition-colors duration-[var(--duration-fast)] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {starter}
            </button>
          ))}
        </div>

        <textarea
          id="your-part"
          className={TEXTAREA_CLASS}
          rows={4}
          value={yourPart}
          onChange={(e) => onYourPartChange(e.target.value)}
          placeholder="Describe what you personally did, decided, or made — not just what the team or group accomplished."
          autoFocus
        />
        <FieldError errors={error ? [error] : undefined} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="why-you-did-it">Why did you do this? (optional)</Label>
        <textarea id="why-you-did-it" className={TEXTAREA_CLASS} rows={2} value={whyYouDidIt} onChange={(e) => onWhyChange(e.target.value)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export { YourPartCard };
