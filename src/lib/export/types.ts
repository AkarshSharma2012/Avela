/**
 * Portable export-adapter foundation (spec Part 11). Only two adapters are
 * implemented for real in this milestone — plain-text activity summary and
 * evidence index — everything else the spec lists (CLR-compatible record,
 * Open Badges-compatible record, school/program-specific adapters) is
 * deliberately left as future work behind this same interface, never
 * half-built.
 */

export type ExportableEvidenceItem = { filename: string; label: string | null };

export type ExportableItem = {
  title: string;
  organization: string | null;
  description: string | null;
  claimSupportHeadline: string;
  evidence: ExportableEvidenceItem[];
};

export type ExportBundle = {
  studentDisplayName: string;
  title: string;
  items: ExportableItem[];
};

export interface ExportAdapter {
  readonly kind: string;
  readonly fileExtension: string;
  generate(bundle: ExportBundle): string;
}
