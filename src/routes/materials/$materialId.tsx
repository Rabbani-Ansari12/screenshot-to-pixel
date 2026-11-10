import { createFileRoute } from "@tanstack/react-router";
import { MaterialDetailPage } from "@/pages/masters/vehicles-materials";

export const Route = createFileRoute("/materials/$materialId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.materialId} · Materials · Meridian Supply` }],
  }),
  component: function DetailRoute() {
    const { materialId } = Route.useParams();
    return <MaterialDetailPage materialId={materialId} />;
  },
});
