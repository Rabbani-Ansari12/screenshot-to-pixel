import { createFileRoute } from "@tanstack/react-router";
import { ProviderDetailPage } from "@/pages/masters/parties";

export const Route = createFileRoute("/providers/$providerId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.providerId} · Material Providers · Meridian Supply` }],
  }),
  component: function DetailRoute() {
    const { providerId } = Route.useParams();
    return <ProviderDetailPage providerId={providerId} />;
  },
});
