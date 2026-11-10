import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppPage } from "@/pages/whatsapp-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/whatsapp")({
  head: pageHead("WhatsApp Messages"),
  component: WhatsAppPage,
});
