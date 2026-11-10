import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationPage } from "@/pages/verification/reconciliation-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/reconciliation/")({
  head: pageHead("Bill Reconciliation"),
  component: ReconciliationPage,
});
