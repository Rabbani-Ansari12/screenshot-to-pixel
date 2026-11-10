import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Warehouse } from "lucide-react";
import type { StockMovementView } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, InfoNote, PageSkeleton } from "@/components/common";
import { DataTable, optionsFrom, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useStock } from "@/hooks/queries";
import { formatDate, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StockPage() {
  const [yard, setYard] = useState("all");
  const { data, isLoading, error } = useStock(yard);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <PageSkeleton kpis={4} />;

  const columns: Column<StockMovementView>[] = [
    { id: "date", header: "Date", sortValue: (m) => m.date, cell: (m) => formatDate(m.date) },
    {
      id: "material",
      header: "Material",
      mobile: "title",
      sortValue: (m) => m.materialName,
      cell: (m) => <span className="font-medium">{m.materialName}</span>,
    },
    {
      id: "yard",
      header: "Yard",
      mobile: "subtitle",
      sortValue: (m) => m.yardName,
      cell: (m) => m.yardName,
    },
    {
      id: "type",
      header: "Movement",
      mobile: "badge",
      sortValue: (m) => m.type,
      cell: (m) => (
        <StatusBadge
          status={m.type}
          tone={m.type === "Received" ? "success" : m.type === "Issued" ? "info" : "warning"}
        />
      ),
    },
    {
      id: "ref",
      header: "Reference",
      cell: (m) =>
        m.referenceType === "Purchase" ? (
          <Link
            to="/purchases/$purchaseId"
            params={{ purchaseId: m.referenceId }}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {m.referenceId}
          </Link>
        ) : m.referenceType === "Trip" ? (
          <Link
            to="/trips/$tripId"
            params={{ tripId: m.referenceId }}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {m.referenceId}
          </Link>
        ) : (
          <span>{m.referenceId}</span>
        ),
    },
    {
      id: "received",
      header: "Received",
      align: "right",
      cell: (m) =>
        m.quantity > 0 ? (
          <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
            +{formatNumber(m.quantity, 2)}
          </span>
        ) : (
          ""
        ),
    },
    {
      id: "issued",
      header: "Issued",
      align: "right",
      cell: (m) =>
        m.quantity < 0 ? <span className="tabular-nums">{formatNumber(-m.quantity, 2)}</span> : "",
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (m) => m.balance,
      cell: (m) => (
        <span className="font-semibold tabular-nums">{formatQty(m.balance, m.unit)}</span>
      ),
    },
    {
      id: "note",
      header: "Note",
      hideBelow: "xl",
      cell: (m) => <span className="text-muted-foreground">{m.note}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Ledger"
        description="Material held in our own yards. Received from stock purchases, issued on yard trips."
        actions={
          <Select value={yard} onValueChange={setYard}>
            <SelectTrigger className="w-[220px]" aria-label="Yard">
              <Warehouse className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All yards</SelectItem>
              {data.yards.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <InfoNote className="mb-4">
        Direct-to-site deliveries don't pass through a yard, so they never change these balances.
      </InfoNote>
      <section
        aria-label="Balances by material"
        className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {data.balances.map((b) => (
          <div key={b.materialId} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{b.materialName}</p>
              <Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <p
              className={cn(
                "mt-2 font-display text-2xl font-extrabold tabular-nums",
                b.balance < 20 && "text-amber-700 dark:text-amber-300",
              )}
            >
              {formatNumber(b.balance, 1)}{" "}
              <span className="text-sm font-medium text-muted-foreground">{b.unit}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (b.balance / (b.received || 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              In {formatNumber(b.received, 0)} · Out {formatNumber(b.issued, 0)}
              {b.adjusted ? ` · Adj ${formatNumber(b.adjusted, 1)}` : ""}
            </p>
            {b.balance < 20 && (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                Running low
              </p>
            )}
          </div>
        ))}
      </section>
      <DataTable
        data={data.movements}
        columns={columns}
        getRowId={(m) => m.id}
        searchText={(m) => `${m.materialName} ${m.referenceId} ${m.yardName} ${m.note}`}
        searchPlaceholder="Search material, reference…"
        filters={[
          {
            id: "material",
            label: "Materials",
            options: optionsFrom(data.movements.map((m) => m.materialName)),
            value: (m) => m.materialName,
          },
          {
            id: "type",
            label: "Movements",
            options: ["Received", "Issued", "Adjustment"].map((s) => ({ value: s, label: s })),
            value: (m) => m.type,
          },
        ]}
        dateValue={(m) => m.date}
        defaultSort={{ id: "date", desc: true }}
        exportName="stock-ledger"
      />
    </>
  );
}
