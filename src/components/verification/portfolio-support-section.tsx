"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { AdvancedDetails } from "@/components/verification/advanced-details";
import { ClaimDimensionsPanel } from "@/components/verification/claim-dimensions-panel";
import { VerificationPanel } from "@/components/verification/verification-panel";
import { VerificationStatusCard } from "@/components/verification/verification-status-card";
import { EvidenceStep } from "@/components/verification/wizard/evidence-step";
import { GithubStep } from "@/components/verification/wizard/github-step";
import { LinkStep } from "@/components/verification/wizard/link-step";
import { MethodSelectStep } from "@/components/verification/wizard/method-select-step";
import { ResultStep } from "@/components/verification/wizard/result-step";
import { ReviewStep, type ReviewRow } from "@/components/verification/wizard/review-step";
import { StepProgress } from "@/components/verification/wizard/step-progress";
import type { SupportMethod, WizardStep } from "@/components/verification/wizard/types";
import { useWizardState } from "@/components/verification/wizard/use-wizard-state";
import { VerifierStep } from "@/components/verification/wizard/verifier-step";
import { OsintCheckPanel } from "@/components/portfolio/osint/osint-check-panel";
import type { ClaimSupportSummary } from "@/lib/claims/rollup";
import type { PersonalProjectRequiredInput } from "@/lib/portfolio/personal-project";
import type { RequestStatus } from "@/lib/verification/request";
import type { PortfolioFile } from "@/types/portfolio";
import type { ConnectedIdentitySummary } from "@/types/identity";
import type { OsintCheckWithFindings } from "@/types/osint";
import type { PortfolioVerification } from "@/types/verification";

const METHOD_STEP_TITLE: Record<Exclude<SupportMethod, "later">, string> = {
  connect_account: "Connect your account",
  add_files: "Add photos or files",
  add_link: "Add a public link",
  ask_confirm: "Ask someone to confirm",
};

const ADVANCED_DETAILS_ID = "advanced-verification-details";

function openAdvancedDetails() {
  const element = document.getElementById(ADVANCED_DETAILS_ID);
  if (element instanceof HTMLDetailsElement) {
    element.open = true;
    element.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }
}

/**
 * The Milestone 10.7 redesign's single entry point for the item workspace's
 * verification surface (spec: "Replace the current all-at-once verification
 * layout with a clean guided flow"). Owns the wizard's open/step/method
 * state, persisted to sessionStorage per item so leaving and returning
 * keeps a student's place — every field's actual value still lives in the
 * database via the same server actions the old layout used, this component
 * only ever changes how they're presented.
 */
function PortfolioSupportSection({
  item,
  files,
  verification,
  requestStatus,
  claimSupportSummary,
  osintCheck,
  osintEligible,
  githubIdentity,
  githubConnectAvailable,
  personalProjectAnswers,
}: {
  item: { id: string; title: string; role: string | null };
  files: PortfolioFile[];
  verification: PortfolioVerification | null;
  requestStatus: RequestStatus;
  claimSupportSummary: ClaimSupportSummary;
  osintCheck: OsintCheckWithFindings | null;
  osintEligible: boolean;
  githubIdentity: ConnectedIdentitySummary | null;
  githubConnectAvailable: boolean;
  personalProjectAnswers: PersonalProjectRequiredInput;
}) {
  const [state, setState] = useWizardState(item.id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.open) headingRef.current?.focus();
  }, [state.step, state.open]);

  function goToStep(step: WizardStep) {
    setState({ ...state, step });
  }

  function handleOpen() {
    setState({ open: true, step: state.method ? state.step : 1, method: state.method });
  }

  function handleSelectMethod(method: SupportMethod) {
    if (method === "later") {
      setState({ open: false, step: 1, method: null });
      return;
    }
    setState({ open: true, step: 2, method });
  }

  function handleDone() {
    setState({ ...state, open: false });
  }

  function handleAddMore() {
    setState({ open: true, step: 1, method: null });
  }

  const accountConnected = Boolean(githubIdentity);
  const evidenceAdded = files.length > 0 || Boolean(verification?.evidence_file_id) || Boolean(verification?.evidence_url);
  const publicSourceFound = Boolean(osintCheck && osintCheck.evidence.length > 0);
  const verifierRequested = requestStatus !== "not_requested";

  const reviewRows: ReviewRow[] = [
    { label: "Account connected", done: accountConnected },
    { label: "Evidence added", done: evidenceAdded },
    ...(osintEligible ? [{ label: "Public source found", done: publicSourceFound }] : []),
    { label: "Verifier requested", done: verifierRequested },
  ];

  const stepHeading =
    state.step === 1
      ? "Choose how to support this entry"
      : state.step === 2 && state.method && state.method !== "later"
        ? METHOD_STEP_TITLE[state.method]
        : state.step === 3
          ? "Review what you've added"
          : "Your support level";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <VerificationStatusCard
        summary={claimSupportSummary}
        hasAnySupport={claimSupportSummary.checkedCount > 0}
        onImprove={handleOpen}
        onSeeDetails={openAdvancedDetails}
      />

      {state.open && (
        <div className="animate-fade-up flex flex-col gap-5 rounded-xl border border-border bg-card px-5 py-5 sm:px-6 sm:py-6">
          <StepProgress step={state.step} />

          <h2 ref={headingRef} tabIndex={-1} className="font-heading text-xl text-foreground focus-visible:outline-none">
            {stepHeading}
          </h2>

          {state.step === 1 && <MethodSelectStep value={state.method} onChange={handleSelectMethod} />}

          {state.step === 2 && state.method === "connect_account" && (
            <GithubStep itemId={item.id} githubIdentity={githubIdentity} githubConnectAvailable={githubConnectAvailable} initialRole={item.role ?? ""} />
          )}
          {state.step === 2 && state.method === "add_files" && (
            <EvidenceStep itemId={item.id} files={files} hasEvidence={evidenceAdded} initialAnswers={personalProjectAnswers} />
          )}
          {state.step === 2 && state.method === "add_link" && (
            <LinkStep
              itemId={item.id}
              itemTitle={item.title}
              isReplace={evidenceAdded}
              isPublicSourceEligible={osintEligible}
              hasPublicSourceCheck={Boolean(osintCheck)}
            />
          )}
          {state.step === 2 && state.method === "ask_confirm" && (
            <VerifierStep itemId={item.id} itemTitle={item.title} verification={verification} requestStatus={requestStatus} />
          )}

          {state.step === 3 && <ReviewStep rows={reviewRows} />}

          {state.step === 4 && (
            <ResultStep summary={claimSupportSummary} onDone={handleDone} onAddMore={handleAddMore} onSeeDetails={openAdvancedDetails} />
          )}

          {(state.step === 2 || state.step === 3) && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" size="sm" onClick={() => goToStep((state.step - 1) as WizardStep)}>
                Back
              </Button>
              <Button type="button" size="sm" onClick={() => goToStep((state.step + 1) as WizardStep)}>
                Continue
              </Button>
            </div>
          )}
        </div>
      )}

      <AdvancedDetails detailsId={ADVANCED_DETAILS_ID}>
        <ClaimDimensionsPanel summary={claimSupportSummary} />
        <VerificationPanel itemId={item.id} itemTitle={item.title} verification={verification} requestStatus={requestStatus} files={files} />
        {osintEligible && <OsintCheckPanel itemId={item.id} itemTitle={item.title} check={osintCheck} />}
      </AdvancedDetails>
    </div>
  );
}

export { PortfolioSupportSection };
