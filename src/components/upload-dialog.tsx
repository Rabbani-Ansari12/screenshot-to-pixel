import { useRef, useState } from "react";
import { FileUp, Loader2, Trash2, UploadCloud } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, useAction } from "@/hooks/queries";
import { cn } from "@/lib/utils";

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

function guessType(name: string): DocumentType {
  const n = name.toLowerCase();
  if (n.includes("bill") || n.includes("invoice")) return "Provider Bill";
  if (n.includes("receipt") || n.includes("utr")) return "Payment Receipt";
  if (n.includes("unload")) return "Unloading Slip";
  if (n.includes("wb") || n.includes("weigh") || n.includes("kata")) return "Weighbridge Slip";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png")) return "Weighbridge Slip";
  return "Other";
}

/** Manual upload — the fallback when the WhatsApp line is down. */
export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; size: number; type: DocumentType }[]>([]);
  const [drag, setDrag] = useState(false);
  const upload = useAction(
    api.documents.uploadDocuments,
    (r) => `${r.length} document${r.length > 1 ? "s" : ""} uploaded · processing started`,
  );

  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [
      ...f,
      ...Array.from(list).map((file) => ({
        name: file.name,
        size: file.size,
        type: guessType(file.name),
      })),
    ]);
  };
  const submit = async () => {
    await upload.mutateAsync(files.map((f) => ({ name: f.name, type: f.type })));
    setFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFiles([]);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>
            Use this when a slip or bill did not arrive on WhatsApp. Files go through the same AI
            reading and matching.
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
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Drag & drop files here</p>
          <p className="text-sm text-muted-foreground">JPG, PNG or PDF · up to 10 files</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => input.current?.click()}
          >
            <FileUp className="size-4" /> Choose files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            aria-label="Choose files to upload"
          />
        </div>
        {files.length > 0 && (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 rounded-lg border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</p>
                </div>
                <Select
                  value={f.type}
                  onValueChange={(v) =>
                    setFiles((all) =>
                      all.map((x, j) => (j === i ? { ...x, type: v as DocumentType } : x)),
                    )
                  }
                >
                  <SelectTrigger
                    className="h-8 w-[170px]"
                    aria-label={`Document type for ${f.name}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                  aria-label={`Remove ${f.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
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
