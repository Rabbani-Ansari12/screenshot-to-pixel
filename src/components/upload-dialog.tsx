import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentType } from "@/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityPicker } from "@/components/entity-picker";
import { api, useOpenTrips } from "@/hooks/queries";
import { ACCEPTED, MAX_BYTES, prepareUpload, type PreparedUpload } from "@/lib/upload-prep";
import { cn } from "@/lib/utils";

const AUTO = "auto";
const TYPES: DocumentType[] = [
  "Weighbridge Slip",
  "Loading Slip",
  "Unloading Slip",
  "Provider Bill",
  "Transporter Bill",
  "Delivery Photo",
  "Payment Receipt",
  "Other",
];
const MAX_FILES = 20;

type FileState = "preparing" | "ready" | "uploading" | "done" | "failed";

interface Pending {
  key: string;
  file: File;
  type: DocumentType | typeof AUTO;
  state: FileState;
  prepared?: PreparedUpload;
  /** Same file already stored (by content hash). */
  existing?: { id: string; ref: string };
  error?: string;
}

const accepted = (f: File) =>
  ACCEPTED.includes(f.type) || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name);

const STATE_ICON: Record<FileState, React.ReactNode> = {
  preparing: (
    <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Preparing" />
  ),
  ready: null,
  uploading: <Loader2 className="size-4 animate-spin text-primary" aria-label="Uploading" />,
  done: <CheckCircle2 className="size-4 text-emerald-600" aria-label="Uploaded" />,
  failed: <XCircle className="size-4 text-destructive" aria-label="Failed" />,
};

/** Upload slips, bills and photos. They go through AI reading and matching automatically. */
export function UploadDialog({
  open,
  onOpenChange,
  tripHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selects a trip (e.g. when uploading from a trip page). */
  tripHint?: string;
}) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const [trip, setTrip] = useState(tripHint ?? "");
  const [by, setBy] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { data: openTrips } = useOpenTrips(open);
  const tripOptions = useMemo(
    () =>
      (openTrips ?? []).map((t) => ({
        value: t.id,
        label: `${t.id} · ${t.vehiclePlate}`,
        hint: `${t.materialName} · ${t.siteName}`,
      })),
    [openTrips],
  );
  const patch = (key: string, p: Partial<Pending>) =>
    setFiles((all) => all.map((f) => (f.key === key ? { ...f, ...p } : f)));

  /** Prepare (resize, convert, hash) as soon as files are added, then check for duplicates. */
  const add = async (list: FileList | null) => {
    if (!list) return;
    setProblem(null);
    const incoming = Array.from(list);
    const bad = incoming.filter((f) => !accepted(f) || f.size > MAX_BYTES);
    if (bad.length)
      setProblem(
        `${bad.map((f) => f.name).join(", ")}: use JPG, PNG, WebP, HEIC or PDF under 20 MB.`,
      );
    const fresh = incoming
      .filter((f) => !bad.includes(f))
      .slice(0, Math.max(0, MAX_FILES - files.length))
      .map((file) => ({
        key: crypto.randomUUID(),
        file,
        type: AUTO as typeof AUTO,
        state: "preparing" as FileState,
      }));
    setFiles((cur) => [...cur, ...fresh]);
    const ready: { key: string; sha: string }[] = [];
    for (const f of fresh) {
      try {
        const prepared = await prepareUpload(f.file);
        patch(f.key, { prepared, state: "ready" });
        ready.push({ key: f.key, sha: prepared.sha256 });
      } catch (e) {
        patch(f.key, {
          state: "failed",
          error: e instanceof Error ? e.message : "Cannot read this file",
        });
      }
    }
    try {
      const existing = await api.documents.findByHashes(ready.map((r) => r.sha));
      for (const r of ready) {
        const hit = existing.get(r.sha);
        if (hit) patch(r.key, { existing: hit });
      }
    } catch {
      /* duplicate check is a convenience; the server still detects duplicates */
    }
  };

  const reset = () => {
    setFiles([]);
    setProblem(null);
    setBy("");
    setTrip(tripHint ?? "");
  };

  const toUpload = files.filter((f) => f.state === "ready");
  const submit = async () => {
    setBusy(true);
    let ok = 0;
    let duplicates = 0;
    for (const f of toUpload) {
      patch(f.key, { state: "uploading" });
      try {
        const r = await api.documents.uploadOne({
          file: f.file,
          ...(f.prepared ? { prepared: f.prepared } : {}),
          typeHint: f.type === AUTO ? null : f.type,
          tripHint: trip || null,
          uploadedByLabel: by,
        });
        ok++;
        if (r.duplicate) duplicates++;
        patch(f.key, { state: "done" });
      } catch (e) {
        patch(f.key, { state: "failed", error: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    setBusy(false);
    await Promise.all(
      [["documents"], ["review"], ["notifications"], ["links"]].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
    if (ok)
      toast.success(
        `${ok} document${ok > 1 ? "s" : ""} uploaded · reading started${duplicates ? ` · ${duplicates} kept as duplicate` : ""}`,
      );
    if (ok === toUpload.length) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>
            Weighbridge slips, loading / unloading slips, bills and delivery photos. AI reads each
            one and records what it can match; anything unclear goes to the review queue.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void add(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Drag & drop files here</p>
          <p className="text-sm text-muted-foreground">
            JPG, PNG, WebP, HEIC or PDF · up to {MAX_FILES} files · large photos are resized
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <FileUp className="size-4" /> Choose files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => camera.current?.click()}
              disabled={busy}
            >
              <Camera className="size-4" /> Take photo
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,application/pdf,.heic,.heif"
            className="sr-only"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
            aria-label="Choose files to upload"
          />
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
            aria-label="Take a photo with the camera"
          />
        </div>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {files.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Files to upload">
            {files.map((f) => (
              <li key={f.key} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center">{STATE_ICON[f.state]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {((f.prepared?.blob.size ?? f.file.size) / 1024).toFixed(0)} KB
                      {f.prepared?.width
                        ? ` · resized to ${f.prepared.width}×${f.prepared.height}`
                        : ""}
                    </p>
                  </div>
                  <Select
                    value={f.type}
                    disabled={busy || f.state === "done"}
                    onValueChange={(v) => patch(f.key, { type: v as Pending["type"] })}
                  >
                    <SelectTrigger
                      className="h-8 w-[160px]"
                      aria-label={`Document type for ${f.file.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>Let AI decide</SelectItem>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={busy}
                    onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}
                    aria-label={`Remove ${f.file.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {f.existing && f.state !== "done" && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" />
                    Already uploaded as {f.existing.ref}. It will be kept as a duplicate and not
                    read again — remove it if you sent it by mistake.
                  </p>
                )}
                {f.error && <p className="mt-1.5 text-xs text-destructive">{f.error}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Related trip (optional)</Label>
            <EntityPicker
              value={trip}
              onChange={setTrip}
              options={tripOptions}
              placeholder="Let AI match the trip"
              aria-label="Related trip"
            />
            <p className="text-xs text-muted-foreground">
              The vehicle on the slip is still checked.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="upload-by">Brought by (optional)</Label>
            <Input
              id="upload-by"
              value={by}
              maxLength={120}
              onChange={(e) => setBy(e.target.value)}
              placeholder="e.g. driver Ramesh"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!toUpload.length || busy || files.some((f) => f.state === "preparing")}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}Upload {toUpload.length || ""} file
            {toUpload.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
