import { createFileRoute } from "@tanstack/react-router";
import { TripFormPage } from "@/pages/trips/trip-form-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/trips/new")({
  head: pageHead("Create Trip"),
  validateSearch: (
    search: Record<string, unknown>,
  ): { orderId?: string; fromDocument?: string } => ({
    ...(typeof search["orderId"] === "string" ? { orderId: search["orderId"] } : {}),
    ...(typeof search["fromDocument"] === "string" ? { fromDocument: search["fromDocument"] } : {}),
  }),
  component: function NewTripRoute() {
    const { orderId, fromDocument } = Route.useSearch();
    return (
      <TripFormPage {...(orderId ? { orderId } : {})} {...(fromDocument ? { fromDocument } : {})} />
    );
  },
});
