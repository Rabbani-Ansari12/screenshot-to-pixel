import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/pages/admin/settings-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/settings")({
  head: pageHead("Settings"),
  component: SettingsPage,
});
