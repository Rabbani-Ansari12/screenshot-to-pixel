import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "@/pages/verification/bills-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/bills/provider")({
  head: pageHead("Provider Bills"),
  component: () => <BillsPage kind="Provider" />,
});
