import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Can } from "@/components/can";
import { ProtectedRoute } from "@/components/protected-route";
import { AuthProvider, canWith, useAuth, usePermission } from "@/lib/auth";
import { setSupabaseClient } from "@/lib/supabase";
import { createFakeSupabase } from "./fake-supabase";
import { ID, fixtureTables } from "./fixtures";

afterEach(() => {
  cleanup();
  setSupabaseClient(undefined);
});

describe("canWith", () => {
  it("gives the owner every permission, including owner-only pages", () => {
    expect(canWith({ role: "Owner" }, [], "verify_bills")).toBe(true);
    expect(canWith({ role: "Owner" }, [], "owner")).toBe(true);
  });
  it("gives employees only what they were granted, never owner pages", () => {
    expect(canWith({ role: "Employee" }, ["view_records"], "view_records")).toBe(true);
    expect(canWith({ role: "Employee" }, ["view_records"], "manage_orders")).toBe(false);
    expect(canWith({ role: "Employee" }, ["view_records"], "owner")).toBe(false);
  });
  it("denies everything without a user", () => {
    expect(canWith(null, ["view_records"], "view_records")).toBe(false);
  });
});

function Probe() {
  const { user, permissions } = useAuth();
  const canOrders = usePermission("manage_orders");
  const canTrips = usePermission("manage_trips");
  return (
    <div>
      <p>user:{user?.name ?? "none"}</p>
      <p>role:{user?.role ?? "none"}</p>
      <p>perms:{permissions.join(",")}</p>
      <p>orders:{String(canOrders)}</p>
      <p>trips:{String(canTrips)}</p>
      <Can permission="view_financial_reports" fallback={<span>profit hidden</span>}>
        <span>profit ₹6,000</span>
      </Can>
      <Can permission="owner">
        <span>owner tools</span>
      </Can>
    </div>
  );
}

function renderWith(userId: string | null, child: ReactNode, path = "/") {
  setSupabaseClient(createFakeSupabase({ tables: fixtureTables(), userId }).client);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </QueryClientProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: "$",
    component: () => <>{child}</>,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <p>login page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([login, page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("AuthProvider + usePermission + <Can>", () => {
  it("loads role and permissions for an employee from profiles / user_permissions", async () => {
    renderWith(ID.employee, <Probe />);
    await waitFor(() => expect(screen.getByText("user:Neha Kulkarni")).toBeInTheDocument());
    expect(screen.getByText("role:Employee")).toBeInTheDocument();
    expect(screen.getByText("perms:view_records,manage_trips")).toBeInTheDocument();
    expect(screen.getByText("orders:false")).toBeInTheDocument();
    expect(screen.getByText("trips:true")).toBeInTheDocument();
    expect(screen.getByText("profit hidden")).toBeInTheDocument();
    expect(screen.queryByText("owner tools")).toBeNull();
  });

  it("gives the owner everything", async () => {
    renderWith(ID.owner, <Probe />);
    await waitFor(() => expect(screen.getByText("role:Owner")).toBeInTheDocument());
    expect(screen.getByText("orders:true")).toBeInTheDocument();
    expect(screen.getByText("profit ₹6,000")).toBeInTheDocument();
    expect(screen.getByText("owner tools")).toBeInTheDocument();
  });

  it("signs out an inactive account instead of loading it", async () => {
    renderWith(ID.inactive, <Probe />);
    await waitFor(() => expect(screen.getByText("user:none")).toBeInTheDocument());
  });
});

describe("ProtectedRoute", () => {
  it("redirects to /login without a session", async () => {
    renderWith(null, <ProtectedRoute>secret page</ProtectedRoute>, "/orders");
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(screen.queryByText("secret page")).toBeNull();
  });

  it("renders for a signed-in user with the permission", async () => {
    renderWith(
      ID.employee,
      <ProtectedRoute permission="manage_trips">trip form</ProtectedRoute>,
      "/trips/new",
    );
    await waitFor(() => expect(screen.getByText("trip form")).toBeInTheDocument());
  });

  it("shows no-access when the permission is missing", async () => {
    renderWith(
      ID.employee,
      <ProtectedRoute permission="owner">settings</ProtectedRoute>,
      "/settings",
    );
    await waitFor(() =>
      expect(screen.getByText("You don't have access to this page")).toBeInTheDocument(),
    );
    expect(screen.queryByText("settings")).toBeNull();
  });
});
