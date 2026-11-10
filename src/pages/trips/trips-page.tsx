import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { TripStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, optionsFrom } from "@/components/data-table";
import { ErrorState } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { tripColumns } from "@/components/record-columns";
import { useTrips } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";

export const TRIP_STATUSES: TripStatus[] = [
  "Loaded",
  "In Transit",
  "Delivered",
  "Needs Verification",
  "Confirmed Shortage",
];

export function TripsPage() {
  const { data, isLoading, error } = useTrips();
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
        data={data}
        isLoading={isLoading}
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
            options: optionsFrom(data?.map((t) => t.materialName) ?? []),
            value: (t) => t.materialName,
          },
          {
            id: "transporter",
            label: "Transporters",
            options: optionsFrom(data?.map((t) => t.transporterName) ?? []),
            value: (t) => t.transporterName,
          },
          {
            id: "vehicle",
            label: "Vehicles",
            options: optionsFrom(data?.map((t) => t.vehiclePlate) ?? []),
            value: (t) => t.vehiclePlate,
          },
        ]}
        dateValue={(t) => t.loading.at}
        defaultSort={{ id: "date", desc: true }}
        exportName="truck-trips"
      />
    </>
  );
}
