import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/pages/dashboard-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/")({
  head: pageHead("Dashboard", "Operational picture across orders, trips, documents and accounts."),
  component: DashboardPage,
});
