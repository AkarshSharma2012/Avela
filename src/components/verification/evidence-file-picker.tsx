"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { attachEvidenceFile, replaceEvidence } from "@/lib/verification/actions";
import type { PortfolioFile } from "@/types/portfolio";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/** Picks from files already uploaded to this item (see FileUploadForm) and attaches one as verification evidence — never a second upload flow. */
function EvidenceFilePicker({ itemId, files, isReplace, onDone }: { itemId: string; files: PortfolioFile[]; isReplace: boolean; onDone?: () => void }) {
  const [fileId, setFileId] = useState(files[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">Upload a file below first, then come back here to use it as evidence.</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileId) return;
    startTransition(async () => {
      const result = isReplace ? await replaceEvidence(itemId, { fileId }) : await attachEvidenceFile(itemId, fileId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor={`evidence-file-${itemId}`}>Use an uploaded file as evidence</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`evidence-file-${itemId}`}
          className={SELECT_CLASS}
          value={fileId}
          onChange={(event) => setFileId(event.target.value)}
          disabled={isPending}
        >
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.label ?? file.original_filename}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={isPending || !fileId}>
          {isPending ? "Saving…" : "Use this file"}
        </Button>
      </div>
      <FieldError errors={error ? [error] : undefined} />
    </form>
  );
}

export { EvidenceFilePicker };
