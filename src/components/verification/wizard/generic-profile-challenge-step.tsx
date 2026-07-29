"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmGenericProfileChallenge, requestGenericProfileChallenge } from "@/lib/identity/actions";
import type { ProviderEntry } from "@/lib/identity/provider-registry";

/**
 * Step 2's "Connect an account" branch for any TIER-2 (proof-of-control)
 * provider other than GitHub — the generic version of github-step.tsx.
 * Two stages: request a short-lived code, then confirm once the student
 * has placed it on the page they control. Nothing here is shown unless
 * the provider registry (Phase 4) marked this provider connectable for
 * the item's category.
 */
function GenericProfileChallengeStep({ itemId, provider }: { itemId: string; provider: ProviderEntry }) {
  const [targetUrl, setTargetUrl] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isRequesting, startRequest] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const router = useRouter();

  function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetUrl.trim()) return;
    startRequest(async () => {
      const result = await requestGenericProfileChallenge(itemId, provider.key, targetUrl.trim());
      if ("error" in result) {
        setRequestError(result.error);
        return;
      }
      setRequestError(null);
      setRawToken(result.rawToken);
      setChallengeId(result.challengeId);
    });
  }

  function handleConfirm() {
    if (!challengeId || !rawToken) return;
    startConfirm(async () => {
      const result = await confirmGenericProfileChallenge(challengeId, rawToken);
      if (result.error) {
        setConfirmError(result.error);
        return;
      }
      setConfirmError(null);
      setConfirmed(true);
      router.refresh();
    });
  }

  if (!rawToken) {
    return (
      <form onSubmit={handleRequest} className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Add the link to your {provider.studentFacingName} page, profile, or file — somewhere you can edit. We&apos;ll give
          you a short code to place there, just for a little while, to confirm it&apos;s really yours.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`generic-url-${itemId}`}>Link to your {provider.studentFacingName} page</Label>
          <Input
            id={`generic-url-${itemId}`}
            type="url"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://..."
            disabled={isRequesting}
            required
          />
        </div>
        <FieldError errors={requestError ? [requestError] : undefined} />
        <Button type="submit" size="sm" className="w-fit" disabled={isRequesting || !targetUrl.trim()}>
          {isRequesting ? "Starting…" : "Get my code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Place this code somewhere on that page — a bio, description, or file — then come back and confirm. You can remove
        it again right after.
      </p>
      <code className="w-fit rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground">{rawToken}</code>
      <FieldError errors={confirmError ? [confirmError] : undefined} />
      {confirmed ? (
        <p className="text-sm text-success">Confirmed — thanks!</p>
      ) : (
        <Button type="button" size="sm" className="w-fit" onClick={handleConfirm} disabled={isConfirming}>
          {isConfirming ? "Checking…" : "I've added it — check now"}
        </Button>
      )}
    </div>
  );
}

export { GenericProfileChallengeStep };
