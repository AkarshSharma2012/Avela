import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";

/**
 * The authenticated app shell: a sidebar on desktop, a top bar + drawer on
 * mobile, wrapping every page under `src/app/(app)`. `LogoutButton` is a
 * Server Component rendered here and passed into the Client `MobileNav` as
 * a prop, rather than imported from within it — Client Components can't
 * import Server Components directly, only receive their rendered output.
 */
function AppShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="hidden border-r border-border bg-secondary lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex h-16 shrink-0 items-center px-6">
          <Link href="/dashboard" className="font-heading text-lg font-semibold text-foreground">
            Avela
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks />
        </div>

        <div className="border-t border-border px-4 py-4">
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Link href="/dashboard" className="font-heading text-base font-semibold text-foreground">
            Avela
          </Link>
          <MobileNav email={email} logoutSlot={<LogoutButton />} />
        </header>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export { AppShell };
