import { createFileRoute } from "@tanstack/react-router";
import { VehiclesPage } from "@/pages/masters/vehicles-materials";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/vehicles/")({
  head: pageHead("Vehicles & Drivers"),
  component: VehiclesPage,
});
