/** Server-side list state shared by DataTable (server mode) and the paginated services. */
export interface TableQuery {
  search: string;
  /** Filter id → selected value ("all" = no filter). */
  filters: Record<string, string>;
  /** yyyy-MM-dd, inclusive; "" = open. */
  from: string;
  to: string;
  sort: { id: string; desc: boolean } | null;
  /** Zero-based page. */
  page: number;
  pageSize: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export const defaultTableQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  search: "",
  filters: {},
  from: "",
  to: "",
  sort: null,
  page: 0,
  pageSize: 10,
  ...overrides,
});

/** Escapes a value for a PostgREST `or=(…ilike.*x*)` filter. */
export function ilikeTerm(search: string): string {
  return `*${search
    .trim()
    .replace(/[*,()\\]/g, " ")
    .replace(/\s+/g, " ")}*`;
}

/** Inclusive end of an IST calendar day as an ISO timestamp. */
export const endOfDayIST = (date: string) => `${date}T23:59:59.999+05:30`;
export const startOfDayIST = (date: string) => `${date}T00:00:00+05:30`;

export const activeFilter = (q: TableQuery, id: string): string | null => {
  const v = q.filters[id];
  return v && v !== "all" ? v : null;
};
