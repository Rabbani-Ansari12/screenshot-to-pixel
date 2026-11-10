import { Link } from "@tanstack/react-router";
import { FileText, Pencil, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DetailList,
  DetailSkeleton,
  ErrorState,
  InfoNote,
  KpiCard,
  ProgressBar,
  SectionCard,
} from "@/components/common";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { ProfitWaterfall } from "@/components/profit-waterfall";
import {
  invoiceColumns,
  paymentColumns,
  purchaseColumns,
  tripColumns,
} from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { useOrder } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, formatINR, formatQty, formatRelative } from "@/lib/format";
import { IndianRupee, PackageCheck, Scale } from "lucide-react";

export function AuditList({
  events,
}: {
  events: {
    id: string;
    at: string;
    userName: string;
    action: string;
    entityLabel: string;
    changes: { field: string; from: string; to: string }[];
    note: string;
  }[];
}) {
  if (!events.length)
    return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="space-y-4">
      {events.map((e) => (
        <li key={e.id} className="relative border-l-2 border-border pl-4">
          <p className="text-sm">
            <span className="font-medium">{e.userName}</span> · {e.action.toLowerCase()}{" "}
            <span className="font-medium">{e.entityLabel}</span>
          </p>
          {e.changes.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {c.field}: <span className="line-through">{c.from}</span> →{" "}
              <span className="text-foreground">{c.to}</span>
            </p>
          ))}
          {e.note && <p className="text-xs text-muted-foreground">“{e.note}”</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground" title={formatDateTime(e.at)}>
            {formatRelative(e.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function OrderDetailPage({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = useOrder(orderId);
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { order, trips, purchases, documents, invoices, payments, profit, itemProgress } = data;
  const money = can("view_financial_reports");
  const invoiced = invoices.reduce((s, i) => s + i.total, 0);
  const received = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader
        title={order.ref}
        crumbs={[{ label: order.ref }]}
        badge={<StatusBadge status={order.status} />}
        description={
          <>
            {order.customerName} · {order.siteName} · PO {order.customerRef}
          </>
        }
        actions={
          <>
            {can("manage_trips") && (
              <Button variant="outline" asChild>
                <Link to="/trips/new" search={{ orderId: order.id }}>
                  <Truck className="size-4" /> Add trip
                </Link>
              </Button>
            )}
            {can("record_payments") && (
              <Button variant="outline" asChild>
                <Link to="/invoices/new" search={{ orderId: order.id }}>
                  <FileText className="size-4" /> Create invoice
                </Link>
              </Button>
            )}
            {can("manage_orders") && (
              <Button asChild>
                <Link to="/orders/edit/$orderId" params={{ orderId: order.id }}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Tabs defaultValue="overview">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList>
            {[
              "overview",
              "items",
              "purchases",
              "trips",
              "documents",
              "invoices",
              "payments",
              ...(money ? ["profit"] : []),
              "activity",
            ].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
                {t === "trips"
                  ? ` (${trips.length})`
                  : t === "documents"
                    ? ` (${documents.length})`
                    : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Required"
              value={formatQty(
                order.requiredQty,
                order.unitLabel === "mixed" ? "" : order.unitLabel,
                0,
              )}
              icon={Scale}
            />
            <KpiCard
              label="Dispatched"
              value={formatQty(
                order.dispatchedQty,
                order.unitLabel === "mixed" ? "" : order.unitLabel,
                1,
              )}
              hint={`${trips.length} trips`}
              icon={Truck}
              tone="blue"
            />
            <KpiCard
              label="Delivered"
              value={formatQty(
                order.deliveredQty,
                order.unitLabel === "mixed" ? "" : order.unitLabel,
                1,
              )}
              icon={PackageCheck}
              tone="green"
            />
            {money ? (
              <KpiCard
                label="Estimated profit"
                value={formatINR(order.estimatedProfit)}
                hint={`${profit.marginPct.toFixed(1)}% margin`}
                icon={IndianRupee}
                tone="green"
              />
            ) : (
              <KpiCard label="Invoices" value={invoices.length} icon={FileText} />
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <SectionCard title="Fulfilment by item">
              <ul className="space-y-4">
                {order.items.map((item) => {
                  const p = itemProgress.find((x) => x.itemId === item.id);
                  const name =
                    data.trips.find((t) => t.materialId === item.materialId)?.materialName ??
                    order.materialsLabel.split(", ")[order.items.indexOf(item)] ??
                    item.materialId;
                  return (
                    <li key={item.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatQty(p?.delivered ?? 0, item.unit, 1)} /{" "}
                          {formatQty(item.quantity, item.unit, 0)}
                        </span>
                      </div>
                      <ProgressBar
                        value={p?.delivered ?? 0}
                        max={item.quantity}
                        className="mt-1.5"
                        label={`${name} delivered`}
                        tone="green"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Dispatched {formatQty(p?.dispatched ?? 0, item.unit, 1)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
            <SectionCard title="Order details">
              <DetailList
                columns={2}
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: order.customerId }}
                        className="text-primary hover:underline"
                      >
                        {order.customerName}
                      </Link>
                    ),
                  },
                  { label: "Site", value: order.siteName },
                  { label: "Order date", value: formatDate(order.orderDate) },
                  { label: "Expected delivery", value: formatDate(order.expectedDelivery) },
                  { label: "Customer reference", value: order.customerRef },
                  { label: "Created by", value: order.createdBy },
                  ...(money
                    ? [
                        { label: "Order value", value: formatINR(order.orderValue) },
                        {
                          label: "Invoiced / received",
                          value: `${formatINR(invoiced)} / ${formatINR(received)}`,
                        },
                      ]
                    : []),
                ]}
              />
              {order.notes && (
                <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">{order.notes}</p>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={order.items}
              getRowId={(i) => i.id}
              columns={[
                {
                  id: "m",
                  header: "Material",
                  cell: (i) =>
                    order.materialsLabel.split(", ")[order.items.indexOf(i)] ?? i.materialId,
                },
                {
                  id: "q",
                  header: "Quantity",
                  align: "right",
                  cell: (i) => formatQty(i.quantity, i.unit, 0),
                },
                {
                  id: "r",
                  header: "Selling rate",
                  align: "right",
                  cell: (i) => `${formatINR(i.sellingRate)} / ${i.unit}`,
                },
                {
                  id: "v",
                  header: "Value",
                  align: "right",
                  cell: (i) => formatINR(i.quantity * i.sellingRate),
                },
                {
                  id: "d",
                  header: "Delivered",
                  align: "right",
                  cell: (i) =>
                    formatQty(
                      itemProgress.find((p) => p.itemId === i.id)?.delivered ?? 0,
                      i.unit,
                      1,
                    ),
                },
              ]}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="purchases" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={purchases}
              getRowId={(p) => p.id}
              rowHref={(p) => `/purchases/${p.id}`}
              columns={purchaseColumns({ hide: ["order"] })}
              empty="No purchases linked yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="trips" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={trips}
              getRowId={(t) => t.id}
              rowHref={(t) => `/trips/${t.id}`}
              columns={tripColumns({ hide: ["order", "driver", "provider"] })}
              empty="No trips yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <SectionCard>
            {documents.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: d.id }}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
                    >
                      <DocumentThumbnail type={d.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.type}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.id} · {d.link?.label} · {formatRelative(d.receivedAt)}
                        </p>
                      </div>
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No documents linked to this order's trips yet.
              </p>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={invoices}
              getRowId={(i) => i.id}
              rowHref={(i) => `/invoices/${i.id}`}
              columns={invoiceColumns({ hide: ["customer"] })}
              empty="Not invoiced yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={payments}
              getRowId={(p) => p.id}
              columns={paymentColumns({ hide: ["party"] })}
              empty="No payments received yet"
            />
          </SectionCard>
        </TabsContent>
        {money && (
          <TabsContent value="profit" className="mt-4 space-y-4">
            <SectionCard
              title="Landed cost breakdown"
              description="Sales at delivery weight × order rate, minus every cost recorded against this order."
              actions={
                <StatusBadge
                  status={
                    order.status === "Completed" &&
                    invoices.every((i) => i.paymentStatus === "Paid") &&
                    invoices.length
                      ? "Final Settled"
                      : "Estimated"
                  }
                />
              }
            >
              <ProfitWaterfall breakdown={profit} />
            </SectionCard>
            <InfoNote>
              Customer cash received is not profit. Profit comes from delivered value minus landed
              cost, whether or not the customer has paid.
            </InfoNote>
          </TabsContent>
        )}
        <TabsContent value="activity" className="mt-4">
          <SectionCard title="Activity">
            <AuditList events={data.activity} />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
