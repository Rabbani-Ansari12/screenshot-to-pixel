import { createFileRoute } from "@tanstack/react-router";
import { ReviewDetailPage } from "@/pages/review/review-detail-page";

export const Route = createFileRoute("/review/$itemId")({
  head: ({ params }) => ({ meta: [{ title: `Resolve ${params.itemId} · Meridian Supply` }] }),
  component: function ReviewRoute() {
    const { itemId } = Route.useParams();
    return <ReviewDetailPage itemId={itemId} />;
  },
});
