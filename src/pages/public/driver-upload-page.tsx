/**
 * Public driver upload page (/u/:token). No login, no app navigation, no business data beyond
 * trip code, vehicle and material. Built for cheap Android phones: big buttons, few requests,
 * photos shrunk on the phone before upload, automatic retry on bad networks.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareUpload } from "@/lib/upload-prep";
import { cn } from "@/lib/utils";

const MAX_FILES = 5;
const NAME_KEY = "driver-name";
const TYPE_LABEL: Record<string, string> = {
  loading_slip: "Loading slip",
  unloading_slip: "Unloading slip",
  delivery_photo: "Delivery photo",
  weighbridge_slip: "Weighbridge slip",
  other: "Other",
};

interface LinkInfo {
  trip_code: string;
  vehicle_number: string;
  material_name: string;
  allowed_doc_types: string[];
  remaining_uploads: number;
}

interface Picked {
  id: string;
  file: File;
  preview: string | null;
}

const functionsUrl = () =>
  `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1`;

const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveName = (v: string) => {
  try {
    if (v.trim()) localStorage.setItem(NAME_KEY, v.trim());
  } catch {
    /* private mode: not remembered */
  }
};

/** POST with upload progress, retried on network failures (not on refusals). */
function postWithProgress(
  url: string,
  body: FormData,
  onProgress: (pct: number) => void,
  attempt = 1,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    const retry = () => {
      if (attempt >= 3) return reject(new Error("network"));
      setTimeout(
        () => postWithProgress(url, body, onProgress, attempt + 1).then(resolve, reject),
        attempt * 2000,
      );
    };
    xhr.onerror = retry;
    xhr.ontimeout = retry;
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* empty */
      }
      if (xhr.status >= 500 && attempt < 3) return retry();
      resolve({ status: xhr.status, json });
    };
    xhr.send(body);
  });
}

function TurnstileBox({ onToken }: { onToken: (t: string) => void }) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    const w = window as unknown as {
      turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => void };
    };
    const render = () => w.turnstile?.render(box.current!, { sitekey: siteKey, callback: onToken });
    if (w.turnstile) return render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey, onToken]);
  return siteKey ? <div ref={box} className="flex justify-center" /> : null;
}

export function DriverUploadPage({ token }: { token: string }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [state, setState] = useState<
    "loading" | "invalid" | "ready" | "uploading" | "done" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [docType, setDocType] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ received: number; duplicates: number } | null>(null);
  const [captcha, setCaptcha] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch(
        `${functionsUrl()}/driver-upload-info?token=${encodeURIComponent(token)}`,
        {
          referrerPolicy: "no-referrer",
          cache: "no-store",
        },
      );
      const body = (await res.json().catch(() => ({}))) as LinkInfo & { error?: string };
      if (!res.ok) {
        setMessage(
          body.error ?? "This upload link is not valid any more. Ask the office for a new link.",
        );
        setState("invalid");
        return;
      }
      setInfo(body);
      setDocType(
        (t) => t || (body.allowed_doc_types.length === 1 ? (body.allowed_doc_types[0] ?? "") : ""),
      );
      setState("ready");
    } catch {
      setMessage("No internet connection. Check your signal and try again.");
      setState("error");
    }
  };

  useEffect(() => {
    setName(readName());
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  const limit = Math.min(MAX_FILES, info?.remaining_uploads ?? MAX_FILES);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview:
        file.type.startsWith("image/") && !/hei[cf]/i.test(file.type)
          ? URL.createObjectURL(file)
          : null,
    }));
    setFiles((cur) => [...cur, ...next].slice(0, limit));
  };

  const submit = async () => {
    if (!info || !docType || !files.length) return;
    setState("uploading");
    setProgress(0);
    saveName(name);
    try {
      const form = new FormData();
      form.set("token", token);
      form.set("doc_type", docType);
      if (name.trim()) form.set("driver_name", name.trim().slice(0, 60));
      if (captcha) form.set("cf-turnstile-response", captcha);
      for (const f of files) {
        const prepared = await prepareUpload(f.file).catch(() => null);
        form.append(
          "files",
          prepared
            ? new File([prepared.blob], f.file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
                type: prepared.mimeType,
              })
            : f.file,
        );
        // Preview in the same position as its file (empty when there is none).
        form.append(
          "thumbs",
          new File([prepared?.thumb ?? new Blob()], "thumb.jpg", { type: "image/jpeg" }),
        );
      }
      const { status, json } = await postWithProgress(
        `${functionsUrl()}/driver-upload`,
        form,
        setProgress,
      );
      if (status === 200) {
        setResult({
          received: Number(json["received"] ?? 0),
          duplicates: Number(json["duplicates"] ?? 0),
        });
        setInfo({
          ...info,
          remaining_uploads: Number(json["remaining_uploads"] ?? info.remaining_uploads),
        });
        setFiles([]);
        setState("done");
        return;
      }
      setMessage(String(json["error"] ?? "The upload did not go through. Please try again."));
      setState(status === 404 ? "invalid" : "error");
    } catch {
      setMessage("The upload did not go through because of a weak signal. Tap Try again.");
      setState("error");
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  );

  if (state === "loading")
    return (
      <Shell>
        <div className="grid min-h-[60vh] place-items-center" aria-busy="true">
          <Loader2 className="size-10 animate-spin text-primary" aria-label="Loading" />
        </div>
      </Shell>
    );

  if (state === "invalid")
    return (
      <Shell>
        <div role="alert" className="mt-16 rounded-2xl border bg-card p-6 text-center">
          <AlertCircle className="mx-auto size-12 text-destructive" />
          <h1 className="mt-4 text-xl font-bold">Link not working</h1>
          <p className="mt-2 text-base text-muted-foreground">{message}</p>
        </div>
      </Shell>
    );

  const trip = info && (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Truck className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold">{info.vehicle_number}</p>
          <p className="truncate text-sm text-muted-foreground">
            {info.trip_code} · {info.material_name}
          </p>
        </div>
      </div>
    </div>
  );

  if (state === "done")
    return (
      <Shell>
        {trip}
        <div
          role="status"
          className="mt-6 rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-6 text-center"
        >
          <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
          <h1 className="mt-3 text-2xl font-bold">Received.</h1>
          <p className="mt-1 text-base">You can upload more.</p>
          {result && result.duplicates > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {result.duplicates} photo{result.duplicates > 1 ? "s were" : " was"} already sent
              before.
            </p>
          )}
        </div>
        {info && info.remaining_uploads > 0 ? (
          <Button className="mt-6 h-14 w-full text-lg" onClick={() => setState("ready")}>
            Upload more
          </Button>
        ) : (
          <p className="mt-6 text-center text-base text-muted-foreground">
            This link has no uploads left.
          </p>
        )}
      </Shell>
    );

  return (
    <Shell>
      <h1 className="mb-4 text-2xl font-bold">Send documents</h1>
      {trip}

      <fieldset className="mt-6" disabled={state === "uploading"}>
        <legend className="mb-2 text-base font-semibold">What are you sending?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(info?.allowed_doc_types ?? []).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDocType(t)}
              aria-pressed={docType === t}
              className={cn(
                "min-h-14 rounded-xl border-2 px-3 text-base font-medium",
                docType === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card",
              )}
            >
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-16 text-base"
          onClick={() => camera.current?.click()}
          disabled={state === "uploading" || files.length >= limit}
        >
          <Camera className="size-6" /> Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-16 text-base"
          onClick={() => picker.current?.click()}
          disabled={state === "uploading" || files.length >= limit}
        >
          <FileUp className="size-6" /> Choose file
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take a photo"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={picker}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        aria-label="Choose files"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-2 text-sm text-muted-foreground">
        Up to {limit} at a time · {info?.remaining_uploads ?? 0} left on this link
      </p>

      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-2" aria-label="Selected files">
          {files.map((f) => (
            <li
              key={f.id}
              className="relative aspect-square overflow-hidden rounded-xl border bg-muted"
            >
              {f.preview ? (
                <img src={f.preview} alt={f.file.name} className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center p-2 text-center text-xs">
                  {f.file.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-black/60 text-white"
                aria-label={`Remove ${f.file.name}`}
                disabled={state === "uploading"}
              >
                <X className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 space-y-2">
        <Label htmlFor="driver-name" className="text-base">
          Your name (optional)
        </Label>
        <Input
          id="driver-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base"
          autoComplete="name"
        />
      </div>

      <div className="mt-4">
        <TurnstileBox onToken={setCaptcha} />
      </div>

      {state === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-base text-destructive"
        >
          {message}
        </p>
      )}

      {state === "uploading" ? (
        <div className="mt-6" role="status" aria-live="polite">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-center text-base">Sending… {progress}%</p>
        </div>
      ) : (
        <Button
          className="mt-6 h-16 w-full text-lg"
          onClick={submit}
          disabled={!docType || !files.length}
        >
          {state === "error" ? (
            <>
              <RefreshCw className="size-5" /> Try again
            </>
          ) : (
            `Send ${files.length || ""} ${files.length === 1 ? "file" : "files"}`.replace("  ", " ")
          )}
        </Button>
      )}
      {!docType && files.length > 0 && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Choose what you are sending first.
        </p>
      )}
    </Shell>
  );
}
