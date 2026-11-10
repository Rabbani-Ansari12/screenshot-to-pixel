import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/pages/orders/orders-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/orders/")({
  head: pageHead("Customer Orders"),
  component: OrdersPage,
});
