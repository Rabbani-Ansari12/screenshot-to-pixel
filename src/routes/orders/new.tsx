import { createFileRoute } from "@tanstack/react-router";
import { OrderFormPage } from "@/pages/orders/order-form-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/orders/new")({
  head: pageHead("New Order"),
  component: () => <OrderFormPage />,
});
