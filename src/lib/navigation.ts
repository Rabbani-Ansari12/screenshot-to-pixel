import {
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
  MessageCircle,
  Package,
  ReceiptIndianRupee,
  Scale,
  Settings2,
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
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard, requires: "view_records" }],
  },
  {
    label: "Automation",
    items: [
      { label: "Document Inbox", path: "/documents", icon: Inbox, requires: "view_records" },
      {
        label: "Review Queue",
        path: "/review",
        icon: CheckCheck,
        requires: "review_documents",
        badge: "review",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Customer Orders", path: "/orders", icon: ClipboardList, requires: "view_records" },
      { label: "Purchases", path: "/purchases", icon: ArrowDownToLine, requires: "view_records" },
      { label: "Truck Trips", path: "/trips", icon: Truck, requires: "view_records" },
      {
        label: "Delivery & Shortages",
        path: "/shortages",
        icon: ArrowLeftRight,
        requires: "view_records",
      },
      { label: "Stock Ledger", path: "/stock", icon: Boxes, requires: "view_records" },
    ],
  },
  {
    label: "Verification",
    items: [
      {
        label: "Bill Reconciliation",
        path: "/reconciliation",
        icon: Scale,
        requires: "verify_bills",
      },
      {
        label: "Provider Bills",
        path: "/bills/provider",
        icon: FileText,
        requires: "verify_bills",
      },
      {
        label: "Transporter Bills",
        path: "/bills/transporter",
        icon: FileCheck2,
        requires: "verify_bills",
      },
    ],
  },
  {
    label: "Finance",
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
        label: "Profit & Loss",
        path: "/profit",
        icon: TrendingUp,
        requires: "view_financial_reports",
      },
    ],
  },
  {
    label: "Masters",
    items: [
      { label: "Customers", path: "/customers", icon: Building2, requires: "view_records" },
      { label: "Material Providers", path: "/providers", icon: Package, requires: "view_records" },
      { label: "Transporters", path: "/transporters", icon: Truck, requires: "view_records" },
      { label: "Vehicles & Drivers", path: "/vehicles", icon: HardHat, requires: "view_records" },
      { label: "Materials", path: "/materials", icon: Layers3, requires: "view_records" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", path: "/reports", icon: BarChart3, requires: "view_financial_reports" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Employees & Permissions", path: "/employees", icon: Users, requires: "owner" },
      { label: "Audit History", path: "/audit", icon: FileClock, requires: "owner" },
      { label: "Settings", path: "/settings", icon: Settings2, requires: "owner" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

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

export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

/**
 * Pages whose data still comes from the built-in sample data (src/data) until their module is
 * connected to Supabase. The app shell shows a notice on these pages.
 */
export const SAMPLE_DATA_PREFIXES = [
  "/reconciliation",
  "/bills",
  "/invoices",
  "/payments",
  "/expenses",
  "/profit",
  "/reports",
];

export function usesSampleData(pathname: string): boolean {
  if (pathname === "/") return true;
  return SAMPLE_DATA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
