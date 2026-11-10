/**
 * Smoke test: renders every page inside the real providers, auth gate and app shell
 * (without the TanStack Start HTML document shell, which jsdom can't host).
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
afterEach(() => cleanup());

const OWNER = {
  employeeId: "EMP-001",
  name: "Aarav Mehta",
  email: "aarav@meridiansupply.in",
  role: "Owner",
  designation: "Owner",
};
const EMPLOYEE = {
  employeeId: "EMP-002",
  name: "Neha Kulkarni",
  email: "neha@meridiansupply.in",
  role: "Employee",
  designation: "Operations Manager",
};

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
  [
    "/orders/ORD-2026-0117",
    /Fulfilment by item/,
    () => <OrderDetailPage orderId="ORD-2026-0117" />,
  ],
  [
    "/orders/edit/ORD-2026-0117",
    /Edit ORD-2026-0117/,
    () => <OrderFormPage orderId="ORD-2026-0117" />,
  ],
  ["/purchases", /Record purchase/, () => <PurchasesPage />],
  [
    "/purchases/PUR-2026-0146",
    /Purchase details/,
    () => <PurchaseDetailPage purchaseId="PUR-2026-0146" />,
  ],
  ["/trips", /Truck Trips/, () => <TripsPage />],
  ["/trips/new", /Loading weighbridge slip/, () => <TripFormPage />],
  ["/trips/TRP-2026-00101", /Loading record/, () => <TripDetailPage tripId="TRP-2026-00101" />],
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
  ["/customers/CUS-001", /Construction sites/, () => <CustomerDetailPage customerId="CUS-001" />],
  ["/providers", /Add provider/, () => <ProvidersPage />],
  ["/providers/PRV-001", /Purchase value/, () => <ProviderDetailPage providerId="PRV-001" />],
  ["/transporters", /Add transporter/, () => <TransportersPage />],
  [
    "/transporters/TRN-001",
    /Trips above tolerance/,
    () => <TransporterDetailPage transporterId="TRN-001" />,
  ],
  ["/vehicles", /Add vehicle/, () => <VehiclesPage />],
  ["/vehicles/VEH-06", /Trip history/, () => <VehicleDetailPage vehicleId="VEH-06" />],
  ["/materials", /Add material/, () => <MaterialsPage />],
  ["/materials/MAT-001", /Rate history/, () => <MaterialDetailPage materialId="MAT-001" />],
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
      localStorage.setItem("meridian-session", JSON.stringify(OWNER));
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
    localStorage.setItem("meridian-session", JSON.stringify(EMPLOYEE));
    renderAt("/settings", () => <SettingsPage />);
    await waitFor(
      () => expect(screen.getByText("You don't have access to this page")).toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.queryByRole("link", { name: /Employees & Permissions/ })).toBeNull();
  }, 15000);

  it("shows the login page without a session", async () => {
    localStorage.removeItem("meridian-session");
    renderAt("/orders", () => <OrdersPage />);
    await waitFor(
      () => expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument(),
      { timeout: 8000 },
    );
  }, 15000);
});
