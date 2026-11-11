import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { TripStatus, TripView } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ErrorState } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { tripColumns } from "@/components/record-columns";
import { api, useAction, useMasterOptions, useTripsPage } from "@/hooks/queries";
import { TripSheetsDialog, type SheetItem } from "@/components/trip-sheets";
import type { TableQuery } from "@/services/supabase/table-query";
import { useAuth } from "@/lib/auth";

export const TRIP_STATUSES: TripStatus[] = [
  "Loaded",
  "In Transit",
  "Delivered",
  "Needs Verification",
  "Confirmed Shortage",
  "Cancelled",
];

export function TripsPage() {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useTripsPage(query);
  const { data: options } = useMasterOptions();
  const { can } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  // Trips seen on any page, so a selection across pages still has vehicle / route for the sheets.
  const seen = useRef(new Map<string, TripView>());
  useEffect(() => data?.rows.forEach((t) => seen.current.set(t.id, t)), [data]);
  const bulk = useAction(api.links.createLinks, undefined, { invalidate: [["links"]] });
  const generate = async () => {
    const res = await bulk.mutateAsync([...selected]);
    if (res.failed.length)
      toast.error(
        `${res.failed.length} link(s) not created: ${res.failed.map((f) => `${f.tripCode} (${f.error})`).join(", ")}`,
      );
    if (res.created.length) {
      toast.success(
        `${res.created.length} driver link${res.created.length > 1 ? "s" : ""} created`,
      );
      setSheets(res.created.map((link) => ({ link, trip: seen.current.get(link.tripCode) })));
    }
    setSelected(new Set());
  };
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="Truck Trips"
        description="Every truck from loading to delivery. Weights fill in automatically from uploaded slips."
        actions={
          can("manage_trips") && (
            <>
              {selected.size > 0 && (
                <Button onClick={() => void generate()} disabled={bulk.isPending}>
                  {bulk.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                  Generate links for {selected.size} trip{selected.size > 1 ? "s" : ""}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/trips/new">
                  <Plus className="size-4" /> Create trip (manual)
                </Link>
              </Button>
            </>
          )
        }
      />
      <DataTable
        {...(can("manage_trips")
          ? { selection: { selected, onChange: setSelected, label: (t: TripView) => t.id } }
          : {})}
        data={data?.rows}
        isLoading={isLoading || !query}
        server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
        columns={tripColumns()}
        getRowId={(t) => t.id}
        rowHref={(t) => `/trips/${t.id}`}
        searchText={(t) =>
          `${t.id} ${t.orderRef} ${t.vehiclePlate} ${t.driverName} ${t.materialName} ${t.providerName} ${t.transporterName} ${t.loading.slipNo} ${t.delivery?.slipNo ?? ""} ${t.siteName}`
        }
        searchPlaceholder="Search trip, vehicle, slip no., driver…"
        filters={[
          {
            id: "status",
            label: "Statuses",
            options: TRIP_STATUSES.map((s) => ({ value: s, label: s })),
            value: (t) => t.status,
          },
          {
            id: "material",
            label: "Materials",
            options: (options?.materials ?? []).map((m) => ({ value: m.id, label: m.name })),
            value: (t) => t.materialId,
          },
          {
            id: "transporter",
            label: "Transporters",
            options: (options?.transporters ?? []).map((t) => ({ value: t.id, label: t.name })),
            value: (t) => t.transporterId,
          },
          {
            id: "vehicle",
            label: "Vehicles",
            options: (options?.vehicles ?? []).map((v) => ({ value: v.id, label: v.plate })),
            value: (t) => t.vehicleId,
          },
        ]}
        dateValue={(t) => t.loading.at}
        defaultSort={{ id: "date", desc: true }}
        exportName="truck-trips"
      />
      <TripSheetsDialog
        open={sheets.length > 0}
        onOpenChange={(o) => !o && setSheets([])}
        items={sheets}
      />
    </>
  );
}
