"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { ALLOWED_PORTFOLIO_FILE_LABEL, MAX_PORTFOLIO_FILE_SIZE_BYTES } from "@/lib/portfolio/constants";
import { validatePortfolioFileSize, validatePortfolioFileType } from "@/lib/portfolio/storage";

type UploadState = { status: "idle" } | { status: "uploading"; percent: number } | { status: "error"; message: string };

/**
 * A plain Route Handler (not a Server Action) is what this uploads to —
 * `XMLHttpRequest.upload.onprogress` is the only way to get real
 * byte-level progress in the browser today; Server Actions don't expose
 * one. See src/app/api/portfolio/files/route.ts for the server side.
 */
function uploadWithProgress(
  file: File,
  portfolioItemId: string | null,
  onProgress: (percent: number) => void
): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("file", file);
    if (portfolioItemId) formData.append("portfolioItemId", portfolioItemId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/portfolio/files");

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({});
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        resolve({ error: body.error ?? "Couldn't upload that file. Please try again." });
      } catch {
        resolve({ error: "Couldn't upload that file. Please try again." });
      }
    });

    xhr.addEventListener("error", () => resolve({ error: "Couldn't upload that file. Check your connection and try again." }));

    xhr.send(formData);
  });
}

function FileUploadForm({ portfolioItemId }: { portfolioItemId: string }) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const limitMb = Math.round(MAX_PORTFOLIO_FILE_SIZE_BYTES / (1024 * 1024));

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const typeError = validatePortfolioFileType(file.type);
    if (typeError) {
      setState({ status: "error", message: typeError });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const sizeError = validatePortfolioFileSize(file.size);
    if (sizeError) {
      setState({ status: "error", message: sizeError });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setState({ status: "uploading", percent: 0 });
    const result = await uploadWithProgress(file, portfolioItemId, (percent) => setState({ status: "uploading", percent }));
    if (inputRef.current) inputRef.current.value = "";

    if (result.error) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "idle" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="portfolio-file-input">Attach a file</Label>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          id="portfolio-file-input"
          type="file"
          accept="application/pdf,.docx,.pdf,image/png,image/jpeg"
          onChange={handleFileChange}
          disabled={state.status === "uploading"}
          className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        />
        {state.status === "uploading" && <Upload aria-hidden="true" className="size-4 shrink-0 animate-pulse text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground">
        {ALLOWED_PORTFOLIO_FILE_LABEL} — up to {limitMb}MB. Only you can see files you upload here.
      </p>

      {state.status === "uploading" && (
        <div
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div className="h-full rounded-full bg-primary transition-all duration-[var(--duration-fast)]" style={{ width: `${state.percent}%` }} />
        </div>
      )}

      {state.status === "error" && <FieldError errors={[state.message]} />}
    </div>
  );
}

export { FileUploadForm };
