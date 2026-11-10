import { useState } from "react";
import {
  Camera,
  Download,
  FileText,
  Maximize2,
  Minus,
  Plus,
  Receipt,
  RotateCw,
  Scale,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentRecord, DocumentType } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<DocumentType, { icon: LucideIcon; tint: string }> = {
  "Weighbridge Slip": { icon: Scale, tint: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  "Loading Slip": { icon: Truck, tint: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  "Unloading Slip": { icon: Truck, tint: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  "Provider Bill": { icon: FileText, tint: "bg-amber-400/15 text-amber-800 dark:text-amber-300" },
  "Transporter Bill": {
    icon: FileText,
    tint: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  "Delivery Photo": {
    icon: Camera,
    tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  "Payment Receipt": {
    icon: Receipt,
    tint: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  Other: { icon: FileText, tint: "bg-muted text-muted-foreground" },
};

export function DocumentThumbnail({ type, className }: { type: DocumentType; className?: string }) {
  const { icon: Icon, tint } = TYPE_STYLE[type];
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border border-border/60",
        tint,
        className,
      )}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

/** A rendering of the original document built from its data (no real file is stored in the demo). */
function Paper({ doc }: { doc: DocumentRecord }) {
  const field = (key: string) => doc.fields.find((f) => f.key === key)?.value;
  if (doc.type === "Delivery Photo") {
    return (
      <div className="relative aspect-[4/3] w-[420px] overflow-hidden rounded-md bg-gradient-to-b from-sky-200 via-stone-200 to-stone-400 text-stone-800 shadow-lg dark:from-sky-900 dark:via-stone-700 dark:to-stone-800 dark:text-stone-100">
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-stone-600/50 to-transparent" />
        <Truck
          className="absolute bottom-10 left-1/2 size-40 -translate-x-1/2 text-stone-700/80 dark:text-stone-300/70"
          strokeWidth={1.2}
        />
        <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white">
          {field("vehicle") ?? "Plate not visible"}
        </div>
        <div className="absolute right-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-white">
          {field("capturedAt") ?? formatDateTime(doc.receivedAt)}
        </div>
        {doc.status === "Failed" && (
          <div className="absolute inset-0 bg-stone-900/70 backdrop-blur-[3px]" />
        )}
      </div>
    );
  }
  const isBill = doc.type === "Provider Bill" || doc.type === "Transporter Bill";
  return (
    <div
      className={cn(
        "w-[420px] rounded-sm bg-[#fdfcf7] p-6 font-mono text-[12px] leading-relaxed text-stone-800 shadow-lg",
        doc.status === "Failed" && "blur-[2px]",
      )}
    >
      <div className="border-b border-dashed border-stone-400 pb-3 text-center">
        <p className="text-sm font-bold uppercase tracking-wider">
          {isBill ? (field("party") ?? doc.senderName) : (field("location") ?? "Weighbridge")}
        </p>
        <p className="text-[11px] text-stone-500">
          {isBill ? "TAX INVOICE" : doc.type.toUpperCase()}
        </p>
      </div>
      {doc.fields.length === 0 ? (
        <div className="space-y-2 py-6">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="h-2.5 rounded bg-stone-300/70"
              style={{ width: `${60 + ((i * 37) % 40)}%` }}
            />
          ))}
        </div>
      ) : (
        <dl className="space-y-1.5 py-4">
          {doc.fields.map((f) => (
            <div key={f.key} className="flex justify-between gap-4">
              <dt className="text-stone-500">{f.label.replace(/ \(.*\)/, "")}</dt>
              <dd
                className={cn(
                  "text-right font-semibold",
                  f.confidence < 70 && "rounded bg-amber-200/70 px-1 blur-[0.6px]",
                )}
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="border-t border-dashed border-stone-400 pt-3 text-center text-[10px] text-stone-500">
        {isBill
          ? "Subject to Pune jurisdiction · E. & O.E."
          : "Computer generated slip · Operator signature"}
      </div>
    </div>
  );
}

/** The stored original (signed URL, private bucket). */
function OriginalFile({ doc }: { doc: DocumentRecord }) {
  if (doc.mimeType === "application/pdf")
    return (
      <iframe
        src={doc.fileUrl ?? undefined}
        title={`Original ${doc.fileName}`}
        className="h-[560px] w-[420px] rounded-sm bg-white shadow-lg"
      />
    );
  return (
    <img
      src={doc.fileUrl ?? undefined}
      alt={`Original ${doc.type.toLowerCase()} ${doc.fileName}`}
      className="max-h-[640px] w-[420px] rounded-sm object-contain shadow-lg"
    />
  );
}

/** Original document view with zoom and rotate. */
export function DocumentViewer({ doc, className }: { doc: DocumentRecord; className?: string }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [full, setFull] = useState(false);
  const toolbar = (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Document view controls">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        aria-label="Zoom out"
      >
        <Minus className="size-4" />
      </Button>
      <span
        className="w-12 text-center text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
        aria-label="Zoom in"
      >
        <Plus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setRotation((r) => (r + 90) % 360)}
        aria-label="Rotate 90 degrees"
      >
        <RotateCw className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => {
          setZoom(1);
          setRotation(0);
        }}
      >
        Reset
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setFull(true)}
          aria-label="Open full screen"
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() =>
            doc.fileUrl
              ? window.open(doc.fileUrl, "_blank", "noopener")
              : toast.info("The original file is not available")
          }
          aria-label="Download original"
        >
          <Download className="size-4" />
        </Button>
      </div>
    </div>
  );
  const canvas = (h: string) => (
    <div
      className={cn(
        "dashboard-grid grid place-items-center overflow-auto rounded-lg bg-muted/40 p-6",
        h,
      )}
    >
      <div
        className="transition-transform duration-200"
        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
      >
        {doc.fileUrl ? <OriginalFile doc={doc} /> : <Paper doc={doc} />}
      </div>
    </div>
  );
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <p className="truncate text-xs text-muted-foreground">
          {doc.fileName} · {doc.pages} page{doc.pages > 1 ? "s" : ""}
        </p>
      </div>
      {toolbar}
      {canvas("h-[460px]")}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {doc.ref ?? doc.id} · {doc.type}
            </DialogTitle>
          </DialogHeader>
          {toolbar}
          {canvas("h-[70vh]")}
        </DialogContent>
      </Dialog>
    </div>
  );
}
