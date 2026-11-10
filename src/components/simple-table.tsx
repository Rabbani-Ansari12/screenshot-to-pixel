import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { EmptyState } from "./common";
import type { Column } from "./data-table";

/** Lightweight table for tabs and side panels (no filters / pagination). Becomes cards on mobile. */
export function SimpleTable<T>({
  rows,
  columns,
  getRowId,
  rowHref,
  empty = "Nothing to show",
  footer,
  maxRows,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: string;
  footer?: ReactNode;
  maxRows?: number;
}) {
  const navigate = useNavigate();
  const shown = maxRows ? rows.slice(0, maxRows) : rows;
  if (!rows.length) return <EmptyState title={empty} className="py-8" />;
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  const badge = columns.find((c) => c.mobile === "badge");
  const meta = columns
    .filter((c) => c !== title && c !== badge && c.mobile !== "hidden")
    .slice(0, 4);
  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-3 py-2 font-semibold first:pl-0",
                    c.align === "right" ? "text-right" : "text-left",
                    c.hideBelow === "lg" && "hidden lg:table-cell",
                    c.hideBelow === "xl" && "hidden xl:table-cell",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={getRowId(r)}
                onClick={rowHref ? () => void navigate({ to: rowHref(r) }) : undefined}
                className={cn(
                  "border-b last:border-0",
                  rowHref && "cursor-pointer hover:bg-muted/40",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "px-3 py-2.5 first:pl-0",
                      c.align === "right" ? "text-right" : "text-left",
                      c.hideBelow === "lg" && "hidden lg:table-cell",
                      c.hideBelow === "xl" && "hidden xl:table-cell",
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y md:hidden">
        {shown.map((r) => (
          <li
            key={getRowId(r)}
            className="py-3"
            onClick={rowHref ? () => void navigate({ to: rowHref(r) }) : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-medium">{title?.cell(r)}</div>
              {badge?.cell(r)}
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {meta.map((c) => (
                <div key={c.id} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{c.header}</dt>
                  <dd className="truncate">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {maxRows && rows.length > maxRows && (
        <p className="pt-3 text-xs text-muted-foreground">
          Showing {maxRows} of {rows.length}
        </p>
      )}
    </div>
  );
}
