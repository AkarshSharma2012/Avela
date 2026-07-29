"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { RequestVerificationDialog } from "@/components/verification/request-verification-dialog";
import { cancelVerificationRequest, resendVerificationRequest } from "@/lib/verification/actions";
import type { RequestStatus } from "@/lib/verification/request";
import type { PortfolioVerification } from "@/types/verification";

/** Step 2's "Ask someone to confirm" branch — collects who's confirming via the existing consent dialog, then shows pending/resend/cancel state exactly like the technical panel did. */
function VerifierStep({
  itemId,
  itemTitle,
  verification,
  requestStatus,
}: {
  itemId: string;
  itemTitle: string;
  verification: PortfolioVerification | null;
  requestStatus: RequestStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    startTransition(async () => {
      await cancelVerificationRequest(itemId);
      router.refresh();
    });
  }

  function handleResend() {
    startTransition(async () => {
      await resendVerificationRequest(itemId);
      router.refresh();
    });
  }

  if (requestStatus === "pending") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">Waiting on {verification?.verifier_name ?? "your verifier"} to respond.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={isPending}>
            Resend
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
            Cancel request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        We&apos;ll ask someone who knows about this — a teacher, mentor, or organization contact — to confirm it. They
        only see this one entry, never your full portfolio.
      </p>
      <RequestVerificationDialog itemId={itemId} itemTitle={itemTitle} />
    </div>
  );
}

export { VerifierStep };
