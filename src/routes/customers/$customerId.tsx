import { createFileRoute } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/pages/masters/customers";

export const Route = createFileRoute("/customers/$customerId")({
  head: ({ params }) => ({
    meta: [{ title: `${params.customerId} · Customers · Meridian Supply` }],
  }),
  component: function DetailRoute() {
    const { customerId } = Route.useParams();
    return <CustomerDetailPage customerId={customerId} />;
  },
});
