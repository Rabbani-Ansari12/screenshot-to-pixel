import { createFileRoute } from "@tanstack/react-router";
import { TransporterDetailPage } from "@/pages/masters/parties";

export const Route = createFileRoute("/transporters/$transporterId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.transporterId} · Transporters · Meridian Supply` }],
  }),
  component: function DetailRoute() {
    const { transporterId } = Route.useParams();
    return <TransporterDetailPage transporterId={transporterId} />;
  },
});
