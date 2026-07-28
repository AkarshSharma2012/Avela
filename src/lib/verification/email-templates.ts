/**
 * Builds the one-time verification-request email — deliberately minimal:
 * the verifier ever sees the single claim being verified (title,
 * organization, item type, dates), never the student's full portfolio,
 * application list, or any unrelated profile data (spec section 8).
 */

import { PORTFOLIO_ITEM_TYPE_LABELS } from "@/lib/portfolio/constants";
import type { EmailMessage } from "@/lib/email/provider";
import type { PortfolioItemType } from "@/types/database";

export type VerificationRequestEmailInput = {
  verifierName: string;
  studentDisplayName: string;
  itemTitle: string;
  itemType: PortfolioItemType;
  itemOrganization: string | null;
  dateRangeLabel: string | null;
  verificationUrl: string;
  expiryDaysFromNow: number;
};

export function buildVerificationRequestEmail(input: VerificationRequestEmailInput): Omit<EmailMessage, "to"> {
  const typeLabel = PORTFOLIO_ITEM_TYPE_LABELS[input.itemType].toLowerCase();
  const orgLine = input.itemOrganization ? ` with ${input.itemOrganization}` : "";
  const dateLine = input.dateRangeLabel ? ` (${input.dateRangeLabel})` : "";

  const subject = `Quick confirmation for ${input.studentDisplayName} on Avela`;
  const text = [
    `Hi ${input.verifierName},`,
    "",
    `${input.studentDisplayName} listed the following on their Avela student portfolio and asked you to confirm it:`,
    "",
    `${typeLabel}: "${input.itemTitle}"${orgLine}${dateLine}`,
    "",
    `This link only lets you respond to this one entry — you won't see any other part of ${input.studentDisplayName}'s portfolio or applications.`,
    "",
    input.verificationUrl,
    "",
    `This link expires in ${input.expiryDaysFromNow} days and can only be used once.`,
    "",
    `If you weren't expecting this or don't recognize ${input.studentDisplayName}, you can safely ignore this email.`,
  ].join("\n");

  return { subject, text };
}
