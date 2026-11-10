import { rows } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { ilikeTerm } from "./supabase/table-query";

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

const PER_GROUP = 5;

/** Searches the live records (RLS limits results to what the user may see). */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const t = ilikeTerm(q);
  const [orders, trips, customers, providers, transporters, vehicles, materials] =
    await Promise.all([
      sb()
        .from("v_order_list")
        .select("id, order_code, customer_name, site_name")
        .or(
          `order_code.ilike.${t},customer_name.ilike.${t},site_name.ilike.${t},customer_reference.ilike.${t}`,
        )
        .limit(PER_GROUP),
      sb()
        .from("v_trip_list")
        .select("trip_code, vehicle_number, material_name, site_name")
        .or(
          `trip_code.ilike.${t},vehicle_number.ilike.${t},driver_name.ilike.${t},loading_slip_number.ilike.${t},delivery_slip_number.ilike.${t}`,
        )
        .order("sort_at", { ascending: false })
        .limit(PER_GROUP),
      sb()
        .from("customers")
        .select("id, name, city")
        .is("deleted_at", null)
        .ilike("name", t.replace(/\*/g, "%"))
        .limit(PER_GROUP),
      sb()
        .from("material_providers")
        .select("id, name, city")
        .is("deleted_at", null)
        .ilike("name", t.replace(/\*/g, "%"))
        .limit(PER_GROUP),
      sb()
        .from("transporters")
        .select("id, name, city")
        .is("deleted_at", null)
        .ilike("name", t.replace(/\*/g, "%"))
        .limit(PER_GROUP),
      sb()
        .from("vehicles")
        .select("id, vehicle_number, vehicle_type")
        .is("deleted_at", null)
        .ilike("vehicle_number_normalized", `%${q.toUpperCase().replace(/[^A-Z0-9]/g, "")}%`)
        .limit(PER_GROUP),
      sb()
        .from("materials")
        .select("id, name, category")
        .is("deleted_at", null)
        .ilike("name", t.replace(/\*/g, "%"))
        .limit(PER_GROUP),
    ]);
  return [
    ...rows(orders).map((o) => ({
      id: o.id ?? "",
      group: "Orders" as const,
      title: o.order_code ?? "",
      subtitle: `${o.customer_name ?? ""} · ${o.site_name ?? ""}`,
      href: `/orders/${o.id ?? ""}`,
    })),
    ...rows(trips).map((x) => ({
      id: x.trip_code ?? "",
      group: "Trips" as const,
      title: x.trip_code ?? "",
      subtitle: `${x.vehicle_number ?? ""} · ${x.material_name ?? ""} · ${x.site_name ?? ""}`,
      href: `/trips/${x.trip_code ?? ""}`,
    })),
    ...rows(customers).map((c) => ({
      id: c.id,
      group: "Customers" as const,
      title: c.name,
      subtitle: c.city ?? "",
      href: `/customers/${c.id}`,
    })),
    ...rows(providers).map((p) => ({
      id: p.id,
      group: "Providers" as const,
      title: p.name,
      subtitle: p.city ?? "",
      href: `/providers/${p.id}`,
    })),
    ...rows(transporters).map((p) => ({
      id: p.id,
      group: "Transporters" as const,
      title: p.name,
      subtitle: p.city ?? "",
      href: `/transporters/${p.id}`,
    })),
    ...rows(vehicles).map((v) => ({
      id: v.id,
      group: "Vehicles" as const,
      title: v.vehicle_number,
      subtitle: v.vehicle_type ?? "",
      href: `/vehicles/${v.id}`,
    })),
    ...rows(materials).map((m) => ({
      id: m.id,
      group: "Materials" as const,
      title: m.name,
      subtitle: m.category,
      href: `/materials/${m.id}`,
    })),
  ];
}
