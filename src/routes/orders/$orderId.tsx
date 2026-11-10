import { createFileRoute } from "@tanstack/react-router";
import { OrderDetailPage } from "@/pages/orders/order-detail-page";

export const Route = createFileRoute("/orders/$orderId")({
  head: ({ params }) => ({ meta: [{ title: `${params.orderId} · Order · Meridian Supply` }] }),
  component: function OrderRoute() {
    const { orderId } = Route.useParams();
    return <OrderDetailPage orderId={orderId} />;
  },
});
