import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/pages/documents/documents-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/documents/")({
  head: pageHead("Document Inbox"),
  component: DocumentsPage,
});
