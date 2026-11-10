import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const palette: Record<Tone, string> = {
  success: "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-600/25 bg-amber-400/15 text-amber-800 dark:text-amber-300",
  danger: "border-rose-600/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info: "border-sky-600/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "border-border bg-muted text-muted-foreground",
};
const dot: Record<Tone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/60",
};

const TONES: Record<string, Tone> = {
  // green
  normal: "success",
  matched: "success",
  "automatically recorded": "success",
  "auto-recorded": "success",
  reconciled: "success",
  paid: "success",
  delivered: "success",
  completed: "success",
  active: "success",
  "final settled": "success",
  connected: "success",
  healthy: "success",
  "difference approved": "success",
  resolved: "success",
  recorded: "success",
  billed: "success",
  incoming: "success",
  passed: "success",
  "in stock": "success",
  received_stock: "success",
  // amber
  "needs review": "warning",
  "needs verification": "warning",
  pending: "warning",
  partial: "warning",
  estimated: "warning",
  unreconciled: "warning",
  "correction requested": "warning",
  "on hold": "warning",
  unpaid: "warning",
  "under investigation": "warning",
  medium: "warning",
  delayed: "warning",
  open: "warning",
  // red
  failed: "danger",
  "confirmed shortage": "danger",
  mismatch: "danger",
  disputed: "danger",
  overdue: "danger",
  high: "danger",
  disconnected: "danger",
  flagged: "danger",
  "not in system": "danger",
  "missing on bill": "danger",
  "quantity differs": "danger",
  "rate differs": "danger",
  // blue
  processing: "info",
  received: "info",
  "information extracted": "info",
  "in transit": "info",
  loaded: "info",
  confirmed: "info",
  "in progress": "info",
  outgoing: "info",
  low: "info",
  // gray
  duplicate: "neutral",
  draft: "neutral",
  cancelled: "neutral",
  inactive: "neutral",
  rejected: "neutral",
};

export function statusTone(status: string): Tone {
  return TONES[status.trim().toLowerCase()] ?? "neutral";
}

export function StatusBadge({
  status,
  className,
  tone,
}: {
  status: string;
  className?: string | undefined;
  tone?: Tone | undefined;
}) {
  const t = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        palette[t],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot[t])} aria-hidden />
      {status}
    </span>
  );
}
