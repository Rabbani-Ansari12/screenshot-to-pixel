import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "@/pages/finance/payments-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/payments")({
  head: pageHead("Payments"),
  validateSearch: (search: Record<string, unknown>): { record?: string } =>
    typeof search["record"] === "string" ? { record: search["record"] } : {},
  component: function PaymentsRoute() {
    const { record } = Route.useSearch();
    return record ? <PaymentsPage record={record} /> : <PaymentsPage />;
  },
});
