import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { TripStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ErrorState } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { tripColumns } from "@/components/record-columns";
import { useMasterOptions, useTripsPage } from "@/hooks/queries";
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
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="Truck Trips"
        description="Every truck from loading to delivery. Weights fill in automatically from WhatsApp slips."
        actions={
          can("manage_trips") && (
            <Button asChild variant="outline">
              <Link to="/trips/new">
                <Plus className="size-4" /> Create trip (manual)
              </Link>
            </Button>
          )
        }
      />
      <DataTable
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
    </>
  );
}
