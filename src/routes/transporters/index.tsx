import { createFileRoute } from "@tanstack/react-router";
import { TransportersPage } from "@/pages/masters/parties";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/transporters/")({
  head: pageHead("Transporters"),
  component: TransportersPage,
});
