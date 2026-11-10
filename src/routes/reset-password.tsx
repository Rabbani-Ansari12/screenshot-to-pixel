import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/pages/auth/reset-password-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/reset-password")({
  head: pageHead("Set a new password"),
  component: ResetPasswordPage,
});
