import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Copy, Link2, Pencil, RefreshCw, Save, X } from "lucide-react";
import type { ExtractedField } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DetailList,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  SectionCard,
} from "@/components/common";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentViewer } from "@/components/document-viewer";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { api, useAction, useDocument, useOpenTrips, useSettings } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfidenceValue, linkHref } from "./documents-page";

export function FieldsEditor({
  fields,
  editing,
  values,
  onChange,
  threshold,
}: {
  fields: ExtractedField[];
  editing: boolean;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  threshold: number;
}) {
  if (!fields.length)
    return (
      <EmptyState
        title="No fields extracted yet"
        description="The document is still being read, or could not be read."
        className="py-6"
      />
    );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th scope="col" className="py-2 text-left font-semibold">
            Field
          </th>
          <th scope="col" className="py-2 text-left font-semibold">
            Value
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            Confidence
          </th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const low = f.confidence < threshold;
          return (
            <tr key={f.key} className={cn("border-b last:border-0", low && "bg-amber-400/10")}>
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {low && (
                    <AlertTriangle
                      className="size-3.5 text-amber-600"
                      aria-label="Low confidence"
                    />
                  )}
                  {f.label}
                </span>
              </th>
              <td className="py-2 pr-3">
                {editing ? (
                  <Input
                    value={values[f.key] ?? f.value}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    className={cn("h-8", low && "border-amber-500")}
                    aria-label={f.label}
                  />
                ) : (
                  <span className="font-medium">{f.value}</span>
                )}
              </td>
              <td className="py-2 text-right">
                <ConfidenceValue value={f.confidence} threshold={threshold} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DocumentDetailPage({ documentId }: { documentId: string }) {
  const { data, isLoading, error } = useDocument(documentId);
  const { data: settings } = useSettings();
  const { data: openTrips } = useOpenTrips();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTrip, setLinkTrip] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const reprocess = useAction(api.documents.reprocessDocument, "Re-processing started");
  const correct = useAction(
    (v: { values: Record<string, string>; reason: string }) =>
      api.documents.correctFields(
        documentId,
        Object.entries(v.values).map(([key, value]) => ({ key, value })),
        v.reason,
      ),
    "Corrections saved · recorded in audit history",
  );
  const link = useAction(
    (v: { tripId: string; note: string }) =>
      api.documents.linkDocument(
        documentId,
        { type: "Trip", id: v.tripId, label: v.tripId },
        v.note,
      ),
    "Document linked to trip",
  );
  const dup = useAction(
    (reason: string) => api.documents.markDuplicate(documentId, null, reason),
    "Marked as duplicate",
  );
  const tripOptions = useMemo(
    () =>
      (openTrips ?? []).map((t) => ({
        value: t.id,
        label: `${t.id} · ${t.vehiclePlate}`,
        hint: `${t.materialName} · ${t.siteName} · ${formatQty(t.loadedQty, t.unit)}`,
      })),
    [openTrips],
  );
  useEffect(() => {
    setValues({});
    setEditing(false);
    setReason("");
  }, [documentId]);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { document: doc, trip, review } = data;
  const threshold = settings?.autoProcessThreshold ?? 85;
  const changed = Object.entries(values).filter(
    ([k, v]) => doc.fields.find((f) => f.key === k)?.value !== v,
  );
  const lowCount = doc.fields.filter((f) => f.confidence < threshold).length;

  return (
    <>
      <PageHeader
        title={`${doc.type} · ${doc.id}`}
        crumbs={[{ label: doc.id }]}
        badge={<StatusBadge status={doc.status} />}
        description={
          <>
            From <span className="font-medium text-foreground">{doc.senderName}</span> (
            {doc.senderPhone}) via {doc.source} · {formatDateTime(doc.receivedAt)}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => reprocess.mutate(doc.id)}
              disabled={reprocess.isPending}
            >
              <RefreshCw className={cn("size-4", reprocess.isPending && "animate-spin")} />{" "}
              Reprocess
            </Button>
            {can("correct_extracted") && !editing && doc.fields.length > 0 && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Correct Fields
              </Button>
            )}
            {can("review_documents") && (
              <Button variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2 className="size-4" /> Link to Trip
              </Button>
            )}
            {can("review_documents") && doc.status !== "Duplicate" && (
              <Button variant="outline" onClick={() => setDupOpen(true)}>
                <Copy className="size-4" /> Mark Duplicate
              </Button>
            )}
          </>
        }
      />
      {review && review.status === "Open" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-amber-600" />
          <span>
            This document is in the review queue: <strong>{review.reason}</strong>.
          </span>
          <Button asChild size="sm" className="ml-auto">
            <Link to="/review/$itemId" params={{ itemId: review.id }}>
              Resolve in review queue
            </Link>
          </Button>
        </div>
      )}
      {doc.note && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          {doc.note}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title="Original document">
          <DocumentViewer doc={doc} />
        </SectionCard>
        <div className="space-y-4">
          <SectionCard
            title="Extracted information"
            description={
              lowCount
                ? `${lowCount} field${lowCount > 1 ? "s" : ""} below the ${threshold}% confidence threshold (highlighted)`
                : `Overall confidence ${doc.confidence || "—"}%`
            }
            actions={
              editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setValues({});
                  }}
                >
                  <X className="size-4" /> Cancel
                </Button>
              )
            }
          >
            <FieldsEditor
              fields={doc.fields}
              editing={editing}
              values={values}
              onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
              threshold={threshold}
            />
            {editing && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <Label htmlFor="correction-reason">Reason for correction (required)</Label>
                <Textarea
                  id="correction-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Net weight digit misread; checked the printed slip"
                />
                <p className="text-xs text-muted-foreground">
                  The original value is kept and the change is written to audit history.
                </p>
                <Button
                  onClick={async () => {
                    await correct.mutateAsync({ values: Object.fromEntries(changed), reason });
                    setEditing(false);
                    setValues({});
                    setReason("");
                  }}
                  disabled={!changed.length || reason.trim().length < 5 || correct.isPending}
                >
                  <Save className="size-4" /> Save {changed.length || ""} correction
                  {changed.length === 1 ? "" : "s"}
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Match result">
            {trip ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="Matched" />
                  <Link
                    to="/trips/$tripId"
                    params={{ tripId: trip.id }}
                    className="font-semibold text-primary hover:underline"
                  >
                    {trip.id}
                  </Link>
                  <span className="text-sm text-muted-foreground">· {trip.orderRef}</span>
                </div>
                <DetailList
                  columns={2}
                  items={[
                    { label: "Vehicle", value: trip.vehiclePlate },
                    { label: "Material", value: trip.materialName },
                    { label: "Provider", value: trip.yardName ?? trip.providerName },
                    { label: "Site", value: trip.siteName },
                    { label: "Loaded", value: formatQty(trip.loadedQty, trip.unit) },
                    {
                      label: "Delivered",
                      value:
                        trip.deliveredQty === null
                          ? "Awaiting slip"
                          : formatQty(trip.deliveredQty, trip.unit),
                    },
                  ]}
                />
              </div>
            ) : doc.link ? (
              <p className="text-sm">
                Linked to{" "}
                <Link
                  to={linkHref(doc.link)}
                  className="font-semibold text-primary hover:underline"
                >
                  {doc.link.type} · {doc.link.label}
                </Link>
              </p>
            ) : data.duplicateOf ? (
              <p className="text-sm">
                Duplicate of{" "}
                <Link
                  to="/documents/$documentId"
                  params={{ documentId: data.duplicateOf.id }}
                  className="font-semibold text-primary hover:underline"
                >
                  {data.duplicateOf.id}
                </Link>{" "}
                — not recorded again.
              </p>
            ) : (
              <EmptyState
                title="Not matched yet"
                description="No trip, bill or payment has been linked to this document."
                className="py-4"
              />
            )}
          </SectionCard>

          <SectionCard title="Processing timeline">
            <Timeline items={doc.timeline} />
          </SectionCard>

          <SectionCard
            title="Correction history"
            description="Corrections never overwrite silently — each one keeps the original value."
          >
            {doc.corrections.length ? (
              <ul className="space-y-3">
                {doc.corrections.map((c, i) => (
                  <li key={i} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {c.field}: <span className="text-rose-600 line-through">{c.from}</span> →{" "}
                      <span className="text-emerald-700 dark:text-emerald-300">{c.to}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">{c.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.by} · {formatDateTime(c.at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No corrections. Values are exactly as read from the document.
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to trip</DialogTitle>
            <DialogDescription>
              Attach this document to a trip by hand. The trip's own values are not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="link-trip">Trip</Label>
              <EntityPicker
                id="link-trip"
                value={linkTrip}
                onChange={setLinkTrip}
                options={tripOptions}
                placeholder="Search trip, vehicle, site…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-note">Note (required)</Label>
              <Textarea
                id="link-note"
                rows={2}
                value={linkNote}
                onChange={(e) => setLinkNote(e.target.value)}
                placeholder="Why this trip?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!linkTrip || linkNote.trim().length < 5 || link.isPending}
              onClick={async () => {
                await link.mutateAsync({ tripId: linkTrip, note: linkNote });
                setLinkOpen(false);
                setLinkTrip("");
                setLinkNote("");
              }}
            >
              Link document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        title="Mark as duplicate?"
        requireReason
        confirmLabel="Mark duplicate"
        description="The document will be kept for reference but not recorded against any trip or bill."
        onConfirm={(r) => dup.mutateAsync(r)}
      />
    </>
  );
}
