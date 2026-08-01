import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";
import { SidebarAccount } from "@/components/layout/sidebar-account";
import { SidebarWeekSnapshot, type WeekSnapshot } from "@/components/layout/sidebar-week-snapshot";

/**
 * The authenticated app shell: a sidebar on desktop, a top bar + drawer on
 * mobile, wrapping every page under `src/app/(app)`. `LogoutButton` is a
 * Server Component rendered here and passed into the Client `MobileNav` as
 * a prop, rather than imported from within it — Client Components can't
 * import Server Components directly, only receive their rendered output.
 *
 * Three deliberate sidebar zones (spec section 1) so it never reads as one
 * uninterrupted dark rectangle: nav pinned to the top, one compact
 * real-data snapshot pinned to the bottom of the middle zone via
 * `mt-auto`, and the account row fixed at the very bottom.
 */
function AppShell({ email, weekSnapshot, children }: { email: string; weekSnapshot: WeekSnapshot; children: ReactNode }) {
  const logoutSlot = (
    <LogoutButton className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
  );

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex h-16 shrink-0 items-center px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="gradient-signal size-6 shrink-0 rounded-md shadow-[0_0_12px_color-mix(in_oklch,var(--primary),transparent_45%)]" />
            <span className="font-heading text-lg font-semibold text-sidebar-foreground">Avela</span>
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          <NavLinks />
          <div className="mt-auto pt-4">
            <SidebarWeekSnapshot snapshot={weekSnapshot} />
          </div>
        </div>

        <div className="border-t border-sidebar-border px-4 py-4">
          <SidebarAccount email={email} logoutSlot={logoutSlot} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
            <span className="gradient-signal size-5 shrink-0 rounded-md" />
            Avela
          </Link>
          <MobileNav email={email} weekSnapshot={weekSnapshot} logoutSlot={logoutSlot} />
        </header>

        <main id="main-content" className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export { AppShell };
