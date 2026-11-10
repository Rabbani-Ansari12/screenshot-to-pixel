import { createFileRoute } from "@tanstack/react-router";
import { StockPage } from "@/pages/stock-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/stock")({
  head: pageHead("Stock Ledger"),
  component: StockPage,
});
