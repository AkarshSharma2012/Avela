"use client";

import { useRef, useState } from "react";
import { Link2, Upload, Camera, Plug, PenLine, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import type { CaptureInput, CaptureMethod } from "@/lib/portfolio/capture/types";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const METHODS: { key: CaptureMethod; label: string; hint: string; icon: typeof Link2 }[] = [
  { key: "link", label: "Paste a link", hint: "A GitHub repo, website, or video", icon: Link2 },
  { key: "upload", label: "Upload files", hint: "A PDF, certificate, or document", icon: Upload },
  { key: "photo", label: "Add photos", hint: "Photos of your work or process", icon: Camera },
  { key: "connect", label: "Connect an account", hint: "GitHub and more", icon: Plug },
  { key: "text", label: "Type a quick description", hint: "A sentence or two is enough", icon: PenLine },
];

function CaptureCard({
  onCapture,
  onSkip,
  isSubmitting,
  error,
}: {
  onCapture: (input: CaptureInput) => void;
  onSkip: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [method, setMethod] = useState<CaptureMethod | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [repo, setRepo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChosen(kind: "upload" | "photo") {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    onCapture({ method: kind, filename: file.name, mimeType: file.type });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">What are you proud of?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste, upload, connect, photograph, or briefly describe something — Avela will help you build the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {METHODS.map(({ key, label, hint, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMethod(key)}
            aria-pressed={method === key}
            className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      {method === "text" && (
        <div className="animate-fade-up flex flex-col gap-2">
          <Label htmlFor="capture-text">Tell us about it</Label>
          <textarea
            id="capture-text"
            className={TEXTAREA_CLASS}
            rows={3}
            placeholder="e.g. I built a go-kart with my dad, or I helped care for my younger sibling every afternoon."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isSubmitting}
          />
          <Button type="button" onClick={() => onCapture({ method: "text", text })} disabled={isSubmitting || text.trim().length === 0}>
            Continue <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      {method === "link" && (
        <div className="animate-fade-up flex flex-col gap-2">
          <Label htmlFor="capture-url">Paste a link</Label>
          <Input id="capture-url" type="url" placeholder="https://github.com/you/your-project" value={url} onChange={(e) => setUrl(e.target.value)} disabled={isSubmitting} />
          <Button type="button" onClick={() => onCapture({ method: "link", url })} disabled={isSubmitting || url.trim().length === 0}>
            Continue <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      {(method === "upload" || method === "photo") && (
        <div className="animate-fade-up flex flex-col gap-2">
          <Label htmlFor="capture-file">{method === "photo" ? "Add a photo" : "Upload a file"}</Label>
          <input
            ref={fileInputRef}
            id="capture-file"
            type="file"
            accept={method === "photo" ? "image/*" : "application/pdf,.docx,.pdf,image/png,image/jpeg"}
            disabled={isSubmitting}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button type="button" onClick={() => handleFileChosen(method)} disabled={isSubmitting}>
            Continue <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      {method === "connect" && (
        <div className="animate-fade-up flex flex-col gap-2">
          <Label htmlFor="capture-repo">GitHub repository</Label>
          <Input id="capture-repo" placeholder="your-username/your-repo" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={isSubmitting} />
          <Button type="button" onClick={() => onCapture({ method: "connect", provider: "github", repoFullName: repo })} disabled={isSubmitting || !repo.includes("/")}>
            Continue <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      <FieldError errors={error ? [error] : undefined} />

      <button
        type="button"
        onClick={onSkip}
        disabled={isSubmitting}
        className="w-fit text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
      >
        Skip — start manually
      </button>
    </div>
  );
}

export { CaptureCard };
