import { Check, Circle, Loader2, X } from "lucide-react";
import type { TimelineEvent } from "@/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const icon = (state: TimelineEvent["state"]) =>
  state === "done" ? (
    <Check className="size-3.5" />
  ) : state === "current" ? (
    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
  ) : state === "failed" ? (
    <X className="size-3.5" />
  ) : (
    <Circle className="size-2.5" />
  );

const dotCls = (state: TimelineEvent["state"]) =>
  cn(
    "grid size-7 shrink-0 place-items-center rounded-full border-2",
    state === "done" && "border-emerald-500 bg-emerald-500 text-white",
    state === "current" && "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    state === "failed" && "border-rose-500 bg-rose-500 text-white",
    state === "pending" && "border-border bg-background text-muted-foreground",
  );

/** Vertical (default) or horizontal step timeline. */
export function Timeline({
  items,
  orientation = "vertical",
  className,
}: {
  items: TimelineEvent[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  if (orientation === "horizontal") {
    return (
      <ol className={cn("grid gap-4 sm:flex sm:items-start", className)}>
        {items.map((item, i) => (
          <li
            key={item.label}
            className="relative flex gap-3 sm:flex-1 sm:flex-col sm:items-center sm:text-center"
          >
            {i < items.length - 1 && (
              <span
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-4px)] w-0.5 sm:left-[calc(50%+18px)] sm:top-[13px] sm:h-0.5 sm:w-[calc(100%-36px)]",
                  item.state === "done" ? "bg-emerald-500" : "bg-border",
                )}
                aria-hidden
              />
            )}
            <span className={dotCls(item.state)} aria-hidden>
              {icon(item.state)}
            </span>
            <div className="min-w-0 pb-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.state === "pending" && "text-muted-foreground",
                )}
              >
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.at
                  ? formatDateTime(item.at)
                  : item.state === "pending"
                    ? "Pending"
                    : item.state === "failed"
                      ? "Stopped"
                      : "In progress"}
              </p>
              {item.note && <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn("space-y-0", className)}>
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && (
            <span
              className={cn(
                "absolute left-[13px] top-8 h-[calc(100%-32px)] w-0.5",
                item.state === "done" ? "bg-emerald-500/60" : "bg-border",
              )}
              aria-hidden
            />
          )}
          <span className={dotCls(item.state)} aria-hidden>
            {icon(item.state)}
          </span>
          <div className="min-w-0 pt-0.5">
            <p
              className={cn(
                "text-sm font-medium",
                item.state === "pending" && "text-muted-foreground",
              )}
            >
              {item.label}
              <span className="sr-only"> — {item.state}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {item.at ? formatDateTime(item.at) : item.state === "pending" ? "Pending" : "—"}
            </p>
            {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
