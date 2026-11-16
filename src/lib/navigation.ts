import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCheck,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileClock,
  FileText,
  HardHat,
  Inbox,
  Layers3,
  LayoutDashboard,
  Link2,
  Package,
  ReceiptIndianRupee,
  Scale,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/types/common";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Permission needed to see this page. Owner-only pages use "owner". */
  requires: Permission | "owner";
  badge?: "review";
  /** Reachable (links, search, breadcrumbs) but not shown in the section tab strip. */
  hidden?: boolean;
}

/**
 * A sidebar entry. The sidebar shows only sections; the pages inside a section appear as a small
 * tab strip at the top of the page, so the menu stays short.
 */
export interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  badge?: "review";
  /** false = not in the sidebar (reached from the account menu). */
  sidebar?: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard, requires: "view_records" }],
  },
  {
    label: "Receipts & Slips",
    icon: Inbox,
    badge: "review",
    items: [
      { label: "Document inbox", path: "/documents", icon: Inbox, requires: "view_records" },
      {
        label: "Review queue",
        path: "/review",
        icon: CheckCheck,
        requires: "review_documents",
        badge: "review",
      },
      { label: "Uploads & links", path: "/uploads", icon: Link2, requires: "view_records" },
    ],
  },
  {
    label: "Truck Ledger",
    icon: Truck,
    items: [
      { label: "Trips", path: "/trips", icon: Truck, requires: "view_records" },
      { label: "Vehicles & drivers", path: "/vehicles", icon: HardHat, requires: "view_records" },
      { label: "Transporters", path: "/transporters", icon: Truck, requires: "view_records" },
      { label: "Shortages", path: "/shortages", icon: ArrowLeftRight, requires: "view_records" },
    ],
  },
  {
    label: "Orders & Stock",
    icon: ClipboardList,
    items: [
      { label: "Customer orders", path: "/orders", icon: ClipboardList, requires: "view_records" },
      { label: "Purchases", path: "/purchases", icon: ArrowDownToLine, requires: "view_records" },
      { label: "Stock", path: "/stock", icon: Boxes, requires: "view_records" },
    ],
  },
  {
    label: "Money",
    icon: Wallet,
    items: [
      {
        label: "Invoices",
        path: "/invoices",
        icon: ReceiptIndianRupee,
        requires: "record_payments",
      },
      { label: "Payments", path: "/payments", icon: CreditCard, requires: "record_payments" },
      { label: "Expenses", path: "/expenses", icon: Wallet, requires: "record_payments" },
      {
        label: "Bill reconciliation",
        path: "/reconciliation",
        icon: Scale,
        requires: "verify_bills",
      },
      // Reached from the Bill reconciliation tabs and dashboard figures.
      {
        label: "Provider bills",
        path: "/bills/provider",
        icon: FileText,
        requires: "verify_bills",
        hidden: true,
      },
      {
        label: "Transporter bills",
        path: "/bills/transporter",
        icon: FileCheck2,
        requires: "verify_bills",
        hidden: true,
      },
    ],
  },
  {
    label: "Contacts",
    icon: Building2,
    items: [
      { label: "Customers", path: "/customers", icon: Building2, requires: "view_records" },
      { label: "Material providers", path: "/providers", icon: Package, requires: "view_records" },
      { label: "Materials", path: "/materials", icon: Layers3, requires: "view_records" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      {
        label: "Profit & loss",
        path: "/profit",
        icon: TrendingUp,
        requires: "view_financial_reports",
      },
      { label: "Reports", path: "/reports", icon: BarChart3, requires: "view_financial_reports" },
    ],
  },
  {
    label: "Admin",
    icon: ShieldCheck,
    sidebar: false,
    items: [
      { label: "Employees", path: "/employees", icon: Users, requires: "owner" },
      { label: "Settings", path: "/settings", icon: Settings2, requires: "owner" },
      { label: "Audit history", path: "/audit", icon: FileClock, requires: "owner" },
      { label: "System health", path: "/system", icon: Activity, requires: "owner" },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** The nav item that owns a pathname (longest matching prefix). */
export function navItemFor(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS[0];
  return (
    [...NAV_ITEMS]
      .filter(
        (item) =>
          item.path !== "/" && (pathname === item.path || pathname.startsWith(`${item.path}/`)),
      )
      .sort((a, b) => b.path.length - a.path.length)[0] ??
    (pathname.startsWith("/bills/")
      ? NAV_ITEMS.find((i) => i.path === "/bills/provider")
      : undefined)
  );
}

/** The section a nav item belongs to. */
export function sectionFor(item: NavItem | undefined): NavSection | undefined {
  return item ? NAV_SECTIONS.find((s) => s.items.includes(item)) : undefined;
}

export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

/** Pages outside the signed-in app: auth pages and the driver upload page (/u/:token). */
export const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/u/");

/** Pages still on sample data. Every page now reads live data. */
export const SAMPLE_DATA_PREFIXES: string[] = [];

export function usesSampleData(pathname: string): boolean {
  return SAMPLE_DATA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
