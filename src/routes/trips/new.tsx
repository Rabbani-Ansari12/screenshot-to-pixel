import { createFileRoute } from "@tanstack/react-router";
import { TripFormPage } from "@/pages/trips/trip-form-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/trips/new")({
  head: pageHead("Create Trip"),
  validateSearch: (search: Record<string, unknown>): { orderId?: string } =>
    typeof search["orderId"] === "string" ? { orderId: search["orderId"] } : {},
  component: function NewTripRoute() {
    const { orderId } = Route.useSearch();
    return orderId ? <TripFormPage orderId={orderId} /> : <TripFormPage />;
  },
});
