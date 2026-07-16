import {
  LayoutDashboard,
  Users,
  Landmark,
  Wallet,
  Dices,
  BarChart3,
  ScrollText,
  Settings,
  CalendarDays,
} from "lucide-react";

import { Permission } from "@/core/auth/permissions";

/**
 * Navigation, declared once with the permission each item requires.
 *
 * Hiding a link is a courtesy, not a control — the service layer is what actually
 * refuses. This exists so the sidebar doesn't advertise doors that won't open.
 *
 * `soon: true` marks routes not built yet (Phase 2). They render disabled rather
 * than being hidden, so the shape of the product is visible without pretending
 * the page exists.
 */
export const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: Permission.ORG_VIEW,
  },
  {
    href: "/committees",
    label: "Committees",
    icon: Landmark,
    permission: Permission.COMMITTEE_VIEW,
  },
  {
    href: "/members",
    label: "Members",
    icon: Users,
    permission: Permission.MEMBER_VIEW,
  },
  {
    href: "/payments",
    label: "Payments",
    icon: Wallet,
    permission: Permission.PAYMENT_VIEW,
  },
  {
    href: "/draws",
    label: "Draws",
    icon: Dices,
    permission: Permission.DRAW_VIEW,
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    permission: Permission.COMMITTEE_VIEW,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    permission: Permission.REPORT_VIEW,
  },
  {
    href: "/audit",
    label: "Audit log",
    icon: ScrollText,
    permission: Permission.AUDIT_VIEW,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    permission: Permission.SETTINGS_VIEW,
  },
];
