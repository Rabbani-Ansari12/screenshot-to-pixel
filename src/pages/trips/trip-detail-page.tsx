import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, PencilLine, Scale } from "lucide-react";
import type { DocumentType, TimelineEvent, TripView, WeighRecord } from "@/types";
import { Button } from "@/components/ui/button";
import {
  AutoFilledBadge,
  DetailList,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  InfoNote,
  SectionCard,
} from "@/components/common";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { billColumns, invoiceColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { useTrip } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { WeightDialog } from "./weight-dialog";
import { formatDateTime, formatINR, formatNumber, formatQty, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AuditList } from "../orders/order-detail-page";

function tripTimeline(t: TripView): TimelineEvent[] {
  const delivered = Boolean(t.delivery);
  const steps: TimelineEvent[] = [
    { label: "Loaded", at: t.loading.at, state: "done", note: t.loading.location },
    {
      label: "In transit",
      at: delivered || t.status === "In Transit" ? t.loading.at : null,
      state: delivered ? "done" : t.status === "In Transit" ? "current" : "pending",
      note: `${t.vehiclePlate} · ${t.driverName}`,
    },
    {
      label: "Delivered",
      at: t.delivery?.at ?? null,
      state: delivered ? "done" : "pending",
      note: t.siteName,
    },
  ];
  if (t.shortageStatus && t.shortageStatus !== "Normal") {
    steps.push({
      label: t.shortageStatus === "Confirmed Shortage" ? "Shortage confirmed" : "Verification",
      at: t.investigation?.at ?? null,
      state:
        t.investigation && t.investigation.outcome !== "Under investigation"
          ? "done"
          : t.shortageStatus === "Confirmed Shortage"
            ? "failed"
            : "current",
      note: t.investigation?.outcome ?? "Awaiting investigation",
    });
  }
  return steps;
}

function WeighCard({
  title,
  rec,
  unit,
  docs,
  onEdit,
}: {
  title: string;
  rec: WeighRecord | null;
  unit: string;
  docs: { id: string; type: DocumentType }[];
  /** Shown when the user may add / correct this weight. */
  onEdit?: (() => void) | undefined;
}) {
  return (
    <SectionCard
      title={title}
      actions={
        <div className="flex items-center gap-2">
          {rec?.autoFilled ? (
            <AutoFilledBadge />
          ) : rec ? (
            <StatusBadge status="Manual entry" tone="neutral" />
          ) : null}
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilLine className="size-4" /> {rec ? "Correct" : "Record"}
            </Button>
          )}
        </div>
      }
    >
      {rec ? (
        <>
          {unit === "MT" ? (
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Gross</p>
                <p className="font-display text-lg font-bold tabular-nums">
                  {formatNumber(rec.gross, 2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tare</p>
                <p className="font-display text-lg font-bold tabular-nums">
                  {formatNumber(rec.tare, 2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net</p>
                <p className="font-display text-lg font-extrabold tabular-nums text-primary">
                  {formatNumber(rec.net, 2)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="font-display text-lg font-extrabold">{formatQty(rec.net, unit)}</p>
            </div>
          )}
          <DetailList
            className="mt-4"
            columns={2}
            items={[
              { label: "Slip number", value: rec.slipNo },
              { label: "Date & time", value: formatDateTime(rec.at) },
              { label: "Location", value: rec.location },
              { label: "Measurement source", value: rec.source },
            ]}
          />
          {rec.documentId ? (
            <Link
              to="/documents/$documentId"
              params={{ documentId: rec.documentId }}
              className="mt-4 flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
            >
              <DocumentThumbnail
                type={docs.find((d) => d.id === rec.documentId)?.type ?? "Weighbridge Slip"}
              />
              <div>
                <p className="text-sm font-medium">Original slip · {rec.documentId}</p>
                <p className="text-xs text-muted-foreground">Open to view and zoom</p>
              </div>
            </Link>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">No original document attached.</p>
          )}
        </>
      ) : (
        <EmptyState
          title="Waiting for delivery slip"
          description="It will be filled automatically when the site sends the unloading slip on WhatsApp."
          className="py-6"
        />
      )}
    </SectionCard>
  );
}

export function TripDetailPage({ tripId }: { tripId: string }) {
  const { data, isLoading, error } = useTrip(tripId);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  return <TripDetail data={data} />;
}

function TripDetail({ data }: { data: NonNullable<ReturnType<typeof useTrip>["data"]> }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<"loading" | "delivery" | null>(null);
  const canEdit = can("manage_trips") || can("correct_extracted");
  const { trip: t, documents, bills, invoices, audit } = data;
  const docs = documents.map((d) => ({ id: d.id, type: d.type }));
  const pct =
    t.difference !== null && t.tolerance > 0
      ? Math.min(100, (Math.max(t.difference, 0) / (t.tolerance * 3)) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title={t.id}
        crumbs={[{ label: t.id }]}
        badge={<StatusBadge status={t.status} />}
        description={
          <>
            {t.materialName} · {t.vehiclePlate} ·{" "}
            <Link
              to="/orders/$orderId"
              params={{ orderId: t.orderId }}
              className="text-primary hover:underline"
            >
              {t.orderRef}
            </Link>{" "}
            · {t.customerName}
          </>
        }
        actions={
          t.shortageStatus && t.shortageStatus !== "Normal" ? (
            <Button asChild variant="outline">
              <Link to="/shortages">Open shortage investigation</Link>
            </Button>
          ) : undefined
        }
      />

      <SectionCard className="mb-4">
        <Timeline items={tripTimeline(t)} orientation="horizontal" />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeighCard
          title="Loading record"
          rec={t.loading}
          unit={t.unit}
          docs={docs}
          onEdit={canEdit && t.status !== "Cancelled" ? () => setEditing("loading") : undefined}
        />
        <WeighCard
          title="Delivery record"
          rec={t.delivery}
          unit={t.unit}
          docs={docs}
          onEdit={canEdit && t.status !== "Cancelled" ? () => setEditing("delivery") : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <SectionCard
          title="Quantity difference"
          description={`Tolerance for ${t.materialName}: ${formatQty(t.tolerance, t.unit)}`}
        >
          {t.difference === null ? (
            <p className="text-sm text-muted-foreground">
              Will be checked once the delivery weight is recorded.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-xl",
                    t.shortageStatus === "Normal"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : t.shortageStatus === "Needs Verification"
                        ? "bg-amber-400/15 text-amber-700"
                        : "bg-rose-500/10 text-rose-600",
                  )}
                >
                  {t.shortageStatus === "Normal" ? (
                    <CheckCircle2 className="size-5" />
                  ) : t.shortageStatus === "Needs Verification" ? (
                    <Scale className="size-5" />
                  ) : (
                    <AlertTriangle className="size-5" />
                  )}
                </span>
                <div>
                  <p className="font-display text-2xl font-extrabold tabular-nums">
                    {formatQty(t.difference, t.unit)}
                  </p>
                  <StatusBadge status={t.shortageStatus ?? "Normal"} />
                </div>
              </div>
              <div>
                <div
                  className="relative h-3 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`Difference is ${Math.round((Math.max(t.difference, 0) / (t.tolerance || 1)) * 100)}% of tolerance`}
                >
                  <span className="absolute inset-y-0 left-1/3 w-px bg-foreground/40" />
                  <span className="absolute inset-y-0 left-2/3 w-px bg-foreground/40" />
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      t.shortageStatus === "Normal"
                        ? "bg-emerald-500"
                        : t.shortageStatus === "Needs Verification"
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>0</span>
                  <span>1× tolerance</span>
                  <span>2×</span>
                  <span>3×</span>
                </div>
              </div>
              <DetailList
                columns={2}
                items={[
                  { label: "Loaded", value: formatQty(t.loadedQty, t.unit) },
                  { label: "Delivered", value: formatQty(t.deliveredQty ?? 0, t.unit) },
                ]}
              />
              {t.investigation && (
                <InfoNote
                  tone={t.investigation.outcome === "Under investigation" ? "warning" : "info"}
                >
                  <strong>{t.investigation.outcome}</strong> — {t.investigation.notes}{" "}
                  <span className="text-xs">
                    ({t.investigation.by}, {formatRelative(t.investigation.at)})
                  </span>
                </InfoNote>
              )}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Trip details">
          <DetailList
            columns={3}
            items={[
              {
                label: "Order",
                value: (
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: t.orderId }}
                    className="text-primary hover:underline"
                  >
                    {t.orderRef}
                  </Link>
                ),
              },
              { label: "Customer", value: t.customerName },
              { label: "Site", value: t.siteName },
              { label: "Material", value: t.materialName },
              {
                label: t.yardId ? "Issued from" : "Provider",
                value: t.yardName ?? (
                  <Link
                    to="/providers/$providerId"
                    params={{ providerId: t.providerId }}
                    className="text-primary hover:underline"
                  >
                    {t.providerName}
                  </Link>
                ),
              },
              {
                label: "Transporter",
                value: (
                  <Link
                    to="/transporters/$transporterId"
                    params={{ transporterId: t.transporterId }}
                    className="text-primary hover:underline"
                  >
                    {t.transporterName}
                  </Link>
                ),
              },
              {
                label: "Vehicle",
                value: (
                  <Link
                    to="/vehicles/$vehicleId"
                    params={{ vehicleId: t.vehicleId }}
                    className="text-primary hover:underline"
                  >
                    {t.vehiclePlate}
                  </Link>
                ),
              },
              { label: "Driver", value: t.driverName },
              { label: "Freight", value: formatINR(t.freight) },
              {
                label: "Created via",
                value: t.createdVia === "WhatsApp" ? "WhatsApp documents" : "Manual entry",
              },
              {
                label: "Purchase",
                value: t.purchaseId ? (
                  <Link
                    to="/purchases/$purchaseId"
                    params={{ purchaseId: t.purchaseId }}
                    className="text-primary hover:underline"
                  >
                    {t.purchaseId}
                  </Link>
                ) : (
                  "From yard stock"
                ),
              },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title={`Linked documents (${documents.length})`} className="mt-4">
        {documents.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {documents.map((d) => (
              <li key={d.id}>
                <Link
                  to="/documents/$documentId"
                  params={{ documentId: d.id }}
                  className="block rounded-xl border p-3 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <DocumentThumbnail type={d.type} />
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mt-2 text-sm font-medium">{d.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.id} · {d.senderName} · {formatRelative(d.receivedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No documents. This trip was entered manually.
          </p>
        )}
      </SectionCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard title="Linked bills">
          <SimpleTable
            rows={bills}
            getRowId={(b) => b.id}
            rowHref={(b) => `/bills/${b.id}`}
            columns={billColumns({ hide: ["paid", "payment", "doc"] })}
            empty="Not billed yet"
          />
        </SectionCard>
        <SectionCard title="Linked invoice">
          <SimpleTable
            rows={invoices}
            getRowId={(i) => i.id}
            rowHref={(i) => `/invoices/${i.id}`}
            columns={invoiceColumns({ hide: ["customer", "paid", "due", "flags"] })}
            empty="Not invoiced yet"
          />
        </SectionCard>
      </div>
      <SectionCard title="Audit trail" className="mt-4">
        <AuditList events={audit} />
      </SectionCard>
      {editing && (
        <WeightDialog
          trip={t}
          kind={editing}
          current={editing === "loading" ? t.loading : t.delivery}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}
