import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";
import type { TableQuery } from "@/services/supabase/table-query";
import { EmptyState, ExportButtons, TableSkeleton, saveBlob } from "./common";
import { FilterBar, type DateRangeValue } from "./filter-bar";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right";
  className?: string;
  /** Hide on medium screens to keep the table readable. */
  hideBelow?: "lg" | "xl";
  /** Role in the mobile card layout. Default "meta". */
  mobile?: "title" | "subtitle" | "badge" | "meta" | "hidden";
  /** Text written to CSV exports (defaults to the sort value, then plain cell text). */
  exportValue?: (row: T) => string | number | null;
}

export interface ColumnFilter<T> {
  id: string;
  label: string;
  options: Option[];
  /** Value(s) of the row for this filter. */
  value: (row: T) => string | string[];
}

export interface DataTableProps<T> {
  data: T[] | undefined;
  isLoading?: boolean;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: ColumnFilter<T>[];
  dateValue?: (row: T) => string | null;
  defaultSort?: { id: string; desc: boolean };
  pageSize?: number;
  exportName?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Initial value for a filter, e.g. { status: "Needs Review" }. */
  initialFilters?: Record<string, string>;
  caption?: string;
  /** When set, a Table / Grid toggle appears and grid mode renders this card per row. */
  gridItem?: (row: T) => ReactNode;
  /**
   * Server mode: `data` is already the current page. Search, filters, date range, sort and
   * paging are sent to `onQueryChange` (search debounced) and `total` drives the pager.
   */
  server?: { total: number; onQueryChange: (query: TableQuery) => void };
  /** Row selection (checkbox column) for bulk actions. */
  selection?: {
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    label?: (row: T) => string;
  };
}

const alignCls = (a?: "left" | "right") => (a === "right" ? "text-right" : "text-left");
const hideCls = (h?: "lg" | "xl") =>
  h === "lg" ? "hidden lg:table-cell" : h === "xl" ? "hidden xl:table-cell" : "";

export function DataTable<T>({
  data,
  isLoading,
  columns,
  getRowId,
  rowHref,
  onRowClick,
  searchText,
  searchPlaceholder = "Search…",
  filters = [],
  dateValue,
  defaultSort,
  pageSize: initialPageSize = 10,
  exportName,
  toolbar,
  emptyTitle = "No records match",
  emptyDescription = "Try changing the search or filters.",
  rowClassName,
  initialFilters = {},
  caption,
  gridItem,
  server,
  selection,
}: DataTableProps<T>) {
  const [view, setView] = useState<"table" | "grid">("table");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((f) => [f.id, initialFilters[f.id] ?? "all"])),
  );
  const [range, setRange] = useState<DateRangeValue>({ from: "", to: "" });
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    if (server) return data ?? [];
    const q = search.trim().toLowerCase();
    let rows = (data ?? []).filter((row) => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false;
      for (const f of filters) {
        const want = filterValues[f.id] ?? "all";
        if (want === "all") continue;
        const v = f.value(row);
        if (Array.isArray(v) ? !v.includes(want) : v !== want) return false;
      }
      if (dateValue && range.from) {
        const d = dateValue(row)?.slice(0, 10);
        if (!d || d < range.from || (range.to && d > range.to)) return false;
      }
      return true;
    });
    const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
    if (sort && col?.sortValue) {
      const get = col.sortValue;
      rows = [...rows].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va === vb) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb));
        return sort.desc ? -cmp : cmp;
      });
    }
    return rows;
  }, [server, data, search, searchText, filters, filterValues, dateValue, range, sort, columns]);

  useEffect(() => setPage(0), [search, filterValues, range, pageSize]);
  const totalCount = server ? server.total : filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = server
    ? filtered
    : filtered.slice(current * pageSize, current * pageSize + pageSize);
  const hasFilters =
    Boolean(search.trim()) ||
    Boolean(range.from) ||
    Object.values(filterValues).some((v) => v !== "all");

  // Server mode: report the query (search debounced so typing doesn't fire a request per key).
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const onQueryChange = server?.onQueryChange;
  useEffect(() => {
    onQueryChange?.({
      search: debounced,
      filters: filterValues,
      from: range.from,
      to: range.to,
      sort,
      page,
      pageSize,
    });
  }, [onQueryChange, debounced, filterValues, range, sort, page, pageSize]);

  const open = (row: T) => {
    if (onRowClick) onRowClick(row);
    else if (rowHref) void navigate({ to: rowHref(row) });
  };
  const clickable = Boolean(onRowClick || rowHref);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? (s.desc ? null : { id, desc: true }) : { id, desc: false }));
  const reset = () => {
    setSearch("");
    setFilterValues(Object.fromEntries(filters.map((f) => [f.id, "all"])));
    setRange({ from: "", to: "" });
  };

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subtitleCol = columns.find((c) => c.mobile === "subtitle");
  const badgeCol = columns.find((c) => c.mobile === "badge");
  const metaCols = columns
    .filter((c) => (c.mobile ?? "meta") === "meta" && c !== titleCol)
    .slice(0, 4);

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4 xl:flex-row xl:items-center xl:justify-between">
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder={searchPlaceholder}
          onReset={reset}
          selects={filters.map((f) => ({
            id: f.id,
            label: f.label,
            options: f.options,
            value: filterValues[f.id] ?? "all",
            onChange: (v) => setFilterValues((s) => ({ ...s, [f.id]: v })),
          }))}
          {...(dateValue ? { dateRange: range, onDateRange: setRange } : {})}
        />
        <div className="flex flex-wrap items-center gap-2">
          {gridItem && (
            <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                onClick={() => setView("table")}
                aria-label="Table view"
                aria-pressed={view === "table"}
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
          )}
          {toolbar}
          {exportName && (
            <ExportButtons
              name={exportName}
              onCsv={() => exportCsv(exportName, columns, server ? rows : filtered)}
            />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-2">
          <TableSkeleton rows={6} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={(server ? hasFilters : (data ?? []).length) ? emptyTitle : "No records yet"}
          description={(server ? hasFilters : (data ?? []).length) ? emptyDescription : undefined}
        />
      ) : (
        <>
          {gridItem && view === "grid" && (
            <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((row) => (
                <li key={getRowId(row)}>{gridItem(row)}</li>
              ))}
            </ul>
          )}
          {/* Desktop table */}
          <div
            className={cn(
              "hidden overflow-x-auto md:block",
              gridItem && view === "grid" && "md:hidden",
            )}
          >
            <table className="w-full text-sm">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {selection && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <Checkbox
                        aria-label="Select all rows on this page"
                        checked={
                          rows.length > 0 && rows.every((r) => selection.selected.has(getRowId(r)))
                        }
                        onCheckedChange={(on) => {
                          const next = new Set(selection.selected);
                          rows.forEach((r) =>
                            on ? next.add(getRowId(r)) : next.delete(getRowId(r)),
                          );
                          selection.onChange(next);
                        }}
                      />
                    </th>
                  )}
                  {columns.map((c) => {
                    const sorted = sort?.id === c.id;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        aria-sort={sorted ? (sort?.desc ? "descending" : "ascending") : undefined}
                        className={cn(
                          "whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-muted-foreground",
                          alignCls(c.align),
                          hideCls(c.hideBelow),
                        )}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.id)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded hover:text-foreground",
                              c.align === "right" && "flex-row-reverse",
                            )}
                          >
                            {c.header}
                            {sorted ? (
                              sort?.desc ? (
                                <ArrowDown className="size-3.5" />
                              ) : (
                                <ArrowUp className="size-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={clickable ? () => open(row) : undefined}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      clickable && "cursor-pointer hover:bg-muted/40",
                      rowClassName?.(row),
                    )}
                  >
                    {selection && (
                      <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${selection.label?.(row) ?? getRowId(row)}`}
                          checked={selection.selected.has(getRowId(row))}
                          onCheckedChange={(on) => {
                            const next = new Set(selection.selected);
                            if (on) next.add(getRowId(row));
                            else next.delete(getRowId(row));
                            selection.onChange(next);
                          }}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          "px-4 py-3 align-middle",
                          alignCls(c.align),
                          hideCls(c.hideBelow),
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul
            className={cn(
              "divide-y divide-border/70 md:hidden",
              gridItem && view === "grid" && "hidden",
            )}
          >
            {rows.map((row) => (
              <li key={getRowId(row)}>
                <div
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => open(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "block space-y-2 p-4",
                    clickable && "cursor-pointer active:bg-muted/50",
                    rowClassName?.(row),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    {selection && (
                      <span
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          className="mt-0.5"
                          aria-label={`Select ${selection.label?.(row) ?? getRowId(row)}`}
                          checked={selection.selected.has(getRowId(row))}
                          onCheckedChange={(on) => {
                            const next = new Set(selection.selected);
                            if (on) next.add(getRowId(row));
                            else next.delete(getRowId(row));
                            selection.onChange(next);
                          }}
                        />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{titleCol?.cell(row)}</div>
                      {subtitleCol && (
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {subtitleCol.cell(row)}
                        </div>
                      )}
                    </div>
                    {badgeCol && <div className="shrink-0">{badgeCol.cell(row)}</div>}
                  </div>
                  {metaCols.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {metaCols.map((c) => (
                        <div key={c.id} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{c.header}</dt>
                          <dd className="truncate">{c.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite">
              Showing{" "}
              <span className="font-medium text-foreground">
                {current * pageSize + 1}–{Math.min(totalCount, (current + 1) * pageSize)}
              </span>{" "}
              of <span className="font-medium text-foreground">{totalCount}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Rows</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[64px] text-center tabular-nums">
                {current + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Build filter options from distinct values. */
export function optionsFrom(values: (string | null | undefined)[]): Option[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
    .sort()
    .map((v) => ({ value: v, label: v }));
}

/** Plain-text value of a cell for CSV: the sort value, else the rendered text. */
function cellText<T>(col: Column<T>, row: T): string {
  if (col.exportValue) return String(col.exportValue(row) ?? "");
  const v = col.sortValue?.(row);
  if (v !== undefined && v !== null) return String(v);
  const node = col.cell(row);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the rows shown (all filtered rows; the current page in server mode). */
export function exportCsv<T>(name: string, columns: Column<T>[], rows: T[]) {
  const cols = columns.filter((c) => c.header);
  const lines = [
    cols.map((c) => csvEscape(c.header)).join(","),
    ...rows.map((r) => cols.map((c) => csvEscape(cellText(c, r))).join(",")),
  ];
  // BOM so Excel opens UTF-8 (₹, names) correctly.
  saveBlob(
    new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    `${name}.csv`,
  );
}
