"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOfficialUrl, replaceEvidence } from "@/lib/verification/actions";

/** Adds (or replaces) an official page as evidence — never claims the link alone confirms anything; see the panel's own copy for that distinction. */
function OfficialUrlForm({ itemId, isReplace, onDone }: { itemId: string; isReplace: boolean; onDone?: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const action = isReplace ? replaceEvidence(itemId, { url }) : addOfficialUrl(itemId, url);
      const result = await action;
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setUrl("");
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor={`official-url-${itemId}`}>Official page URL</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`official-url-${itemId}`}
          type="url"
          placeholder="https://example.org/results"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={isPending}
          className="max-w-sm"
        />
        <Button type="submit" size="sm" disabled={isPending || url.trim().length === 0}>
          {isPending ? "Saving…" : "Save link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A public official page (school, organization, or program site) — not a personal social media profile.
      </p>
      <FieldError errors={error ? [error] : undefined} />
    </form>
  );
}

export { OfficialUrlForm };
