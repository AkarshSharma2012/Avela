"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GithubConnectedCard } from "@/components/verification/wizard/github-connected-card";
import { listMyGithubRepositories, selectGithubRepositoryForItem } from "@/lib/identity/actions";
import { cn } from "@/lib/utils";
import type { GithubOauthRepo } from "@/lib/identity/github-oauth";
import type { ConnectedIdentitySummary } from "@/types/identity";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

/** Step 2's "Connect an account" branch — connect, select the repository, confirm a role. Nothing here is shown for any other Step 1 choice. */
function GithubStep({
  itemId,
  githubIdentity,
  githubConnectAvailable,
  initialRole,
}: {
  itemId: string;
  githubIdentity: ConnectedIdentitySummary | null;
  githubConnectAvailable: boolean;
  initialRole: string;
}) {
  const [repos, setRepos] = useState<GithubOauthRepo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [role, setRole] = useState(initialRole);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isLoadingRepos, startLoadRepos] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!githubIdentity) return;
    startLoadRepos(async () => {
      const result = await listMyGithubRepositories();
      if (result.error) {
        setReposError(result.error);
        return;
      }
      setReposError(null);
      setRepos(result.repos);
      setSelectedRepo((current) => current || (result.repos[0]?.fullName ?? ""));
    });
    // Only re-run when the connected account itself changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubIdentity?.id]);

  if (!githubConnectAvailable) {
    return (
      <p className="rounded-md border border-dashed border-border bg-secondary px-3.5 py-3 text-sm text-muted-foreground">
        Connecting an account isn&apos;t available right now. You can still add a public link or upload files instead.
      </p>
    );
  }

  if (!githubIdentity) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Connect your GitHub account so we can check that a repository actually belongs to you — not just that a link
          matches by name.
        </p>
        <a href="/api/auth/github/connect" className={cn(buttonVariants({ size: "sm" }), "w-fit")}>
          <Link2 aria-hidden="true" className="size-3.5" />
          Connect GitHub
        </a>
      </div>
    );
  }

  function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepo) return;
    startConfirm(async () => {
      const result = await selectGithubRepositoryForItem(itemId, selectedRepo, role.trim() || null);
      if (result.error) {
        setConfirmError(result.error);
        return;
      }
      setConfirmError(null);
      setConfirmed(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <GithubConnectedCard identity={githubIdentity} />

      {isLoadingRepos && repos === null && <p className="text-sm text-muted-foreground">Loading your repositories…</p>}
      {reposError && <FieldError errors={[reposError]} />}

      {repos && repos.length === 0 && (
        <p className="text-sm text-muted-foreground">No public repositories found on this account yet.</p>
      )}

      {repos && repos.length > 0 && (
        <form onSubmit={handleConfirm} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`gh-repo-${itemId}`}>Which repository is this?</Label>
            <select
              id={`gh-repo-${itemId}`}
              className={SELECT_CLASS}
              value={selectedRepo}
              onChange={(event) => setSelectedRepo(event.target.value)}
              disabled={isConfirming}
            >
              {repos.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}
                  {repo.isFork ? " (fork)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`gh-role-${itemId}`}>What was your role?</Label>
            <Input
              id={`gh-role-${itemId}`}
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="e.g. Sole author, Contributor"
              disabled={isConfirming}
            />
          </div>

          <FieldError errors={confirmError ? [confirmError] : undefined} />
          {confirmed && <p className="text-sm text-success">Saved — this repository is now linked to your account.</p>}

          <Button type="submit" size="sm" className="w-fit" disabled={isConfirming || !selectedRepo}>
            {isConfirming ? "Saving…" : "Confirm repository"}
          </Button>
        </form>
      )}
    </div>
  );
}

export { GithubStep };
