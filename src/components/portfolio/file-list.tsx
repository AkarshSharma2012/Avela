"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deletePortfolioFile, getPortfolioFileDownloadUrl } from "@/lib/portfolio/actions";
import { cn } from "@/lib/utils";
import { friendlyExtractionStatus, SOURCE_KIND_ICON, SOURCE_KIND_LABELS, VISIBILITY_LABEL } from "@/lib/portfolio/evidence-labels";
import type { PortfolioFile } from "@/types/portfolio";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ file, disabled, onDelete }: { file: PortfolioFile; disabled: boolean; onDelete: (file: PortfolioFile) => void }) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setIsOpening(true);
    setError(null);
    const result = await getPortfolioFileDownloadUrl(file.id);
    setIsOpening(false);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't open that file.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  const sourceKind = file.source_kind ?? "unknown";
  const SourceIcon = SOURCE_KIND_ICON[sourceKind];

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        <SourceIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.label ?? file.original_filename}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatFileSize(file.file_size)}</span>
          <span aria-hidden="true">·</span>
          <span>{SOURCE_KIND_LABELS[sourceKind]}</span>
          <span aria-hidden="true">·</span>
          <span>{friendlyExtractionStatus(file.extraction_status)}</span>
          <span aria-hidden="true">·</span>
          <span className={cn("font-medium", file.visibility === "private" ? "text-foreground" : "text-primary")}>
            {VISIBILITY_LABEL[file.visibility]}
          </span>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={handleOpen} disabled={disabled || isOpening}>
        {isOpening ? "Opening…" : "View"}
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </Button>
      <ConfirmDialog
        trigger={
          <span className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label={`Delete file: ${file.original_filename}`}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </span>
        }
        title="Delete this file?"
        description={`"${file.original_filename}" will be permanently removed. This can't be undone.`}
        onConfirm={() => onDelete(file)}
      />
    </li>
  );
}

function FileList({ files }: { files: PortfolioFile[] }) {
  const [items, setItems] = useState(files);
  const [syncedFiles, setSyncedFiles] = useState(files);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (files !== syncedFiles) {
    setSyncedFiles(files);
    setItems(files);
  }

  function handleDelete(file: PortfolioFile) {
    setItems((prev) => prev.filter((entry) => entry.id !== file.id));
    startTransition(async () => {
      const result = await deletePortfolioFile(file.id);
      if (result.error) {
        setItems((prev) => [...prev, file]);
        setAnnouncement(result.error);
        return;
      }
      setAnnouncement("File removed.");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No files attached yet.</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((file) => (
          <FileRow key={file.id} file={file} disabled={isPending} onDelete={handleDelete} />
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

export { FileList };
