"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/config/navigation";
import { isNavItemActive } from "@/lib/navigation/active-path";
import { cn } from "@/lib/utils";

/** Primary nav list — shared by the desktop sidebar and the mobile drawer. */
function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className={cn("flex flex-col gap-1", className)}>
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              active
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { NavLinks };
