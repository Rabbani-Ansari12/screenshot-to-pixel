import { createFileRoute } from "@tanstack/react-router";
import { InvoiceCreatePage } from "@/pages/finance/invoice-create-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/invoices/new")({
  head: pageHead("Create Invoice"),
  validateSearch: (search: Record<string, unknown>): { orderId?: string } =>
    typeof search["orderId"] === "string" ? { orderId: search["orderId"] } : {},
  component: function NewInvoiceRoute() {
    const { orderId } = Route.useSearch();
    return orderId ? <InvoiceCreatePage orderId={orderId} /> : <InvoiceCreatePage />;
  },
});
