/**
 * React Query hooks over the service layer. Pages only talk to these hooks,
 * so moving services to Supabase needs no component changes.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import * as admin from "@/services/admin.service";
import * as bills from "@/services/bills.service";
import * as dashboard from "@/services/dashboard.service";
import * as documents from "@/services/documents.service";
import * as invoices from "@/services/invoices.service";
import * as links from "@/services/links.service";
import * as masters from "@/services/masters.service";
import * as orders from "@/services/orders.service";
import * as payments from "@/services/payments.service";
import * as profit from "@/services/profit.service";
import * as purchases from "@/services/purchases.service";
import * as reports from "@/services/reports.service";
import * as review from "@/services/review.service";
import * as search from "@/services/search.service";
import * as stock from "@/services/stock.service";
import * as trips from "@/services/trips.service";
import type { TableQuery } from "@/services/supabase/table-query";
import type { Employee, Permission } from "@/types";

const STALE = 30_000;
const q = <T>(key: unknown[], fn: () => Promise<T>, enabled = true) => ({
  queryKey: key,
  queryFn: fn,
  staleTime: STALE,
  enabled,
});

// ---------- Reads ----------
export const useDashboard = () => useQuery(q(["dashboard"], dashboard.getDashboard));
export const useDocuments = () => useQuery(q(["documents"], documents.listDocuments));
export const useDocument = (id: string) =>
  useQuery(q(["documents", id], () => documents.getDocument(id), Boolean(id)));
export const useReviewItems = () => useQuery(q(["review"], review.listReviewItems));
export const useReviewItem = (id: string) =>
  useQuery(q(["review", id], () => review.getReviewItem(id)));
export const useOpenTrips = (enabled = true) =>
  useQuery(q(["trips", "open"], review.listOpenTrips, enabled));
export const useOrders = () => useQuery(q(["orders"], orders.listOrders));
/** Server-side page of orders; keeps the previous page on screen while the next one loads. */
export const useOrdersPage = (query: TableQuery | null) =>
  useQuery({
    ...q(
      ["orders", "page", query],
      () => orders.listOrdersPage(query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
export const useOrderSummary = () => useQuery(q(["orders", "summary"], orders.getOrderSummary));
export const useOrder = (id: string) =>
  useQuery(q(["orders", id], () => orders.getOrder(id), Boolean(id)));
export const useOrderRecord = (id: string) =>
  useQuery(q(["orders", id, "record"], () => orders.getOrderRecord(id), Boolean(id)));
export const usePurchases = () => useQuery(q(["purchases"], purchases.listPurchases));
export const usePurchasesPage = (query: TableQuery | null) =>
  useQuery({
    ...q(
      ["purchases", "page", query],
      () => purchases.listPurchasesPage(query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
export const usePurchase = (id: string) =>
  useQuery(q(["purchases", id], () => purchases.getPurchase(id)));
export const useRateHistory = (providerId: string, materialId: string) =>
  useQuery(
    q(
      ["purchases", "rates", providerId, materialId],
      () => purchases.getRateHistory(providerId, materialId),
      Boolean(providerId && materialId),
    ),
  );
export const useTrips = () => useQuery(q(["trips"], trips.listTrips));
export const useTripsPage = (query: TableQuery | null) =>
  useQuery({
    ...q(["trips", "page", query], () => trips.listTripsPage(query as TableQuery), Boolean(query)),
    placeholderData: keepPreviousData,
  });
export const useTrip = (id: string) => useQuery(q(["trips", id], () => trips.getTrip(id)));
export const useShortages = () => useQuery(q(["trips", "shortages"], trips.listShortages));
export const useStock = (yardId: string) =>
  useQuery(q(["stock", yardId], () => stock.getStock(yardId)));
export const useBills = (kind?: "Provider" | "Transporter") =>
  useQuery(q(["bills", kind ?? "all"], () => bills.listBills(kind)));
export const useBillsPage = (kind: "Provider" | "Transporter" | null, query: TableQuery | null) =>
  useQuery({
    ...q(
      ["bills", "page", kind ?? "all", query],
      () => bills.listBillsPage(kind, query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
/** Receivable / payable / month totals across every row the user may see (not one page). */
export const useFinanceTotals = () => useQuery(q(["bills", "totals"], bills.getFinanceTotals));
export const useReconTarget = (id: string) =>
  useQuery(q(["bills", "target", id], () => bills.reconTargetKind(id), Boolean(id)));
export const useBill = (id: string) =>
  useQuery(q(["bills", "detail", id], () => bills.getBill(id)));
export const useInvoiceVerification = (id: string) =>
  useQuery(q(["invoices", id, "verify"], () => bills.getInvoiceVerification(id)));
export const useInvoices = () => useQuery(q(["invoices"], () => invoices.listInvoices()));
export const useInvoicesPage = (query: TableQuery | null) =>
  useQuery({
    ...q(
      ["invoices", "page", query],
      () => invoices.listInvoicesPage(query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
export const useInvoice = (id: string) =>
  useQuery(q(["invoices", id], () => invoices.getInvoice(id)));
export const useInvoiceableTrips = (orderId: string) =>
  useQuery(
    q(
      ["invoices", "trips", orderId],
      () => invoices.getInvoiceableTrips(orderId),
      Boolean(orderId),
    ),
  );
export const usePayments = () => useQuery(q(["payments"], () => payments.listPayments()));
export const usePaymentsPage = (query: TableQuery | null) =>
  useQuery({
    ...q(
      ["payments", "page", query],
      () => payments.listPaymentsPage(query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
export const useOutstanding = () =>
  useQuery(q(["payments", "outstanding"], payments.getOutstanding));
export const useOpenDocuments = (
  partyType: "Customer" | "Provider" | "Transporter",
  partyId: string,
) =>
  useQuery(
    q(
      ["payments", "open", partyType, partyId],
      () => payments.listOpenDocuments(partyType, partyId),
      Boolean(partyId),
    ),
  );
export const usePaymentTarget = (id: string) =>
  useQuery(q(["payments", "target", id], () => payments.paymentTarget(id), Boolean(id)));
export const useExpenses = () => useQuery(q(["expenses"], () => payments.listExpenses()));
export const useExpensesPage = (query: TableQuery | null) =>
  useQuery({
    ...q(
      ["expenses", "page", query],
      () => payments.listExpensesPage(query as TableQuery),
      Boolean(query),
    ),
    placeholderData: keepPreviousData,
  });
export const useExpenseCategoryTotals = () =>
  useQuery(q(["expenses", "categories"], payments.expenseCategoryTotals));
export const useOrderProfits = () => useQuery(q(["profit", "orders"], profit.getOrderProfits));
export const useMonthlyProfits = () => useQuery(q(["profit", "monthly"], profit.getMonthlyProfits));
export const useLandedCosts = () => useQuery(q(["profit", "landed"], profit.getLandedCosts));
export const useCustomers = () => useQuery(q(["customers"], masters.listCustomers));
export const useCustomer = (id: string) =>
  useQuery(q(["customers", id], () => masters.getCustomer(id)));
export const useProviders = () => useQuery(q(["providers"], masters.listProviders));
export const useProvider = (id: string) =>
  useQuery(q(["providers", id], () => masters.getProvider(id)));
export const useTransporters = () => useQuery(q(["transporters"], masters.listTransporters));
export const useTransporter = (id: string) =>
  useQuery(q(["transporters", id], () => masters.getTransporter(id)));
export const useVehicles = () => useQuery(q(["vehicles"], masters.listVehicles));
export const useVehicle = (id: string) =>
  useQuery(q(["vehicles", id], () => masters.getVehicle(id)));
export const useMaterials = () => useQuery(q(["materials"], masters.listMaterials));
export const useMaterial = (id: string) =>
  useQuery(q(["materials", id], () => masters.getMaterial(id)));
export const useMasterOptions = () => useQuery(q(["options"], masters.getMasterOptions));
export const useReport = (id: reports.ReportId, filters: reports.ReportFilters) =>
  useQuery(q(["reports", id, filters], () => reports.getReport(id, filters)));
export const useDriverLinks = () => useQuery(q(["links"], links.listLinks));
export const useTripLinks = (tripCode: string) =>
  useQuery(q(["links", "trip", tripCode], () => links.getTripLinks(tripCode), Boolean(tripCode)));
export const useIntakeStats = () =>
  useQuery({ ...q(["documents", "intake-stats"], links.getIntakeStats), refetchInterval: 60_000 });
export const useRecentUploads = () =>
  useQuery(q(["documents", "recent"], () => links.listRecentUploads()));
export const useEmployees = () => useQuery(q(["employees"], admin.listEmployees));
export const useAuditEvents = () => useQuery(q(["audit"], admin.listAuditEvents));
export const useAuditPage = (query: TableQuery | null) =>
  useQuery({
    ...q(["audit", "page", query], () => admin.listAuditPage(query as TableQuery), Boolean(query)),
    placeholderData: keepPreviousData,
  });
export const useAuditUsers = () => useQuery(q(["audit", "users"], admin.auditUsers));
/** Signed preview link for a document (null when it has none); refreshed before it expires. */
export const useThumbUrl = (storagePath: string | undefined) =>
  useQuery({
    queryKey: ["documents", "thumb", storagePath],
    queryFn: () => documents.thumbUrl(storagePath ?? ""),
    enabled: Boolean(storagePath),
    staleTime: 240_000,
    retry: false,
  });
export const useFailedJobs = () => useQuery(q(["system", "jobs"], admin.listFailedJobs));
export const useErrorLogs = () => useQuery(q(["system", "errors"], () => admin.listErrorLogs()));
export const useSettings = () => useQuery(q(["settings"], admin.getSettings));
export const useNotifications = () => useQuery(q(["notifications"], admin.listNotifications));
export const useGlobalSearch = (query: string) =>
  useQuery(q(["search", query], () => search.globalSearch(query), query.trim().length >= 2));

// ---------- Writes ----------
/**
 * Mutation that toasts the outcome and refreshes data afterwards.
 * Pass `invalidate` (query-key prefixes) to refresh only what the write can change;
 * by default everything is refreshed, because one write (e.g. a trip) changes orders,
 * stock, shortages and masters statistics at once.
 */
export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  success?: string | ((result: TResult) => string),
  options: { invalidate?: unknown[][] } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (options.invalidate)
        await Promise.all(
          options.invalidate.map((queryKey) => client.invalidateQueries({ queryKey })),
        );
      else await client.invalidateQueries();
      if (success) toast.success(typeof success === "function" ? success(result) : success);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Something went wrong"),
  });
}

export const api = {
  admin,
  links,
  stock,
  bills,
  documents,
  invoices,
  masters,
  orders,
  payments,
  purchases,
  review,
  trips,
};

/**
 * Permission switch with an optimistic update: the switch flips at once, rolls back if the
 * server refuses, and the list is refetched either way. Safe because it is a single toggle
 * the owner can see and retry.
 */
export function useSetPermission() {
  const client = useQueryClient();
  type Vars = { id: string; key: Permission; on: boolean };
  return useMutation({
    mutationFn: (v: Vars) => admin.setPermission(v.id, v.key, v.on),
    onMutate: async (v: Vars) => {
      await client.cancelQueries({ queryKey: ["employees"] });
      const previous = client.getQueryData<Employee[]>(["employees"]);
      client.setQueryData<Employee[]>(["employees"], (list) =>
        list?.map((e) =>
          e.id === v.id
            ? {
                ...e,
                permissions: v.on
                  ? [...new Set([...e.permissions, v.key])]
                  : e.permissions.filter((p) => p !== v.key),
              }
            : e,
        ),
      );
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(["employees"], ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not change the permission");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["employees"] });
      void client.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/** Marks notifications read when the bell is opened. */
export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: admin.markNotificationsRead,
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/**
 * Live updates: document status changes from the AI worker, new notifications and job progress
 * refresh the inbox, review queue, trips and the bell without a reload. RLS applies to realtime too.
 */
export function useLiveUpdates(enabled: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured()) return;
    const sb = getSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keys = new Set<string>();
    const refresh = (...k: string[]) => {
      k.forEach((x) => keys.add(x));
      clearTimeout(timer);
      timer = setTimeout(() => {
        keys.forEach((key) => void client.invalidateQueries({ queryKey: [key] }));
        keys.clear();
      }, 400);
    };
    const channel = sb
      .channel("live-documents")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () =>
        refresh("documents", "review", "trips", "orders", "stock", "links", "dashboard"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "document_jobs" }, () =>
        refresh("documents"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        refresh("notifications"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "truck_trips" }, () =>
        refresh("trips", "orders", "stock", "dashboard", "profit"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () =>
        refresh("payments", "invoices", "bills", "dashboard"),
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [enabled, client]);
}
