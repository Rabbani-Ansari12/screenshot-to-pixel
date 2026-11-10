import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { OrderStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, optionsFrom } from "@/components/data-table";
import { ErrorState, KpiCard } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { orderColumns } from "@/components/record-columns";
import { useOrders } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINRCompact } from "@/lib/format";
import { ClipboardList, PackageCheck, PauseCircle, Truck } from "lucide-react";

export const ORDER_STATUSES: OrderStatus[] = [
  "Draft",
  "Confirmed",
  "In Progress",
  "Completed",
  "On Hold",
  "Cancelled",
];

export function OrdersPage() {
  const { data, isLoading, error } = useOrders();
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
  const active = data?.filter((o) => ["Confirmed", "In Progress"].includes(o.status)) ?? [];
  return (
    <>
      <PageHeader
        title="Customer Orders"
        description="What each customer ordered, how much has left the quarry and how much reached the site."
        actions={
          can("manage_orders") && (
            <Button asChild>
              <Link to="/orders/new">
                <Plus className="size-4" /> New order
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active orders" value={active.length} icon={ClipboardList} />
        <KpiCard
          label="Trips on these orders"
          value={active.reduce((s, o) => s + o.tripCount, 0)}
          icon={Truck}
          tone="blue"
        />
        <KpiCard
          label="Completed"
          value={data?.filter((o) => o.status === "Completed").length ?? "—"}
          icon={PackageCheck}
          tone="green"
        />
        <KpiCard
          label={can("view_financial_reports") ? "Open order value" : "On hold"}
          value={
            can("view_financial_reports")
              ? formatINRCompact(active.reduce((s, o) => s + o.orderValue, 0))
              : (data?.filter((o) => o.status === "On Hold").length ?? "—")
          }
          icon={PauseCircle}
          tone="amber"
        />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={orderColumns({ showProfit: can("view_financial_reports") })}
        getRowId={(o) => o.id}
        rowHref={(o) => `/orders/${o.id}`}
        searchText={(o) =>
          `${o.ref} ${o.customerRef} ${o.customerName} ${o.siteName} ${o.materialsLabel}`
        }
        searchPlaceholder="Search order, PO, customer, site…"
        filters={[
          {
            id: "status",
            label: "Statuses",
            options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
            value: (o) => o.status,
          },
          {
            id: "customer",
            label: "Customers",
            options: optionsFrom(data?.map((o) => o.customerName) ?? []),
            value: (o) => o.customerName,
          },
        ]}
        dateValue={(o) => o.orderDate}
        defaultSort={{ id: "date", desc: true }}
        exportName="customer-orders"
      />
    </>
  );
}
