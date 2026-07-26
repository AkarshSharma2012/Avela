// Pure helper so nav-link active state is unit-testable without rendering
// a component or mocking `next/navigation` — same rationale as
// src/lib/auth/route-rules.ts.

/** Whether a nav item's href matches the current pathname (exactly, or as an ancestor route). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
