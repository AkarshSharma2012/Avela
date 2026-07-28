import { AlarmClock, Bookmark, ClipboardList, Compass, FolderOpen, LayoutDashboard, Settings, User, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/** Primary navigation, shared by the desktop sidebar and the mobile drawer. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Opportunities", href: "/opportunities", icon: Compass },
  { label: "Saved", href: "/saved", icon: Bookmark },
  { label: "Applications", href: "/applications", icon: ClipboardList },
  { label: "Portfolio", href: "/portfolio", icon: FolderOpen },
  { label: "Reminders", href: "/reminders", icon: AlarmClock },
  { label: "Profile", href: "/profile", icon: User },
  { label: "Settings", href: "/settings", icon: Settings },
];
