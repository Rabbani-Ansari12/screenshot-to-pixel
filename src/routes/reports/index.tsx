import { createFileRoute } from "@tanstack/react-router";
import { ReportsCatalogPage } from "@/pages/reports-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/reports/")({
  head: pageHead("Reports"),
  component: ReportsCatalogPage,
});
