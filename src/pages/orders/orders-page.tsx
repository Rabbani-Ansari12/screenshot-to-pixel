import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { OrderStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ErrorState, KpiCard } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { orderColumns } from "@/components/record-columns";
import { useMasterOptions, useOrderSummary, useOrdersPage } from "@/hooks/queries";
import type { TableQuery } from "@/services/supabase/table-query";
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
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useOrdersPage(query);
  const { data: summary } = useOrderSummary();
  const { data: options } = useMasterOptions();
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
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
        <KpiCard label="Active orders" value={summary?.active ?? "—"} icon={ClipboardList} />
        <KpiCard
          label="Trips on these orders"
          value={summary?.activeTrips ?? "—"}
          icon={Truck}
          tone="blue"
        />
        <KpiCard
          label="Completed"
          value={summary?.completed ?? "—"}
          icon={PackageCheck}
          tone="green"
        />
        <KpiCard
          label={can("view_financial_reports") ? "Open order value" : "On hold"}
          value={
            can("view_financial_reports")
              ? summary
                ? formatINRCompact(summary.openValue)
                : "—"
              : (summary?.onHold ?? "—")
          }
          icon={PauseCircle}
          tone="amber"
        />
      </div>
      <DataTable
        data={data?.rows}
        isLoading={isLoading || !query}
        server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
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
            options: (options?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
            value: (o) => o.customerId,
          },
        ]}
        dateValue={(o) => o.orderDate}
        defaultSort={{ id: "date", desc: true }}
        exportName="customer-orders"
      />
    </>
  );
}
