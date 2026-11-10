/**
 * In-memory stand-in for the Supabase client, for tests. Supports the PostgREST subset the
 * services use (select / filters / order / range / single, insert / update, rpc, functions,
 * auth). Not a database: views are plain fixture rows.
 */
import type { TypedSupabaseClient } from "@/lib/supabase";

type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Handler = (args: Record<string, unknown>) => unknown;

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

const cmp = (a: unknown, b: unknown) =>
  a === b
    ? 0
    : a === null || a === undefined
      ? 1
      : b === null || b === undefined
        ? -1
        : String(a) < String(b)
          ? -1
          : 1;
const likeToRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*")}$`, "i");

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private sorts: { col: string; asc: boolean }[] = [];
  private from = 0;
  private to: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;

  constructor(
    private readonly db: Tables,
    private readonly table: string,
    private readonly log: { table: string; op: string; payload: unknown }[],
  ) {}

  select(_cols?: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  gt(col: string, v: number | string) {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && (r[col] as string | number) > v,
    );
    return this;
  }
  gte(col: string, v: number | string) {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && (r[col] as string | number) >= v,
    );
    return this;
  }
  lt(col: string, v: number | string) {
    this.filters.push((r) => (r[col] as string | number) < v);
    return this;
  }
  lte(col: string, v: number | string) {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && (r[col] as string | number) <= v,
    );
    return this;
  }
  ilike(col: string, pattern: string) {
    const re = likeToRegex(pattern);
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  /** not(col, "is", null) and not(col, "in", "(a,b)") */
  not(col: string, op: string, value: unknown) {
    if (op === "is") this.filters.push((r) => (r[col] ?? null) !== value);
    else if (op === "in") {
      const list = String(value)
        .replace(/^\(|\)$/g, "")
        .split(",");
      this.filters.push((r) => !list.includes(String(r[col])));
    } else this.filters.push((r) => r[col] !== value);
    return this;
  }
  contains(col: string, vs: unknown[]) {
    this.filters.push(
      (r) => Array.isArray(r[col]) && vs.every((v) => (r[col] as unknown[]).includes(v)),
    );
    return this;
  }
  /** or=(a.ilike.*x*,b.ilike.*x*) */
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [col = "", op, ...rest] = p.split(".");
      const value = rest.join(".");
      return { col, op, value };
    });
    this.filters.push((r) =>
      parts.some(({ col, op, value }) =>
        op === "ilike" ? likeToRegex(value).test(String(r[col] ?? "")) : String(r[col]) === value,
      ),
    );
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sorts.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.to = this.from + n - 1;
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private run(): Result {
    const rows = (this.db[this.table] ??= []);
    this.log.push({ table: this.table, op: this.op, payload: this.payload });
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        is_active: true,
        ...r,
      }));
      rows.push(...list);
      return this.shape(list);
    }
    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      matched.forEach((r) => Object.assign(r, this.payload));
      return this.shape(matched);
    }
    if (this.op === "delete") {
      this.db[this.table] = rows.filter((r) => !matched.includes(r));
      return this.shape(matched);
    }
    for (const s of [...this.sorts].reverse())
      matched = [...matched].sort((a, b) => (s.asc ? 1 : -1) * cmp(a[s.col], b[s.col]));
    const total = matched.length;
    const page = matched.slice(this.from, this.to === null ? undefined : this.to + 1);
    return { ...this.shape(page), count: this.wantCount ? total : null };
  }

  private shape(list: Row[]): Result {
    if (this.mode === "many") return { data: structuredClone(list), error: null };
    const first = list[0] ?? null;
    if (this.mode === "single" && !first)
      return {
        data: null,
        error: {
          message: "JSON object requested, multiple (or no) rows returned",
          code: "PGRST116",
        },
      };
    return { data: first ? structuredClone(first) : null, error: null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }
}

export interface FakeOptions {
  tables?: Tables;
  rpc?: Record<string, Handler>;
  functions?: Record<string, Handler>;
  /** Signed-in user id, or null for no session. */
  userId?: string | null;
  email?: string;
}

export function createFakeSupabase(options: FakeOptions = {}) {
  const db: Tables = structuredClone(options.tables ?? {});
  const log: { table: string; op: string; payload: unknown }[] = [];
  const calls: { kind: "rpc" | "function"; name: string; args: Record<string, unknown> }[] = [];
  let userId = options.userId ?? null;
  const listeners = new Set<(event: string, session: unknown) => void>();
  const session = () =>
    userId
      ? { access_token: "test", user: { id: userId, email: options.email ?? "user@test.in" } }
      : null;

  const client = {
    from: (table: string) => new Query(db, table, log),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ kind: "rpc", name, args });
      const h = options.rpc?.[name];
      if (!h) return { data: null, error: { message: `rpc ${name} not mocked` } };
      try {
        return { data: (await h(args)) ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: "22023" } };
      }
    },
    functions: {
      invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
        calls.push({ kind: "function", name, args: body });
        const h = options.functions?.[name];
        if (!h) return { data: null, error: { message: `function ${name} not mocked` } };
        return { data: await h(body), error: null };
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          (db["storage.objects"] ??= []).push({ bucket_id: bucket, name: path });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` },
          error: null,
        }),
      }),
    },
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: async () => "ok",
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        const profile = (db["profiles"] ?? []).find((p) => p["email"] === email);
        if (!profile)
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        userId = profile["id"] as string;
        listeners.forEach((l) => l("SIGNED_IN", session()));
        return { data: { user: session()?.user, session: session() }, error: null };
      },
      signOut: async () => {
        userId = null;
        listeners.forEach((l) => l("SIGNED_OUT", null));
        return { error: null };
      },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
    },
  };
  return { client: client as unknown as TypedSupabaseClient, db, log, calls };
}
