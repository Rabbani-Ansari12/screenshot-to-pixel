import { createFileRoute } from "@tanstack/react-router";
import { SystemPage } from "@/pages/admin/system-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/system")({
  head: pageHead("System Health"),
  component: SystemPage,
});
