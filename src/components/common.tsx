/** Small shared building blocks: cards, KPI tiles, empty / error / loading states, export buttons. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  Inbox,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", title && "pt-4", contentClassName)}>{children}</div>
    </section>
  );
}

const tones = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  red: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  href,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  href?: string;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl font-extrabold tabular-nums tracking-tight",
          emphasis && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      {href && (
        <ArrowUpRight
          className="absolute bottom-3 right-3 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      )}
    </>
  );
  const cls =
    "group relative block rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all";
  return href ? (
    <Link
      to={href}
      className={cn(cls, "hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  title = "This could not be loaded",
}: {
  error: unknown;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-8">
      <EmptyState
        icon={AlertTriangle}
        title={title}
        description={error instanceof Error ? error.message : "Please try again."}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
        className="py-4"
      />
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-8">
      <EmptyState
        icon={Lock}
        title="You don't have access to this page"
        description="Ask the owner to turn on the needed permission in Employees & Permissions."
        action={
          <Button asChild size="sm">
            <Link to="/">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

export function PageSkeleton({ kpis = 0, rows = 8 }: { kpis?: number; rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {kpis > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}
      <TableSkeleton rows={rows} />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border bg-card p-4" aria-busy="true">
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="ml-auto h-9 w-40" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

/** UI-only export buttons (no file is generated in the demo). */
export function ExportButtons({ name, compact }: { name: string; compact?: boolean }) {
  // TODO(backend): call an export edge function that renders PDF / XLSX for the current filters.
  const run = (kind: "PDF" | "Excel") =>
    toast.success(`${kind} export queued`, {
      description: `${name}.${kind === "PDF" ? "pdf" : "xlsx"} will be ready shortly (demo).`,
    });
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => run("PDF")}
        aria-label={`Export ${name} as PDF`}
      >
        <FileText className="size-4" />
        {!compact && "Export PDF"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => run("Excel")}
        aria-label={`Export ${name} as Excel`}
      >
        <FileSpreadsheet className="size-4" />
        {!compact && "Export Excel"}
      </Button>
    </div>
  );
}

export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium">{item.value}</dd>
          {item.hint && <dd className="mt-0.5 text-xs text-muted-foreground">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Inline note used for business rules (e.g. "cash received is not profit"). */
export function InfoNote({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode;
  tone?: "info" | "warning";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "info"
          ? "border-sky-600/20 bg-sky-500/5 text-sky-900 dark:text-sky-200"
          : "border-amber-600/25 bg-amber-400/10 text-amber-900 dark:text-amber-200",
        className,
      )}
    >
      <AlertTriangle
        className={cn("mt-0.5 size-4 shrink-0", tone === "info" && "hidden")}
        aria-hidden
      />
      <div>{children}</div>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
  tone = "primary",
  label,
}: {
  value: number;
  max: number;
  className?: string;
  tone?: "primary" | "green" | "amber";
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "primary" && "bg-primary",
          tone === "green" && "bg-emerald-500",
          tone === "amber" && "bg-amber-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function AutoFilledBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-600/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300",
        className,
      )}
      title="Filled automatically from an uploaded document"
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Z" />
      </svg>
      Auto-filled from uploaded slip
    </span>
  );
}
