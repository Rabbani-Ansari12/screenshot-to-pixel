import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/pages/auth/login-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/login")({
  head: pageHead("Sign in"),
  component: LoginPage,
});
