import { createFileRoute } from "@tanstack/react-router";
import { ReconcileDetailPage } from "@/pages/verification/reconcile-detail-page";

export const Route = createFileRoute("/reconciliation/$recordId")({
  head: ({ params }) => ({ meta: [{ title: `Reconcile ${params.recordId} · Meridian Supply` }] }),
  component: function ReconcileRoute() {
    const { recordId } = Route.useParams();
    return <ReconcileDetailPage recordId={recordId} />;
  },
});
