import { createFileRoute } from "@tanstack/react-router";
import { ProfitPage } from "@/pages/finance/profit-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/profit")({
  head: pageHead("Profit & Loss"),
  component: ProfitPage,
});
