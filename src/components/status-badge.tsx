import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const palette = {
  success: "border-emerald-700/15 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-700/15 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  danger: "border-rose-700/15 bg-rose-600/10 text-rose-700 dark:text-rose-400",
  info: "border-sky-700/15 bg-sky-600/10 text-sky-700 dark:text-sky-400",
  neutral: "border-border bg-muted/65 text-muted-foreground",
};
export function statusTone(status: string): keyof typeof palette {
  const value = status.toLowerCase();
  if (["normal", "matched", "auto-recorded", "reconciled", "paid", "delivered", "active", "in stock", "recorded", "final settled", "incoming", "connected"].some((s) => value.includes(s))) return "success";
  if (["needs review", "needs verification", "pending", "partial", "estimated", "review"].some((s) => value.includes(s))) return "warning";
  if (["failed", "confirmed shortage", "disputed"].some((s) => value.includes(s))) return "danger";
  if (["processing", "received", "information extracted", "in transit", "ready"].some((s) => value.includes(s))) return "info";
  return "neutral";
}
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return <Badge variant="outline" className={cn("h-[21px] whitespace-nowrap rounded-full px-2 text-[9px] font-semibold shadow-none", palette[tone], className)}><span className={cn("mr-1.5 size-[5px] rounded-full", tone === "success" && "bg-emerald-600", tone === "warning" && "bg-amber-500", tone === "danger" && "bg-rose-600", tone === "info" && "bg-sky-600", tone === "neutral" && "bg-muted-foreground/60")} />{status}</Badge>;
}
