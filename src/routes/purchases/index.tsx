import { createFileRoute } from "@tanstack/react-router";
import { PurchasesPage } from "@/pages/purchases/purchases-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/purchases/")({
  head: pageHead("Purchases"),
  component: PurchasesPage,
});
