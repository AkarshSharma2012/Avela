/**
 * Dependency-free file-path and filename logic for the portfolio file
 * vault — no Supabase import, so it's unit-testable without mocking
 * Storage. See repository.ts for the actual upload/signed-URL calls that
 * use these helpers.
 */

import {
  ALLOWED_PORTFOLIO_MIME_TYPES,
  MAX_PORTFOLIO_FILE_SIZE_BYTES,
  PORTFOLIO_MIME_EXTENSIONS,
} from "@/lib/portfolio/constants";
import type { PortfolioFileMimeType } from "@/types/database";

export function isAllowedPortfolioMimeType(mimeType: string): mimeType is PortfolioFileMimeType {
  return (ALLOWED_PORTFOLIO_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Never trusts a client-supplied MIME type without checking it against the fixed allowlist — rejects anything executable or otherwise unrecognized, including a browser's occasionally-wrong guess. */
export function validatePortfolioFileType(mimeType: string): string | null {
  if (!isAllowedPortfolioMimeType(mimeType)) {
    return "That file type isn't supported. Upload a PDF, Word document (.docx), PNG, or JPG.";
  }
  return null;
}

export function validatePortfolioFileSize(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "That file looks empty or invalid.";
  }
  if (sizeBytes > MAX_PORTFOLIO_FILE_SIZE_BYTES) {
    const limitMb = Math.round(MAX_PORTFOLIO_FILE_SIZE_BYTES / (1024 * 1024));
    return `That file is too large. The limit is ${limitMb}MB.`;
  }
  return null;
}

const MAX_FILENAME_LENGTH = 150;

/** ASCII control characters (codes 0-31 and 127) — checked by code point rather than a regex escape, so no literal control byte ever has to appear in this source file. */
function isControlCharCode(code: number): boolean {
  return code <= 31 || code === 127;
}

/**
 * Strips path separators and control characters — used only for the
 * *displayed* original_filename column, never for the actual storage path
 * (always server-generated, see buildPortfolioStoragePath below). A
 * student's own filename should never be trusted as safe to render, log,
 * or use as part of a real file path.
 */
export function sanitizeOriginalFilename(filename: string): string {
  const noSeparators = filename.split("\\").join("_").split("/").join("_");
  const noControlChars = Array.from(noSeparators)
    .filter((char) => !isControlCharCode(char.charCodeAt(0)))
    .join("");
  const stripped = noControlChars.trim();
  const safe = stripped.length === 0 ? "file" : stripped;
  return safe.length > MAX_FILENAME_LENGTH ? safe.slice(0, MAX_FILENAME_LENGTH) : safe;
}

export type RandomIdFn = () => string;

/**
 * "<user_id>/<item_id-or-'unfiled'>/<random>.<ext>" — the storage bucket's
 * entire RLS policy (see the migration) trusts that the leading path
 * segment is always a real, session-verified user id, which is exactly why
 * this function — never the client — is the only thing that ever builds a
 * storage_path. Using a random filename rather than the original one means
 * whatever a student named the file on their own machine never becomes
 * part of the path, so it can never be used to escape the user's own
 * prefix or collide with another object.
 */
export function buildPortfolioStoragePath(
  userId: string,
  portfolioItemId: string | null,
  mimeType: PortfolioFileMimeType,
  randomId: RandomIdFn = () => crypto.randomUUID()
): string {
  const extension = PORTFOLIO_MIME_EXTENSIONS[mimeType];
  const folder = portfolioItemId ?? "unfiled";
  return `${userId}/${folder}/${randomId()}.${extension}`;
}
