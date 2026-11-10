import { createFileRoute } from "@tanstack/react-router";
import { ShortagesPage } from "@/pages/shortages-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/shortages")({
  head: pageHead("Delivery & Shortages"),
  component: ShortagesPage,
});
