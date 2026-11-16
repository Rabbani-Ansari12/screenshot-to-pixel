import { createFileRoute } from "@tanstack/react-router";
import { VehicleDetailPage } from "@/pages/masters/truck-ledger-page";

export const Route = createFileRoute("/vehicles/$vehicleId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.vehicleId} · Vehicles & Drivers · Meridian Supply` }],
  }),
  component: function DetailRoute() {
    const { vehicleId } = Route.useParams();
    return <VehicleDetailPage vehicleId={vehicleId} />;
  },
});
