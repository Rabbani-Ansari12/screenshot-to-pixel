import { createFileRoute } from "@tanstack/react-router";
import { MaterialsPage } from "@/pages/masters/vehicles-materials";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/materials/")({
  head: pageHead("Materials"),
  component: MaterialsPage,
});
