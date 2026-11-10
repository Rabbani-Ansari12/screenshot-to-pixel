import { createFileRoute } from "@tanstack/react-router";
import { OrderFormPage } from "@/pages/orders/order-form-page";

export const Route = createFileRoute("/orders/edit/$orderId")({
  head: ({ params }) => ({ meta: [{ title: `Edit ${params.orderId} · Meridian Supply` }] }),
  component: function EditOrderRoute() {
    const { orderId } = Route.useParams();
    return <OrderFormPage orderId={orderId} />;
  },
});
