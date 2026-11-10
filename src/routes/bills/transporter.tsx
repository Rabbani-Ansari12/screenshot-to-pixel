import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "@/pages/verification/bills-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/bills/transporter")({
  head: pageHead("Transporter Bills"),
  component: () => <BillsPage kind="Transporter" />,
});
