import { createFileRoute } from "@tanstack/react-router";
import { InvoiceDetailPage } from "@/pages/finance/invoices-page";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: ({ params }) => ({ meta: [{ title: `${params.invoiceId} · Invoice · Meridian Supply` }] }),
  component: function InvoiceRoute() {
    const { invoiceId } = Route.useParams();
    return <InvoiceDetailPage invoiceId={invoiceId} />;
  },
});
