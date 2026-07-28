"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deletePortfolioFile, getPortfolioFileDownloadUrl } from "@/lib/portfolio/actions";
import { cn } from "@/lib/utils";
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

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card px-3.5 py-2.5">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.label ?? file.original_filename}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</p>
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
