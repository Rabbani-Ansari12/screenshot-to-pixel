/**
 * Smoke test: renders every page inside the real providers, auth gate and app shell
 * (without the TanStack Start HTML document shell, which jsdom can't host), against an
 * in-memory fake Supabase client with fixture rows.
 * Fails if a page throws, logs a React error, or never leaves its loading state.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import { createFakeSupabase } from "./fake-supabase";
import { EMPLOYEES, ID, ORDER_CODE, TRIP_CODE, fixtureTables } from "./fixtures";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DashboardPage } from "@/pages/dashboard-page";
import { DocumentsPage } from "@/pages/documents/documents-page";
import { DocumentDetailPage } from "@/pages/documents/document-detail-page";
import { ReviewPage } from "@/pages/review/review-page";
import { ReviewDetailPage } from "@/pages/review/review-detail-page";
import { WhatsAppPage } from "@/pages/whatsapp-page";
import { OrdersPage } from "@/pages/orders/orders-page";
import { OrderFormPage } from "@/pages/orders/order-form-page";
import { OrderDetailPage } from "@/pages/orders/order-detail-page";
import { PurchaseDetailPage, PurchasesPage } from "@/pages/purchases/purchases-page";
import { TripsPage } from "@/pages/trips/trips-page";
import { TripFormPage } from "@/pages/trips/trip-form-page";
import { TripDetailPage } from "@/pages/trips/trip-detail-page";
import { ShortagesPage } from "@/pages/shortages-page";
import { StockPage } from "@/pages/stock-page";
import { ReconciliationPage } from "@/pages/verification/reconciliation-page";
import { ReconcileDetailPage } from "@/pages/verification/reconcile-detail-page";
import { BillDetailPage, BillsPage } from "@/pages/verification/bills-page";
import { InvoiceDetailPage, InvoicesPage } from "@/pages/finance/invoices-page";
import { InvoiceCreatePage } from "@/pages/finance/invoice-create-page";
import { PaymentsPage } from "@/pages/finance/payments-page";
import { ExpensesPage } from "@/pages/finance/expenses-page";
import { ProfitPage } from "@/pages/finance/profit-page";
import { CustomerDetailPage, CustomersPage } from "@/pages/masters/customers";
import {
  ProviderDetailPage,
  ProvidersPage,
  TransporterDetailPage,
  TransportersPage,
} from "@/pages/masters/parties";
import {
  MaterialDetailPage,
  MaterialsPage,
  VehicleDetailPage,
  VehiclesPage,
} from "@/pages/masters/vehicles-materials";
import { ReportPage, ReportsCatalogPage } from "@/pages/reports-page";
import { EmployeesPage } from "@/pages/admin/employees-page";
import { AuditPage } from "@/pages/admin/audit-page";
import { SettingsPage } from "@/pages/admin/settings-page";
import { LoginPage } from "@/pages/auth/login-page";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});
afterEach(() => {
  cleanup();
  setSupabaseClient(undefined);
});

/** Signs in as the given user (or nobody) on a fresh fake database. */
function signInAs(userId: string | null) {
  const fake = createFakeSupabase({
    tables: fixtureTables(),
    userId,
    functions: {
      "admin-manage-employee": (body) =>
        body["action"] === "list" ? { employees: EMPLOYEES } : {},
    },
  });
  setSupabaseClient(fake.client);
  return fake;
}

const PAGES: [string, RegExp, () => ReactNode][] = [
  ["/", /Good afternoon/, () => <DashboardPage />],
  ["/documents", /Document Inbox/, () => <DocumentsPage />],
  [
    "/documents/DOC-2026-1201",
    /Processing timeline/,
    () => <DocumentDetailPage documentId="DOC-2026-1201" />,
  ],
  ["/review", /Review Queue/, () => <ReviewPage />],
  ["/review/RV-041", /Decision/, () => <ReviewDetailPage itemId="RV-041" />],
  ["/whatsapp", /Incoming messages/, () => <WhatsAppPage />],
  ["/orders", /Customer Orders/, () => <OrdersPage />],
  ["/orders/new", /New customer order/, () => <OrderFormPage />],
  [`/orders/${ID.order}`, /Fulfilment by item/, () => <OrderDetailPage orderId={ID.order} />],
  [
    `/orders/edit/${ID.order}`,
    new RegExp(`Edit ${ORDER_CODE}`),
    () => <OrderFormPage orderId={ID.order} />,
  ],
  ["/purchases", /Record purchase/, () => <PurchasesPage />],
  [
    `/purchases/${ID.purchase}`,
    /Purchase details/,
    () => <PurchaseDetailPage purchaseId={ID.purchase} />,
  ],
  ["/trips", /Truck Trips/, () => <TripsPage />],
  ["/trips/new", /Loading weighbridge slip/, () => <TripFormPage />],
  [`/trips/${TRIP_CODE}`, /Loading record/, () => <TripDetailPage tripId={TRIP_CODE} />],
  ["/shortages", /Tolerance by material/, () => <ShortagesPage />],
  ["/stock", /Stock Ledger/, () => <StockPage />],
  ["/reconciliation", /Bill Reconciliation/, () => <ReconciliationPage />],
  [
    "/reconciliation/PB-2026-112",
    /Line-by-line matching/,
    () => <ReconcileDetailPage recordId="PB-2026-112" />,
  ],
  ["/bills/provider", /Provider Bills/, () => <BillsPage kind="Provider" />],
  ["/bills/transporter", /Transporter Bills/, () => <BillsPage kind="Transporter" />],
  ["/bills/TB-2026-041", /Bill lines/, () => <BillDetailPage billId="TB-2026-041" />],
  ["/invoices", /Create from deliveries/, () => <InvoicesPage />],
  ["/invoices/new", /Create invoice from deliveries/, () => <InvoiceCreatePage />],
  [
    "/invoices/INV-2026-0301",
    /Payment status/,
    () => <InvoiceDetailPage invoiceId="INV-2026-0301" />,
  ],
  [
    "/reconciliation/INV-2026-0301",
    /Verification checks/,
    () => <ReconcileDetailPage recordId="INV-2026-0301" />,
  ],
  ["/payments", /Outstanding summary/, () => <PaymentsPage />],
  ["/expenses", /By category/, () => <ExpensesPage />],
  ["/profit", /Month by month/, () => <ProfitPage />],
  ["/customers", /Add customer/, () => <CustomersPage />],
  [
    `/customers/${ID.customer}`,
    /Construction sites/,
    () => <CustomerDetailPage customerId={ID.customer} />,
  ],
  ["/providers", /Add provider/, () => <ProvidersPage />],
  [
    `/providers/${ID.provider}`,
    /Purchase value/,
    () => <ProviderDetailPage providerId={ID.provider} />,
  ],
  ["/transporters", /Add transporter/, () => <TransportersPage />],
  [
    `/transporters/${ID.transporter}`,
    /Trips above tolerance/,
    () => <TransporterDetailPage transporterId={ID.transporter} />,
  ],
  ["/vehicles", /Add vehicle/, () => <VehiclesPage />],
  [`/vehicles/${ID.vehicle}`, /Trip history/, () => <VehicleDetailPage vehicleId={ID.vehicle} />],
  ["/materials", /Add material/, () => <MaterialsPage />],
  [
    `/materials/${ID.material}`,
    /Rate history/,
    () => <MaterialDetailPage materialId={ID.material} />,
  ],
  ["/reports", /Open report/, () => <ReportsCatalogPage />],
  ["/reports/order-pl", /Order-wise P&L/, () => <ReportPage reportId="order-pl" />],
  ["/reports/shortage", /Shortage Report/, () => <ReportPage reportId="shortage" />],
  ["/employees", /Permission matrix/, () => <EmployeesPage />],
  ["/audit", /Audit History/, () => <AuditPage />],
  ["/settings", /Shortage tolerance per material/, () => <SettingsPage />],
];

/** Mirrors AppFrame in __root.tsx. */
function Frame({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/login") return <>{children}</>;
  if (!ready) return null;
  if (!user) return <LoginPage />;
  return <AppShell>{children}</AppShell>;
}

function renderAt(path: string, element: () => ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Frame>
              <Outlet />
            </Frame>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: "$",
    component: () => <>{element()}</>,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("every page renders", () => {
  it.each(PAGES)(
    "%s",
    async (path, expected, element) => {
      signInAs(ID.owner);
      const errors: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
        const msg = args.map(String).join(" ");
        if (/not wrapped in act/.test(msg)) return;
        errors.push(msg.slice(0, 300));
      });
      renderAt(path, element);
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), {
        timeout: 8000,
      });
      expect(screen.queryByText("This could not be loaded")).toBeNull();
      spy.mockRestore();
      expect(errors).toEqual([]);
    },
    15000,
  );

  it("blocks owner-only pages and hides their menu items for an employee", async () => {
    signInAs(ID.employee);
    renderAt("/settings", () => <SettingsPage />);
    await waitFor(
      () => expect(screen.getByText("You don't have access to this page")).toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.queryByRole("link", { name: /Employees & Permissions/ })).toBeNull();
  }, 15000);

  it("shows the login page without a session", async () => {
    signInAs(null);
    renderAt("/orders", () => <OrdersPage />);
    await waitFor(
      () => expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument(),
      { timeout: 8000 },
    );
  }, 15000);

  it("locks out an inactive account and says why", async () => {
    signInAs(ID.inactive);
    renderAt("/orders", () => <OrdersPage />);
    await waitFor(() => expect(screen.getByText(/Your account is inactive/)).toBeInTheDocument(), {
      timeout: 8000,
    });
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  }, 15000);

  it("hides actions a restricted employee cannot use, but keeps the ones they can", async () => {
    signInAs(ID.employee); // view_records + manage_trips only
    renderAt("/trips", () => <TripsPage />);
    await waitFor(() => expect(screen.getAllByText(TRIP_CODE).length).toBeGreaterThan(0), {
      timeout: 8000,
    });
    expect(screen.getByRole("link", { name: /Create trip/ })).toBeInTheDocument();
    cleanup();
    signInAs(ID.employee);
    renderAt("/orders", () => <OrdersPage />);
    await waitFor(() => expect(screen.getAllByText(ORDER_CODE).length).toBeGreaterThan(0), {
      timeout: 8000,
    });
    expect(screen.queryByRole("link", { name: /New order/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Employees & Permissions/ })).toBeNull();
  }, 20000);
});
