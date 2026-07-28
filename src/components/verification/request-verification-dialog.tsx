"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestVerification, type RequestVerificationInput } from "@/lib/verification/actions";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

const METHODS: readonly { value: RequestVerificationInput["method"]; label: string }[] = [
  { value: "teacher_or_mentor", label: "Teacher or mentor" },
  { value: "organization_email", label: "Organization contact" },
  { value: "recommendation_contact", label: "Recommendation contact" },
];

/**
 * The consent step (spec section 4): shows exactly what will be shared
 * before anything is sent, requires an explicit checkbox, and warns
 * against using someone's private contact without their permission —
 * never a single "confirm" click that quietly fires off an email.
 */
function RequestVerificationDialog({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<RequestVerificationInput["method"]>("teacher_or_mentor");
  const [verifierName, setVerifierName] = useState("");
  const [verifierEmail, setVerifierEmail] = useState("");
  const [verifierOrganization, setVerifierOrganization] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await requestVerification(itemId, {
        method,
        verifierName,
        verifierEmail,
        verifierOrganization: verifierOrganization || null,
        consentGiven,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn(buttonVariants({ size: "sm" }))}>Request verification</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-[var(--duration-fast)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-5 shadow-lg transition-all duration-[var(--duration-fast)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="font-heading text-lg text-foreground">Request verification</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            For &ldquo;{itemTitle}&rdquo; — we&apos;ll send one email with a single-use link.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="verify-method">Who&apos;s confirming this?</Label>
              <select
                id="verify-method"
                className={SELECT_CLASS}
                value={method}
                onChange={(event) => setMethod(event.target.value as RequestVerificationInput["method"])}
                disabled={isPending}
              >
                {METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="verify-name">Their name</Label>
              <Input id="verify-name" value={verifierName} onChange={(e) => setVerifierName(e.target.value)} disabled={isPending} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="verify-email">Their email</Label>
              <Input
                id="verify-email"
                type="email"
                value={verifierEmail}
                onChange={(e) => setVerifierEmail(e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="verify-org">Organization (optional)</Label>
              <Input id="verify-org" value={verifierOrganization} onChange={(e) => setVerifierOrganization(e.target.value)} disabled={isPending} />
            </div>

            <div className="rounded-md border border-dashed border-border bg-secondary px-3.5 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">What they&apos;ll see:</p>
              <p className="mt-1">
                Only this one entry (&ldquo;{itemTitle}&rdquo;) — never your full portfolio, applications, or contact
                details. They can confirm it, say they can&apos;t, or ask you to fix something.
              </p>
              <p className="mt-2">Only use someone&apos;s email if you have their permission to contact them this way.</p>
            </div>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <Checkbox checked={consentGiven} onCheckedChange={(checked) => setConsentGiven(checked === true)} disabled={isPending} />
              I understand what will be shared, and I have permission to contact this person.
            </label>

            <FieldError errors={error ? [error] : undefined} />

            <div className="mt-1 flex items-center justify-end gap-2">
              <Dialog.Close className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</Dialog.Close>
              <Button type="submit" size="sm" disabled={isPending || !consentGiven}>
                {isPending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { RequestVerificationDialog };
