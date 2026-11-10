import { createFileRoute } from "@tanstack/react-router";
import { AuditPage } from "@/pages/admin/audit-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/audit")({
  head: pageHead("Audit History"),
  component: AuditPage,
});
