/**
 * React Query hooks over the service layer. Pages only talk to these hooks,
 * so moving services to Supabase needs no component changes.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as admin from "@/services/admin.service";
import * as bills from "@/services/bills.service";
import * as dashboard from "@/services/dashboard.service";
import * as documents from "@/services/documents.service";
import * as invoices from "@/services/invoices.service";
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
import * as whatsapp from "@/services/whatsapp.service";
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
  useQuery(q(["documents", id], () => documents.getDocument(id)));
export const useReviewItems = () => useQuery(q(["review"], review.listReviewItems));
export const useReviewItem = (id: string) =>
  useQuery(q(["review", id], () => review.getReviewItem(id)));
export const useOpenTrips = () => useQuery(q(["trips", "open"], review.listOpenTrips));
export const useMessages = () => useQuery(q(["whatsapp"], whatsapp.listMessages));
export const useWhatsAppStatus = () =>
  useQuery(q(["whatsapp", "status"], whatsapp.getWhatsAppStatus));
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
export const useBill = (id: string) =>
  useQuery(q(["bills", "detail", id], () => bills.getBill(id)));
export const useInvoiceVerification = (id: string) =>
  useQuery(q(["invoices", id, "verify"], () => bills.getInvoiceVerification(id)));
export const useInvoices = () => useQuery(q(["invoices"], invoices.listInvoices));
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
export const usePayments = () => useQuery(q(["payments"], payments.listPayments));
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
export const useExpenses = () => useQuery(q(["expenses"], payments.listExpenses));
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
export const useEmployees = () => useQuery(q(["employees"], admin.listEmployees));
export const useAuditEvents = () => useQuery(q(["audit"], admin.listAuditEvents));
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
  bills,
  documents,
  invoices,
  masters,
  orders,
  payments,
  purchases,
  review,
  trips,
  whatsapp,
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
