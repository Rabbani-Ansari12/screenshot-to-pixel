import { createFileRoute } from "@tanstack/react-router";
import { TripDetailPage } from "@/pages/trips/trip-detail-page";

export const Route = createFileRoute("/trips/$tripId")({
  head: ({ params }) => ({ meta: [{ title: `${params.tripId} · Trip · Meridian Supply` }] }),
  component: function TripRoute() {
    const { tripId } = Route.useParams();
    return <TripDetailPage tripId={tripId} />;
  },
});
