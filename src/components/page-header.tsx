import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { NAV_GROUPS, navItemFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumbs derived from the navigation config, plus any extra crumbs for detail pages. */
export function Breadcrumbs({ extra = [] }: { extra?: Crumb[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = navItemFor(pathname);
  const group = NAV_GROUPS.find((g) => item && g.items.includes(item));
  const crumbs: Crumb[] = [];
  if (group && group.label !== "Overview" && group.label !== item?.label)
    crumbs.push({ label: group.label });
  if (item && item.path !== "/") crumbs.push({ label: item.label, href: item.path });
  crumbs.push(...extra);
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <li>
          <Link
            to="/"
            className="inline-flex items-center rounded hover:text-foreground"
            aria-label="Dashboard"
          >
            <Home className="size-3.5" />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="size-3 opacity-60" aria-hidden />
            {c.href && i < crumbs.length - 1 ? (
              <Link to={c.href} className="rounded hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(i === crumbs.length - 1 && "text-foreground/80")}
                aria-current={i === crumbs.length - 1 ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  badge,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <Breadcrumbs extra={crumbs ?? []} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
