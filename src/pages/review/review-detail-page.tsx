import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, FilePlus2, History, Link2, ShieldCheck, X } from "lucide-react";
import type { CandidateView, MatchCriteria } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  DetailList,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  InfoNote,
  SectionCard,
} from "@/components/common";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentViewer } from "@/components/document-viewer";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useOpenTrips, useReviewItem, useSettings } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FieldsEditor } from "../documents/document-detail-page";

const CRITERIA: { key: keyof MatchCriteria; label: string }[] = [
  { key: "vehicle", label: "Vehicle" },
  { key: "date", label: "Date" },
  { key: "material", label: "Material" },
  { key: "provider", label: "Provider" },
  { key: "destination", label: "Destination" },
];

function CandidateCard({
  c,
  rank,
  onAttach,
  disabled,
}: {
  c: CandidateView;
  rank: number;
  onAttach: () => void;
  disabled: boolean;
}) {
  return (
    <li
      className={cn("rounded-xl border p-4", rank === 0 && "border-primary/40 bg-primary/[0.03]")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">#{rank + 1} match</p>
          <Link
            to="/trips/$tripId"
            params={{ tripId: c.trip.id }}
            className="font-semibold text-primary hover:underline"
          >
            {c.trip.id}
          </Link>
          <p className="text-sm text-muted-foreground">
            {c.trip.vehiclePlate} · {c.trip.materialName} · {c.trip.siteName}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-display text-2xl font-extrabold",
              c.score >= 80
                ? "text-emerald-700 dark:text-emerald-300"
                : c.score >= 60
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground",
            )}
          >
            {c.score}%
          </p>
          <p className="text-xs text-muted-foreground">match score</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Matching criteria">
        {CRITERIA.map((k) => (
          <li
            key={k.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              c.criteria[k.key]
                ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border text-muted-foreground",
            )}
          >
            {c.criteria[k.key] ? <Check className="size-3" /> : <X className="size-3" />}
            {k.label}
            <span className="sr-only">{c.criteria[k.key] ? " matches" : " does not match"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Loaded {formatQty(c.trip.loadedQty, c.trip.unit)} on {formatDate(c.trip.loading.at)} ·{" "}
          {c.trip.yardName ?? c.trip.providerName}
        </span>
        <Button size="sm" onClick={onAttach} disabled={disabled}>
          <Link2 className="size-4" /> Attach to this trip
        </Button>
      </div>
    </li>
  );
}

export function ReviewDetailPage({ itemId }: { itemId: string }) {
  const { data: item, isLoading, error } = useReviewItem(itemId);
  const { data: settings } = useSettings();
  const { data: openTrips } = useOpenTrips();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [weightChoice, setWeightChoice] = useState<"printed" | "calculated">("calculated");
  const [otherTrip, setOtherTrip] = useState("");
  const [confirm, setConfirm] = useState<null | "reject" | "create" | "approve">(null);
  const resolve = useAction(
    (r: Parameters<typeof api.review.resolveReviewItem>[1]) =>
      api.review.resolveReviewItem(itemId, r),
    (res) =>
      `${res.id} ${res.status === "Rejected" ? "rejected" : "resolved"} · saved to audit history`,
  );
  useEffect(() => {
    setValues({});
    setReason("");
  }, [itemId]);

  const conflict = item?.weightConflict;
  useEffect(() => {
    if (!conflict) return;
    const calc = (conflict.gross - conflict.tare).toFixed(2);
    setValues((v) => ({
      ...v,
      net: weightChoice === "calculated" ? calc : conflict.printedNet.toFixed(2),
    }));
  }, [weightChoice, conflict]);

  const tripOptions = useMemo(
    () =>
      (openTrips ?? []).map((t) => ({
        value: t.id,
        label: `${t.id} · ${t.vehiclePlate}`,
        hint: `${t.materialName} · ${t.siteName}`,
      })),
    [openTrips],
  );

  if (error) return <ErrorState error={error} />;
  if (isLoading || !item) return <DetailSkeleton />;
  const doc = item.document;
  const threshold = settings?.autoProcessThreshold ?? 85;
  const corrections = Object.entries(values)
    .filter(([k, v]) => doc?.fields.find((f) => f.key === k)?.value !== v)
    .map(([key, value]) => ({ key, value }));
  const reasonOk = reason.trim().length >= 5;
  const closed = item.status !== "Open";
  const canAct = can("review_documents") && !closed;
  const canCorrect = can("correct_extracted") && !closed;
  const done = () => void navigate({ to: "/review" });
  const attach = async (tripId: string) => {
    await resolve.mutateAsync({ action: "attach", tripId, corrections, reason });
    done();
  };

  return (
    <>
      <PageHeader
        title={item.title}
        crumbs={[{ label: item.id }]}
        badge={
          <>
            <StatusBadge status={item.reason} tone="warning" />
            <StatusBadge
              status={item.status === "Open" ? `${item.priority} priority` : item.status}
            />
          </>
        }
        description={item.summary}
      />
      {closed && (
        <InfoNote className="mb-4">
          This item is {item.status.toLowerCase()}. See Audit History for who decided and why.
        </InfoNote>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {doc ? (
            <SectionCard title="Document">
              <DocumentViewer doc={doc} />
            </SectionCard>
          ) : null}
          {item.financial && (
            <SectionCard title="Bill vs system records">
              <DetailList
                columns={3}
                items={[
                  { label: "Billed (before GST)", value: formatINR(item.financial.billed) },
                  { label: "Recorded trips", value: formatINR(item.financial.recorded) },
                  {
                    label: "Difference",
                    value: (
                      <span
                        className={
                          item.financial.billed > item.financial.recorded
                            ? "text-rose-600"
                            : "text-amber-600"
                        }
                      >
                        {formatINR(item.financial.billed - item.financial.recorded)}
                      </span>
                    ),
                  },
                ]}
              />
              <Button asChild variant="outline" className="mt-4">
                <Link to="/reconciliation/$recordId" params={{ recordId: item.financial.billId }}>
                  Open line-by-line reconciliation
                </Link>
              </Button>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          {conflict && (
            <SectionCard
              title="Conflicting weights"
              description="Choose which net weight to record. The other value stays on file."
            >
              <RadioGroup
                value={weightChoice}
                onValueChange={(v) => setWeightChoice(v as "printed" | "calculated")}
                className="grid gap-3 sm:grid-cols-2"
                disabled={!canCorrect}
              >
                {(
                  [
                    [
                      "printed",
                      "Printed net on slip",
                      conflict.printedNet,
                      "As printed by the weighbridge",
                    ],
                    [
                      "calculated",
                      "Calculated net (gross − tare)",
                      conflict.gross - conflict.tare,
                      `${formatNumber(conflict.gross, 2)} − ${formatNumber(conflict.tare, 2)}`,
                    ],
                  ] as const
                ).map(([key, label, value, hint]) => (
                  <Label
                    key={key}
                    htmlFor={`w-${key}`}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 font-normal",
                      weightChoice === key && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RadioGroupItem id={`w-${key}`} value={key} />
                      {label}
                    </span>
                    <span className="font-display text-2xl font-extrabold">
                      {formatNumber(value, 2)} MT
                    </span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </Label>
                ))}
              </RadioGroup>
              <p className="mt-3 text-sm">
                Difference:{" "}
                <span className="font-semibold text-rose-600">
                  {formatNumber(Math.abs(conflict.gross - conflict.tare - conflict.printedNet), 2)}{" "}
                  MT
                </span>
              </p>
            </SectionCard>
          )}

          {doc && (
            <SectionCard
              title="Extracted values"
              description={
                canCorrect
                  ? "Edit any value that was read wrongly. Corrections need a reason."
                  : undefined
              }
            >
              <FieldsEditor
                fields={doc.fields}
                editing={canCorrect}
                values={values}
                onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                threshold={threshold}
              />
            </SectionCard>
          )}

          {!item.financial && (
            <SectionCard
              title="Candidate trips"
              description="Ranked by how many details match. Attaching records the document on that trip."
            >
              {item.candidateTrips.length ? (
                <ol className="space-y-3">
                  {item.candidateTrips.map((c, i) => (
                    <CandidateCard
                      key={c.tripId}
                      c={c}
                      rank={i}
                      disabled={!canAct || !reasonOk || resolve.isPending}
                      onAttach={() => void attach(c.tripId)}
                    />
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No likely trip"
                  description="Search for a trip below, or create a new one."
                  className="py-4"
                />
              )}
              {canAct && (
                <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="other-trip">Attach to a different trip</Label>
                    <EntityPicker
                      id="other-trip"
                      value={otherTrip}
                      onChange={setOtherTrip}
                      options={tripOptions}
                      placeholder="Search open trips…"
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={!otherTrip || !reasonOk || resolve.isPending}
                    onClick={() => void attach(otherTrip)}
                  >
                    <Link2 className="size-4" /> Attach
                  </Button>
                </div>
              )}
            </SectionCard>
          )}

          {canAct && (
            <SectionCard title="Decision">
              <div className="space-y-1.5">
                <Label htmlFor="review-reason">Reason / note (required)</Label>
                <Textarea
                  id="review-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Confirmed with driver Ramesh on call; plate MH 12 AB 4821"
                />
              </div>
              <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <History className="mt-0.5 size-3.5 shrink-0" />
                Audit note: your name, the time, this reason and every corrected value (
                {corrections.length}) are written to Audit History. Original values are kept.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.financial ? (
                  <Button disabled={!reasonOk} onClick={() => setConfirm("approve")}>
                    <ShieldCheck className="size-4" /> Approve difference
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={!reasonOk}
                    onClick={() => setConfirm("create")}
                  >
                    <FilePlus2 className="size-4" /> Create new trip
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={!reasonOk}
                  onClick={() => setConfirm("reject")}
                >
                  <X className="size-4" /> Reject
                </Button>
              </div>
              {!reasonOk && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Write a reason (5+ characters) to enable the actions.
                </p>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "reject"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reject this document?"
        destructive
        confirmLabel="Reject"
        description="It will not be recorded anywhere. You can still find it in the Document Inbox."
        onConfirm={async () => {
          await resolve.mutateAsync({ action: "reject", reason });
          done();
        }}
      />
      <ConfirmDialog
        open={confirm === "create"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Create a new trip from this document?"
        confirmLabel="Continue to trip form"
        description="The document will be marked as matched and you'll be taken to the manual trip form."
        onConfirm={async () => {
          await resolve.mutateAsync({ action: "create_trip", reason, corrections });
          void navigate({ to: "/trips/new" });
        }}
      />
      <ConfirmDialog
        open={confirm === "approve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Approve this difference?"
        confirmLabel="Approve"
        description="The bill stays exactly as received. Your approval and note are recorded; no trip or bill values change."
        onConfirm={async () => {
          await resolve.mutateAsync({ action: "approve_difference", reason });
          done();
        }}
      />
    </>
  );
}
