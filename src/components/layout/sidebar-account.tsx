import type { ReactNode } from "react";

/**
 * The sidebar's bottom identity zone (spec section 1) — a small avatar
 * initial plus the account email, shared between the desktop sidebar and
 * the mobile drawer so both stay visually consistent.
 */
function SidebarAccount({ email, logoutSlot }: { email: string; logoutSlot: ReactNode }) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <div>
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
        >
          {initial}
        </span>
        <p className="min-w-0 truncate text-xs text-sidebar-foreground/60" title={email}>
          {email}
        </p>
      </div>
      <div className="mt-3">{logoutSlot}</div>
    </div>
  );
}

export { SidebarAccount };
