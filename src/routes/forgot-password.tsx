import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/forgot-password")({
  head: pageHead("Reset password"),
  component: ForgotPasswordPage,
});
