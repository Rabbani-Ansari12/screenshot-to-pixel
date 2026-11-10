import type { ReactNode } from "react";
import type { Permission } from "@/types";
import { usePermission } from "@/lib/auth";

/**
 * Renders children only when the signed-in user has the permission (owner has all).
 * Cosmetic only: the database (RLS) rejects anything the user is not allowed to do.
 *
 *   <Can permission="manage_orders"><Button>New order</Button></Can>
 *   <Can permission="view_financial_reports" fallback="—">{formatINR(profit)}</Can>
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | "owner";
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{usePermission(permission) ? children : fallback}</>;
}
