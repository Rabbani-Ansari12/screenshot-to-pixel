import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "@/pages/finance/invoices-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/invoices/")({
  head: pageHead("Invoices"),
  component: InvoicesPage,
});
