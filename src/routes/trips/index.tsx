import { createFileRoute } from "@tanstack/react-router";
import { TripsPage } from "@/pages/trips/trips-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/trips/")({
  head: pageHead("Truck Trips"),
  component: TripsPage,
});
