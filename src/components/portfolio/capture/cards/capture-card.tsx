"use client";

import { useRef, useState } from "react";
import { Link2, Upload, Camera, LayoutGrid, PenLine, ArrowRight, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { PlatformPanel, type PlatformSelection } from "@/components/portfolio/capture/platform-panel";
import { cn } from "@/lib/utils";
import type { CaptureInput, CaptureMethod } from "@/lib/portfolio/capture/types";

const TEXTAREA_CLASS =
  "flex w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-all duration-[var(--duration-fast)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const METHODS: { key: CaptureMethod; label: string; hint: string; icon: typeof Link2 }[] = [
  { key: "link", label: "Paste a link", hint: "A project, website, or video", icon: Link2 },
  { key: "upload", label: "Upload files", hint: "A PDF, certificate, or document", icon: Upload },
  { key: "photo", label: "Add photos", hint: "Photos of your work or process", icon: Camera },
  { key: "connect", label: "Add from a platform", hint: "GitHub, a public profile, or a project link", icon: LayoutGrid },
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
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformSelection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChosen(kind: "upload" | "photo") {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    onCapture({ method: kind, filename: file.name, mimeType: file.type });
  }

  function selectMethod(key: CaptureMethod) {
    setMethod(key);
    setSelectedPlatform(null);
  }

  const isDirectGithub = selectedPlatform?.provider.key === "github" && selectedPlatform.connectable;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">What are you proud of?</h2>
        <p className="mt-1 text-sm text-text-secondary">Drop in whatever you have. Avela will help organize the rest.</p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {METHODS.map(({ key, label, hint, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectMethod(key)}
            aria-pressed={method === key}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all duration-[var(--duration-fast)] ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md aria-pressed:border-primary aria-pressed:bg-gradient-to-br aria-pressed:from-primary/10 aria-pressed:via-card aria-pressed:to-card aria-pressed:shadow-glow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
                method === key ? "bg-primary text-primary-foreground" : "bg-secondary text-primary group-hover:bg-primary/15"
              )}
            >
              <Icon aria-hidden="true" className="size-4.5" />
            </span>
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

      {method === "connect" && selectedPlatform === null && (
        <div className="animate-fade-up rounded-xl border border-border bg-secondary/40 px-4 py-4">
          <PlatformPanel onSelect={setSelectedPlatform} />
        </div>
      )}

      {method === "connect" && selectedPlatform !== null && (
        <div className="animate-fade-up flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelectedPlatform(null)}
            className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> Choose a different platform
          </button>

          {isDirectGithub ? (
            <>
              <Label htmlFor="capture-repo">GitHub repository</Label>
              <Input id="capture-repo" placeholder="your-username/your-repo" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={isSubmitting} />
              <Button
                type="button"
                onClick={() => onCapture({ method: "connect", provider: "github", repoFullName: repo })}
                disabled={isSubmitting || !repo.includes("/")}
              >
                Continue <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Label htmlFor="capture-platform-url">{selectedPlatform.provider.studentFacingName} link</Label>
              <Input
                id="capture-platform-url"
                type="url"
                placeholder={`https://…/your-${selectedPlatform.provider.studentFacingName.toLowerCase()}`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <Button type="button" onClick={() => onCapture({ method: "link", url })} disabled={isSubmitting || url.trim().length === 0}>
                Continue <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </>
          )}
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
