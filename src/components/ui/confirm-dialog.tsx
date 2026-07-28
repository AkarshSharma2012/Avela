"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A small "are you sure?" dialog for permanent, hard-to-reverse actions — used for deleting a portfolio item or a file. Uncontrolled: the trigger opens it, either Dialog.Close button closes it, and `onConfirm` only ever fires from the confirm button. */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root>
      {/* Unstyled by design — the caller's `trigger` node supplies its own full visual appearance (an icon button, a destructive button, etc.), this just makes it clickable/keyboard-operable as the dialog's opener. */}
      <Dialog.Trigger className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-[var(--duration-fast)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-5 shadow-lg transition-all duration-[var(--duration-fast)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="font-heading text-lg text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">{description}</Dialog.Description>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>{cancelLabel}</Dialog.Close>
            <Dialog.Close className={cn(buttonVariants({ variant: "destructive", size: "sm" }))} onClick={onConfirm}>
              {confirmLabel}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { ConfirmDialog };
