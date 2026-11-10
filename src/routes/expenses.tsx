import { createFileRoute } from "@tanstack/react-router";
import { ExpensesPage } from "@/pages/finance/expenses-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/expenses")({
  head: pageHead("Expenses"),
  component: ExpensesPage,
});
