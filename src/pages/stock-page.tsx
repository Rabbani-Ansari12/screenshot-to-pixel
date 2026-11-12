import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Plus, SlidersHorizontal, Warehouse } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import { Can } from "@/components/can";
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
import { api, useAction, useMaterials, useStock } from "@/hooks/queries";
import { formatDate, formatNumber, formatQty, todayIST } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StockPage() {
  const [yard, setYard] = useState("all");
  const [addingYard, setAddingYard] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const { data, isLoading, error } = useStock(yard);
  const { data: materials } = useMaterials();
  const adjust = useAction(api.stock.adjustStock, "Stock adjusted", { invalidate: [["stock"]] });
  const addYard = useAction(api.masters.addYard, (y) => `${y.name} added`, {
    invalidate: [["stock"], ["options"]],
  });
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
            {m.referenceLabel || m.referenceId}
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
          <span>{m.referenceLabel || m.referenceId}</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="owner">
              <Button variant="outline" onClick={() => setAddingYard(true)}>
                <Plus className="size-4" /> Add yard
              </Button>
              {data.yards.length > 0 && (
                <Button variant="outline" onClick={() => setAdjusting(true)}>
                  <SlidersHorizontal className="size-4" /> Adjust stock
                </Button>
              )}
            </Can>
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
          </div>
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
        searchText={(m) =>
          `${m.materialName} ${m.referenceLabel ?? m.referenceId} ${m.yardName} ${m.note}`
        }
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
      <QuickAddDialog
        open={addingYard}
        onOpenChange={setAddingYard}
        title="Add stock yard"
        description="A place where you keep material. Stock-yard purchases are received here."
        schema={z.object({ name: z.string().min(2, "Required"), location: z.string() })}
        defaults={{ name: "", location: "" }}
        fields={[
          { name: "name", label: "Yard name", full: true },
          { name: "location", label: "Address / location", full: true },
        ]}
        onSubmit={(v) => addYard.mutateAsync(v)}
        submitLabel="Add yard"
      />
      <QuickAddDialog
        open={adjusting}
        onOpenChange={setAdjusting}
        title="Adjust stock"
        description="Correct a yard balance after a physical count. Use a negative quantity to remove stock. Purchases and trips are not changed."
        schema={z.object({
          yardId: z.string().min(1, "Choose a yard"),
          materialId: z.string().min(1, "Choose a material"),
          quantity: z.coerce
            .number({ invalid_type_error: "Enter a quantity" })
            .refine((n) => n !== 0, "Must not be zero"),
          date: z.string().min(1, "Required"),
          reason: z.string().min(5, "Say why (saved in audit history)"),
        })}
        defaults={{
          yardId: yard === "all" ? (data.yards[0]?.id ?? "") : yard,
          materialId: "",
          quantity: 0,
          date: todayIST(),
          reason: "",
        }}
        fields={[
          {
            name: "yardId",
            label: "Yard",
            type: "select",
            options: data.yards.map((y) => ({ value: y.id, label: y.name })),
          },
          {
            name: "materialId",
            label: "Material",
            type: "select",
            options: (materials ?? []).map((m) => ({
              value: m.id,
              label: `${m.name} (${m.unit})`,
            })),
          },
          { name: "quantity", label: "Quantity (+ add / − remove)", type: "number" },
          { name: "date", label: "Date (yyyy-mm-dd)" },
          { name: "reason", label: "Reason", full: true },
        ]}
        onSubmit={(v) => adjust.mutateAsync(v)}
        submitLabel="Save adjustment"
      />
    </>
  );
}
