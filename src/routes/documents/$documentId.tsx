import { createFileRoute } from "@tanstack/react-router";
import { DocumentDetailPage } from "@/pages/documents/document-detail-page";

export const Route = createFileRoute("/documents/$documentId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.documentId} · Document · Meridian Supply` }],
  }),
  component: function DocumentRoute() {
    const { documentId } = Route.useParams();
    return <DocumentDetailPage documentId={documentId} />;
  },
});
