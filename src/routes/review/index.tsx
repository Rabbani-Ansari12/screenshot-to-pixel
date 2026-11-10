import { createFileRoute } from "@tanstack/react-router";
import { ReviewPage } from "@/pages/review/review-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/review/")({
  head: pageHead("Review Queue"),
  component: ReviewPage,
});
