"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A mobile bottom sheet — used for the guided-capture live preview on
 * narrow viewports (spec: "clearly labeled preview drawer"). Built on
 * `@base-ui/react/dialog` (the same primitive `confirm-dialog.tsx` already
 * uses) rather than `@base-ui/react/drawer`: the Drawer primitive is built
 * for native-style swipeable/snap-point sheets, which this feature doesn't
 * need — a bottom-anchored Dialog gets the same "clearly labeled drawer"
 * result with far less surface area. `.drawer-backdrop` / `.drawer-popup`
 * in globals.css supply the slide-up transition via Base UI's
 * data-starting-style / data-ending-style attributes.
 */
function Drawer({
  trigger,
  title,
  children,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <Dialog.Trigger className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          {trigger}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className={cn("drawer-backdrop fixed inset-0 z-50 bg-black/40")} />
        <Dialog.Popup
          className={cn(
            "drawer-popup fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lg"
          )}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="font-heading text-lg text-foreground">{title}</Dialog.Title>
            <Dialog.Close className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="mt-3">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Drawer };
