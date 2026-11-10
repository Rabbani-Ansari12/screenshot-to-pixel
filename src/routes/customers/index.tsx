import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/pages/masters/customers";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/customers/")({
  head: pageHead("Customers"),
  component: CustomersPage,
});
