import { createFileRoute } from "@tanstack/react-router";
import { BillDetailPage } from "@/pages/verification/bills-page";

export const Route = createFileRoute("/bills/$billId")({
  head: ({ params }) => ({ meta: [{ title: `${params.billId} · Bill · Meridian Supply` }] }),
  component: function BillRoute() {
    const { billId } = Route.useParams();
    return <BillDetailPage billId={billId} />;
  },
});
