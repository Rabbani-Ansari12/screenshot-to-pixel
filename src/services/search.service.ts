import { db, delay } from "./core";
import { lookup } from "./views";

export interface SearchResult {
  id: string;
  group:
    | "Orders"
    | "Trips"
    | "Documents"
    | "Customers"
    | "Providers"
    | "Transporters"
    | "Vehicles"
    | "Invoices"
    | "Bills"
    | "Materials";
  title: string;
  subtitle: string;
  href: string;
}

// TODO(backend): supabase.rpc("global_search", { q }) using Postgres full-text search.
export async function globalSearch(query: string): Promise<SearchResult[]> {
  await delay(120);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const has = (...values: (string | undefined)[]) =>
    values.some((v) => v?.toLowerCase().includes(q));
  const results: SearchResult[] = [
    ...db.orders
      .filter((o) =>
        has(o.ref, o.customerRef, lookup.customer(o.customerId)?.name, lookup.site(o.siteId)?.name),
      )
      .map((o) => ({
        id: o.id,
        group: "Orders" as const,
        title: o.ref,
        subtitle: `${lookup.customer(o.customerId)?.name ?? ""} · ${lookup.site(o.siteId)?.name ?? ""}`,
        href: `/orders/${o.id}`,
      })),
    ...db.trips
      .filter((t) =>
        has(t.id, t.loading.slipNo, t.delivery?.slipNo, lookup.vehicle(t.vehicleId)?.plate),
      )
      .map((t) => ({
        id: t.id,
        group: "Trips" as const,
        title: t.id,
        subtitle: `${lookup.vehicle(t.vehicleId)?.plate ?? ""} · ${lookup.material(t.materialId)?.name ?? ""}`,
        href: `/trips/${t.id}`,
      })),
    ...db.documents
      .filter((d) => has(d.id, d.senderName, d.fileName, d.type))
      .map((d) => ({
        id: d.id,
        group: "Documents" as const,
        title: `${d.id} · ${d.type}`,
        subtitle: `${d.senderName} · ${d.status}`,
        href: `/documents/${d.id}`,
      })),
    ...db.customers
      .filter((c) => has(c.name, c.gstin, c.contactName))
      .map((c) => ({
        id: c.id,
        group: "Customers" as const,
        title: c.name,
        subtitle: c.city,
        href: `/customers/${c.id}`,
      })),
    ...db.providers
      .filter((p) => has(p.name, p.city))
      .map((p) => ({
        id: p.id,
        group: "Providers" as const,
        title: p.name,
        subtitle: p.city,
        href: `/providers/${p.id}`,
      })),
    ...db.transporters
      .filter((t) => has(t.name, t.city))
      .map((t) => ({
        id: t.id,
        group: "Transporters" as const,
        title: t.name,
        subtitle: t.city,
        href: `/transporters/${t.id}`,
      })),
    ...db.vehicles
      .filter((v) => has(v.plate, v.plate.replaceAll(" ", ""), lookup.driver(v.driverId)?.name))
      .map((v) => ({
        id: v.id,
        group: "Vehicles" as const,
        title: v.plate,
        subtitle: lookup.driver(v.driverId)?.name ?? "",
        href: `/vehicles/${v.id}`,
      })),
    ...db.invoices
      .filter((i) => has(i.number, lookup.customer(i.customerId)?.name))
      .map((i) => ({
        id: i.id,
        group: "Invoices" as const,
        title: i.number,
        subtitle: lookup.customer(i.customerId)?.name ?? "",
        href: `/invoices/${i.id}`,
      })),
    ...db.bills
      .filter((b) => has(b.billNo, b.id, lookup.partyName(b.kind, b.partyId)))
      .map((b) => ({
        id: b.id,
        group: "Bills" as const,
        title: b.billNo,
        subtitle: `${b.kind} bill · ${lookup.partyName(b.kind, b.partyId)}`,
        href: `/bills/${b.id}`,
      })),
    ...db.materials
      .filter((m) => has(m.name, m.category))
      .map((m) => ({
        id: m.id,
        group: "Materials" as const,
        title: m.name,
        subtitle: `${m.category} · ${m.unit}`,
        href: `/materials/${m.id}`,
      })),
  ];
  const perGroup = new Map<string, number>();
  return results.filter((r) => {
    const n = (perGroup.get(r.group) ?? 0) + 1;
    perGroup.set(r.group, n);
    return n <= 5;
  });
}
