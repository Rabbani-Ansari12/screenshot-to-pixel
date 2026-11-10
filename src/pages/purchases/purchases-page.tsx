import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, optionsFrom } from "@/components/data-table";
import { DetailList, DetailSkeleton, ErrorState, InfoNote, SectionCard } from "@/components/common";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { purchaseColumns, tripColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { usePurchase, usePurchases } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatQty } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { PurchaseFormSheet, RateHistoryChart } from "./purchase-form";

export function PurchasesPage() {
  const { data, isLoading, error } = usePurchases();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Material bought from providers. Created automatically from loading slips; grouped per order, provider and month."
        actions={
          can("manage_orders") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Record purchase
            </Button>
          )
        }
      />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={purchaseColumns()}
        getRowId={(p) => p.id}
        rowHref={(p) => `/purchases/${p.id}`}
        searchText={(p) =>
          `${p.ref} ${p.providerName} ${p.materialName} ${p.orderRef ?? ""} ${p.customerName ?? ""}`
        }
        searchPlaceholder="Search purchase, provider, order…"
        filters={[
          {
            id: "provider",
            label: "Providers",
            options: optionsFrom(data?.map((p) => p.providerName) ?? []),
            value: (p) => p.providerName,
          },
          {
            id: "material",
            label: "Materials",
            options: optionsFrom(data?.map((p) => p.materialName) ?? []),
            value: (p) => p.materialName,
          },
          {
            id: "mode",
            label: "Delivery modes",
            options: [
              { value: "Direct-to-Site", label: "Direct-to-Site" },
              { value: "Stock-Yard", label: "Stock-Yard" },
            ],
            value: (p) => p.deliveryMode,
          },
          {
            id: "status",
            label: "Statuses",
            options: optionsFrom(data?.map((p) => p.status) ?? []),
            value: (p) => p.status,
          },
        ]}
        dateValue={(p) => p.date}
        defaultSort={{ id: "date", desc: true }}
        exportName="purchases"
      />
      <PurchaseFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PurchaseDetailPage({ purchaseId }: { purchaseId: string }) {
  const { data, isLoading, error } = usePurchase(purchaseId);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { purchase: p, trips, documents } = data;
  return (
    <>
      <PageHeader
        title={p.ref}
        crumbs={[{ label: p.ref }]}
        badge={<StatusBadge status={p.status} />}
        description={`${p.providerName} · ${p.materialName} · ${formatDate(p.date)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <SectionCard title="Purchase details">
          <DetailList
            columns={3}
            items={[
              {
                label: "Provider",
                value: (
                  <Link
                    to="/providers/$providerId"
                    params={{ providerId: p.providerId }}
                    className="text-primary hover:underline"
                  >
                    {p.providerName}
                  </Link>
                ),
              },
              { label: "Material", value: p.materialName },
              { label: "Quantity", value: formatQty(p.quantity, p.unit) },
              { label: "Purchase rate", value: `${formatINR(p.rate)} / ${p.unit}` },
              { label: "Material cost", value: formatINR(p.baseAmount) },
              {
                label: "Landed rate",
                value: `${formatINR(p.landedRate, { paise: true })} / ${p.unit}`,
                hint: "Including additional costs, before transport",
              },
              {
                label: "Delivery mode",
                value: p.deliveryMode,
                hint:
                  p.deliveryMode === "Direct-to-Site"
                    ? "Does not affect stock"
                    : (p.yardName ?? ""),
              },
              {
                label: "Linked order",
                value: p.orderId ? (
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: p.orderId }}
                    className="text-primary hover:underline"
                  >
                    {p.orderRef}
                  </Link>
                ) : (
                  "Stock purchase"
                ),
              },
              {
                label: "Source",
                value: p.source === "WhatsApp" ? "Created from WhatsApp slips" : "Entered manually",
              },
            ]}
          />
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-medium">Additional costs</p>
            <ul className="space-y-1 text-sm">
              {p.additionalCosts.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">{formatINR(c.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(p.totalAmount)}</span>
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Rate history" description={`${p.providerName} · ${p.materialName}`}>
          <RateHistoryChart providerId={p.providerId} materialId={p.materialId} current={p.rate} />
        </SectionCard>
      </div>
      <SectionCard title={`Trips (${trips.length})`} className="mt-4">
        <SimpleTable
          rows={trips}
          getRowId={(t) => t.id}
          rowHref={(t) => `/trips/${t.id}`}
          columns={tripColumns({ hide: ["provider", "order", "driver", "transporter"] })}
          empty={
            p.deliveryMode === "Stock-Yard"
              ? "Stock purchases are received at the yard, not on trips."
              : "No trips"
          }
        />
      </SectionCard>
      <SectionCard title="Attached documents" className="mt-4">
        {documents.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {documents.map((d) => (
              <li key={d.id}>
                <Link
                  to="/documents/$documentId"
                  params={{ documentId: d.id }}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
                >
                  <DocumentThumbnail type={d.type} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.type}</p>
                    <p className="text-xs text-muted-foreground">{d.id}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <InfoNote>
            No documents attached. Slips received before WhatsApp automation went live (Oct 2026)
            were entered manually.
          </InfoNote>
        )}
      </SectionCard>
    </>
  );
}
