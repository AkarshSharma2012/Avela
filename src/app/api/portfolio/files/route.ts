import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/dal";
import * as repo from "@/lib/portfolio/repository";
import { buildPortfolioStoragePath, sanitizeOriginalFilename, validatePortfolioFileSize, validatePortfolioFileType } from "@/lib/portfolio/storage";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioFileMimeType } from "@/types/database";

/**
 * A plain Route Handler rather than a Server Action — the one exception in
 * this milestone. Server Actions have no way to report real upload
 * progress; a Route Handler called via `XMLHttpRequest.upload.onprogress`
 * (see components/portfolio/file-upload-form.tsx) does. Everything else
 * about it follows the same rules as every Server Action here: identity
 * comes from the authenticated session (never a client-supplied user id),
 * every write is scoped to that user, and the service-role key is never
 * read.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in to upload a file." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const portfolioItemIdRaw = formData.get("portfolioItemId");
  const labelRaw = formData.get("label");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was received." }, { status: 400 });
  }

  const portfolioItemId = typeof portfolioItemIdRaw === "string" && portfolioItemIdRaw.length > 0 ? portfolioItemIdRaw : null;
  const label = typeof labelRaw === "string" && labelRaw.trim().length > 0 ? labelRaw.trim().slice(0, 200) : null;

  const typeError = validatePortfolioFileType(file.type);
  if (typeError) return NextResponse.json({ error: typeError }, { status: 400 });

  const sizeError = validatePortfolioFileSize(file.size);
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 });

  const supabase = await createClient();

  if (portfolioItemId) {
    const item = await repo.getPortfolioItem(supabase, user.id, portfolioItemId);
    if (!item) {
      return NextResponse.json({ error: "Couldn't find that portfolio item." }, { status: 404 });
    }
  }

  const mimeType = file.type as PortfolioFileMimeType;
  const storagePath = buildPortfolioStoragePath(user.id, portfolioItemId, mimeType);

  const { error: uploadError } = await repo.uploadPortfolioFileObject(supabase, storagePath, file, mimeType);
  if (uploadError) {
    console.error("[portfolio] failed to upload file:", uploadError);
    return NextResponse.json({ error: "Couldn't upload that file. Please try again." }, { status: 500 });
  }

  const { fileId, error: insertError } = await repo.insertPortfolioFileRow(supabase, user.id, {
    portfolioItemId,
    storagePath,
    originalFilename: sanitizeOriginalFilename(file.name),
    mimeType,
    fileSize: file.size,
    label,
  });

  if (insertError || !fileId) {
    console.error("[portfolio] failed to save file record, cleaning up storage object:", insertError);
    await repo.removePortfolioStorageObjects(supabase, [storagePath]);
    return NextResponse.json({ error: "Couldn't save that file. Please try again." }, { status: 500 });
  }

  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  if (portfolioItemId) revalidatePath(`/portfolio/items/${portfolioItemId}`);

  return NextResponse.json({ fileId, storagePath, originalFilename: sanitizeOriginalFilename(file.name), mimeType, fileSize: file.size });
}
