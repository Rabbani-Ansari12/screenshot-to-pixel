/** Live result of freshly uploaded documents: what the AI read and where it was recorded. */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import type { DocumentRecord } from "@/types";
import { useUploadedDocuments } from "@/hooks/queries";
import { FINAL_STATUSES } from "@/services/documents.service";
import { cn } from "@/lib/utils";

const SUMMARY_FIELDS = ["vehicle_number", "net_weight", "slip_number", "material_name"];

function readSummary(d: DocumentRecord): string {
  const parts = SUMMARY_FIELDS.map((k) => d.fields.find((f) => f.key === k))
    .filter((f) => f && f.value)
    .map((f) => (f!.key === "net_weight" ? `Net ${f!.value} MT` : f!.value));
  return [d.type !== "Other" ? d.type : null, ...parts].filter(Boolean).join(" · ");
}

function ResultRow({ fileName, doc }: { fileName: string; doc: DocumentRecord | undefined }) {
  const reading = !doc || !FINAL_STATUSES.includes(doc.status);
  const recorded = doc && (doc.status === "Automatically Recorded" || doc.status === "Matched");
  const review = doc?.status === "Needs Review";
  const failed = doc && (doc.status === "Failed" || doc.status === "Rejected");
  const duplicate = doc?.status === "Duplicate";
  const summary = doc && !reading ? readSummary(doc) : "";

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        recorded && "border-emerald-600/25 bg-emerald-500/5",
        review && "border-amber-600/30 bg-amber-400/10",
        failed && "border-rose-600/25 bg-rose-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
          {reading ? (
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          ) : recorded ? (
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          ) : review ? (
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
          ) : duplicate ? (
            <Copy className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <XCircle className="size-4 text-rose-600" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fileName}</p>
          {reading && (
            <p className="text-xs text-muted-foreground">
              {doc?.processingNote ?? "AI is reading it… this usually takes under a minute."}
            </p>
          )}
          {recorded && (
            <p className="text-sm">
              {doc.link?.type === "Trip" ? (
                <>
                  Recorded on{" "}
                  <Link
                    to="/trips/$tripId"
                    params={{ tripId: doc.link.id }}
                    className="font-semibold text-primary hover:underline"
                  >
                    {doc.link.label}
                  </Link>
                </>
              ) : (
                "Recorded"
              )}
            </p>
          )}
          {review && (
            <p className="text-sm">
              Needs a quick check{doc.reviewReason ? ` — ${doc.reviewReason.toLowerCase()}` : ""}.{" "}
              <Link
                to="/review/$itemId"
                params={{ itemId: doc.id }}
                className="font-semibold text-primary hover:underline"
              >
                Check now
              </Link>
            </p>
          )}
          {duplicate && (
            <p className="text-sm text-muted-foreground">
              Already uploaded earlier — kept as a duplicate, not read again.
            </p>
          )}
          {failed && (
            <p className="text-sm">
              {doc.status === "Rejected" ? "Rejected" : "Could not be read"}
              {doc.processingNote ? ` — ${doc.processingNote}` : ""}.{" "}
              <Link
                to="/documents/$documentId"
                params={{ documentId: doc.id }}
                className="font-semibold text-primary hover:underline"
              >
                Open
              </Link>
            </p>
          )}
          {summary && <p className="mt-0.5 text-xs text-muted-foreground">Read: {summary}</p>}
        </div>
      </div>
    </li>
  );
}

export function UploadResults({ items }: { items: { docId: string; fileName: string }[] }) {
  const { data } = useUploadedDocuments(items.map((i) => i.docId));
  const byId = new Map((data ?? []).map((d) => [d.id, d]));
  const docs = items.map((i) => byId.get(i.docId));
  const finished = docs.filter((d) => d && FINAL_STATUSES.includes(d.status)).length;
  return (
    <section aria-label="Upload results" aria-live="polite" className="space-y-2">
      <p className="text-sm font-medium">
        {finished < items.length
          ? `Reading ${items.length - finished} of ${items.length}… you can close this, it keeps going.`
          : "All read."}
      </p>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {items.map((i) => (
          <ResultRow key={i.docId} fileName={i.fileName} doc={byId.get(i.docId)} />
        ))}
      </ul>
    </section>
  );
}
