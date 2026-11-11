import { createFileRoute } from "@tanstack/react-router";
import { UploadsPage } from "@/pages/uploads-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/uploads")({
  head: pageHead("Uploads & Links"),
  component: UploadsPage,
});
