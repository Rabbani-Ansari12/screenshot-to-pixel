import { createFileRoute } from "@tanstack/react-router";
import { EmployeesPage } from "@/pages/admin/employees-page";
import { pageHead } from "@/lib/route-meta";

export const Route = createFileRoute("/employees")({
  head: pageHead("Employees & Permissions"),
  component: EmployeesPage,
});
