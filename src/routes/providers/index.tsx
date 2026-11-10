import { createFileRoute } from "@tanstack/react-router";
import { ProvidersPage } from "@/pages/masters/parties";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/providers/")({
  head: pageHead("Material Providers"),
  component: ProvidersPage,
});
