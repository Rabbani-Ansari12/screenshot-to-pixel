import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileQuestion,
  GitCompareArrows,
  ScanSearch,
  Scale,
} from "lucide-react";
import type { ReviewItemView, ReviewReason } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentThumbnail } from "@/components/document-viewer";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useReviewItems } from "@/hooks/queries";
import { formatRelative } from "@/lib/format";

export const REASONS: { reason: ReviewReason; icon: typeof Scale; help: string }[] = [
  {
    reason: "Low confidence",
    icon: ScanSearch,
    help: "AI could read the document but is not sure of some values.",
  },
  {
    reason: "Missing essential info",
    icon: FileQuestion,
    help: "Slip number, vehicle or quantity is not visible.",
  },
  {
    reason: "Multiple possible matches",
    icon: GitCompareArrows,
    help: "More than one open trip fits this document.",
  },
  {
    reason: "Conflicting weight values",
    icon: Scale,
    help: "Printed net weight does not equal gross − tare.",
  },
  {
    reason: "Financial discrepancy",
    icon: CircleDollarSign,
    help: "A bill differs from recorded trips and needs approval.",
  },
];

function ReviewCard({ item }: { item: ReviewItemView }) {
  const top = item.candidateTrips[0];
  return (
    <li className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {item.document ? (
          <DocumentThumbnail type={item.document.type} />
        ) : (
          <span className="grid size-10 place-items-center rounded-lg bg-muted">
            <CircleDollarSign className="size-5 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.id} ·{" "}
            {item.document
              ? `${item.document.type} from ${item.document.senderName}`
              : "Bill reconciliation"}{" "}
            · {formatRelative(item.createdAt)}
          </p>
        </div>
        <StatusBadge status={item.priority} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
      {top && (
        <p className="mt-2 text-xs">
          <span className="text-muted-foreground">Best match:</span>{" "}
          <span className="font-medium">{top.trip.id}</span> · {top.trip.vehiclePlate} ·{" "}
          <span className="font-semibold">{top.score}%</span>
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
        <StatusBadge status={item.status === "Open" ? "Needs Review" : item.status} />
        {item.status === "Open" ? (
          <Button asChild size="sm">
            <Link to="/review/$itemId" params={{ itemId: item.id }}>
              Resolve <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link to="/review/$itemId" params={{ itemId: item.id }}>
              View
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

export function ReviewPage() {
  const { data, isLoading, error } = useReviewItems();
  const [tab, setTab] = useState("open");
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <PageSkeleton rows={4} />;
  const open = data.filter((r) => r.status === "Open");
  const closed = data.filter((r) => r.status !== "Open");

  const grouped = (items: ReviewItemView[]) =>
    REASONS.map((r) => ({ ...r, items: items.filter((i) => i.reason === r.reason) })).filter(
      (g) => g.items.length,
    );

  return (
    <>
      <PageHeader
        title="Review Queue"
        description="Only the documents and bills the system could not settle on its own. Everything else was recorded automatically."
        badge={
          <StatusBadge status={`${open.length} open`} tone={open.length ? "warning" : "success"} />
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {REASONS.map((r) => {
          const n = open.filter((i) => i.reason === r.reason).length;
          return (
            <a
              key={r.reason}
              href={`#${r.reason.replaceAll(" ", "-")}`}
              className="rounded-xl border bg-card p-3 shadow-sm hover:bg-muted/40"
            >
              <r.icon className="size-4 text-primary" aria-hidden />
              <p className="mt-2 text-xs text-muted-foreground">{r.reason}</p>
              <p className="font-display text-xl font-bold">{n}</p>
            </a>
          );
        })}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="closed">Resolved ({closed.length})</TabsTrigger>
        </TabsList>
        {(["open", "closed"] as const).map((key) => {
          const groups = grouped(key === "open" ? open : closed);
          return (
            <TabsContent key={key} value={key} className="mt-4 space-y-8">
              {groups.length === 0 && (
                <div className="rounded-xl border bg-card">
                  <EmptyState
                    icon={CheckCircle2}
                    title={key === "open" ? "All clear" : "Nothing resolved yet"}
                    description={
                      key === "open"
                        ? "No document or bill needs a decision right now."
                        : "Items you resolve will appear here."
                    }
                  />
                </div>
              )}
              {groups.map((g) => (
                <section
                  key={g.reason}
                  id={g.reason.replaceAll(" ", "-")}
                  aria-labelledby={`h-${g.reason}`}
                  className="scroll-mt-20"
                >
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2
                      id={`h-${g.reason}`}
                      className="flex items-center gap-2 font-display text-base font-bold"
                    >
                      <g.icon className="size-4 text-primary" />
                      {g.reason} <span className="text-muted-foreground">({g.items.length})</span>
                    </h2>
                    <p className="hidden text-sm text-muted-foreground sm:block">{g.help}</p>
                  </div>
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((i) => (
                      <ReviewCard key={i.id} item={i} />
                    ))}
                  </ul>
                </section>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>
    </>
  );
}
