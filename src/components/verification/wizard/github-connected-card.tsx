"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { disconnectMyGithubIdentity } from "@/lib/identity/actions";
import type { ConnectedIdentitySummary } from "@/types/identity";

/**
 * The connected-account visual (spec's "CONNECTED GITHUB SECTION") — kept
 * deliberately distinct from the plain-text username field on the Details
 * form below: this is the one control that actually proves ownership.
 */
function GithubConnectedCard({ identity }: { identity: ConnectedIdentitySummary }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectMyGithubIdentity();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 via-card to-card px-4 py-3.5">
      {identity.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar, no local image domain configured
        <img
          src={identity.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          className="size-11 shrink-0 rounded-full border border-border"
        />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
          {identity.provider_username.slice(0, 2).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">@{identity.provider_username}</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            <BadgeCheck aria-hidden="true" className="size-3" />
            Connected
          </span>
        </div>
        {identity.provider_profile_url && (
          <a
            href={identity.provider_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View profile
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        )}
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect} disabled={isPending}>
        {isPending ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}

export { GithubConnectedCard };
