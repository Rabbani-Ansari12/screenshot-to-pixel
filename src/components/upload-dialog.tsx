import { useMemo, useRef, useState } from "react";
import { Camera, FileUp, Loader2, Trash2, UploadCloud } from "lucide-react";
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
import { api, useAction, useOpenTrips } from "@/hooks/queries";
import { ACCEPTED, MAX_BYTES } from "@/lib/upload-prep";
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

interface Pending {
  file: File;
  type: DocumentType | typeof AUTO;
}

const accepted = (f: File) =>
  ACCEPTED.includes(f.type) || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name);

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
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const [trip, setTrip] = useState(tripHint ?? "");
  const [by, setBy] = useState("");
  const [drag, setDrag] = useState(false);
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
  const upload = useAction(
    api.documents.uploadDocuments,
    (r) => {
      const dup = r.filter((x) => x.duplicate).length;
      return `${r.length} document${r.length > 1 ? "s" : ""} uploaded · reading started${dup ? ` · ${dup} already uploaded before (kept as duplicate)` : ""}`;
    },
    { invalidate: [["documents"], ["review"], ["notifications"]] },
  );

  const add = (list: FileList | null) => {
    if (!list) return;
    setProblem(null);
    const incoming = Array.from(list);
    const bad = incoming.filter((f) => !accepted(f) || f.size > MAX_BYTES);
    if (bad.length)
      setProblem(
        `${bad.map((f) => f.name).join(", ")}: use JPG, PNG, WebP, HEIC or PDF under 20 MB.`,
      );
    setFiles((current) =>
      [
        ...current,
        ...incoming
          .filter((f) => !bad.includes(f))
          .map((file) => ({ file, type: AUTO as typeof AUTO })),
      ].slice(0, MAX_FILES),
    );
  };
  const reset = () => {
    setFiles([]);
    setProblem(null);
    setBy("");
    setTrip(tripHint ?? "");
  };
  const submit = async () => {
    await upload.mutateAsync(
      files.map((f) => ({
        file: f.file,
        typeHint: f.type === AUTO ? null : f.type,
        tripHint: trip || null,
        uploadedByLabel: by,
      })),
    );
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
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
            add(e.dataTransfer.files);
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
            >
              <FileUp className="size-4" /> Choose files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => camera.current?.click()}
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
              add(e.target.files);
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
              add(e.target.files);
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
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {files.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className="flex items-center gap-3 rounded-lg border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(f.file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <Select
                  value={f.type}
                  onValueChange={(v) =>
                    setFiles((all) =>
                      all.map((x, j) => (j === i ? { ...x, type: v as Pending["type"] } : x)),
                    )
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[170px]"
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
                  onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.file.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Trip (optional)</Label>
            <EntityPicker
              value={trip}
              onChange={setTrip}
              options={tripOptions}
              placeholder="Let AI match the trip"
              aria-label="Trip this belongs to"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!files.length || upload.isPending}>
            {upload.isPending && <Loader2 className="size-4 animate-spin" />}Upload{" "}
            {files.length || ""} file{files.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
