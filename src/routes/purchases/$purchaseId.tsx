import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDetailPage } from "@/pages/purchases/purchases-page";

export const Route = createFileRoute("/purchases/$purchaseId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.purchaseId} · Purchase · Meridian Supply` }],
  }),
  component: function PurchaseRoute() {
    const { purchaseId } = Route.useParams();
    return <PurchaseDetailPage purchaseId={purchaseId} />;
  },
});
