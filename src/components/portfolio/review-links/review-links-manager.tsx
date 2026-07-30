"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { createReviewLinkAction, revokeReviewLinkAction } from "@/lib/review-links/actions";
import type { PortfolioItem, PortfolioReviewLink } from "@/types/portfolio";

function reviewUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/review/${token}`;
}

function CreateReviewLinkForm({ items }: { items: PortfolioItem[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createReviewLinkAction({
        title,
        introSummary: null,
        items: Array.from(selected).map((portfolioItemId) => ({ portfolioItemId, selectedFileIds: [] })),
      });
      if (result.error || !result.token) {
        setError(result.error ?? "Couldn't create that review link.");
        return;
      }
      setCreatedUrl(reviewUrl(result.token));
      setTitle("");
      setSelected(new Set());
      // The "Your review links" list below reads server-fetched props —
      // refresh so the just-created link (and its real title/expiry) shows
      // up there without a manual page reload.
      router.refresh();
    });
  }

  if (createdUrl) {
    return (
      <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-4">
        <p className="text-sm font-medium text-foreground">Your review link is ready — copy it now, it won&apos;t be shown again.</p>
        <div className="mt-2 flex items-center gap-2">
          <Input readOnly value={createdUrl} onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(createdUrl)} aria-label="Copy link">
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setCreatedUrl(null)}>
          Create another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-link-title">Title (only you see this)</Label>
        <Input id="review-link-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall application review" />
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Select items to share</p>
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="size-4" />
                {item.title}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <FieldError errors={error ? [error] : undefined} />

      <Button type="submit" disabled={isPending || title.trim().length === 0 || selected.size === 0}>
        <Link2 aria-hidden="true" className="size-4" />
        {isPending ? "Creating…" : "Create review link"}
      </Button>
    </form>
  );
}

function ReviewLinksManager({ items, links }: { items: PortfolioItem[]; links: PortfolioReviewLink[] }) {
  const router = useRouter();
  // `links` is always the source of truth (server props, kept fresh via
  // router.refresh() after create/revoke) — this only tracks which ids
  // were *just* revoked in this render pass, for instant feedback before
  // that refresh lands. Never copied from `links` into local state, so
  // there's no prop-to-state sync to keep correct.
  const [optimisticallyRevokedIds, setOptimisticallyRevokedIds] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      const result = await revokeReviewLinkAction(linkId);
      if (!result.error) {
        setOptimisticallyRevokedIds((prev) => new Set(prev).add(linkId));
        router.refresh();
      }
    });
  }

  const displayLinks = links.map((link) =>
    optimisticallyRevokedIds.has(link.id) && !link.revoked_at ? { ...link, revoked_at: new Date().toISOString() } : link
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <CreateReviewLinkForm items={items} />

      {displayLinks.length > 0 && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your review links</p>
          <ul className="mt-2 flex flex-col gap-2">
            {displayLinks.map((link) => {
              const isActive = !link.revoked_at && new Date(link.expires_at) > new Date();
              return (
                <li key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{link.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {link.revoked_at ? "Revoked" : isActive ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : "Expired"} · Viewed{" "}
                      {link.view_count} time{link.view_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {isActive && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRevoke(link.id)}>
                      <Trash2 aria-hidden="true" className="size-3.5" /> Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export { ReviewLinksManager };
