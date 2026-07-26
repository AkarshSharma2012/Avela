"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";

import { NavLinks } from "@/components/layout/nav-links";

/**
 * Mobile navigation drawer. A positioned Dialog rather than Drawer — no
 * swipe-to-dismiss gesture is needed, per Base UI's own guidance ("a panel
 * that slides in from the edge of the screen and doesn't need gesture
 * support is a positioned Dialog").
 */
function MobileNav({ email, logoutSlot }: { email: string; logoutSlot: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Open navigation menu"
        className="flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-foreground/30 transition-opacity duration-[var(--duration-base)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 left-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-card p-4 shadow-md outline-none transition-transform duration-[var(--duration-page)] ease-[var(--ease-standard)] data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
          <Dialog.Description className="sr-only">
            Site navigation menu
          </Dialog.Description>

          <div className="flex items-center justify-between px-2 pb-4">
            <Dialog.Title className="font-heading text-base font-semibold text-foreground">
              Avela
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close navigation menu"
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <NavLinks onNavigate={() => setOpen(false)} />

          <div className="mt-auto border-t border-border pt-4">
            <p className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
            <div className="mt-3">{logoutSlot}</div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { MobileNav };
