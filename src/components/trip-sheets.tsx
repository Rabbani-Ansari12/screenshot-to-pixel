import { Printer } from "lucide-react";
import type { TripView } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QrCode } from "@/components/qr-code";
import { formatDateTime, formatQty } from "@/lib/format";
import type { CreatedLink } from "@/services/links.service";

export interface SheetItem {
  link: CreatedLink;
  trip: TripView | undefined;
}

/** One half-A4 sheet per trip: code, vehicle, material, route and the upload QR code. */
function Sheet({ link, trip }: SheetItem) {
  return (
    <article className="trip-sheet flex gap-6 rounded-xl border bg-white p-6 text-stone-900">
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-stone-500">Trip</p>
          <p className="font-display text-3xl font-extrabold">{link.tripCode}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-stone-500">Vehicle</dt>
            <dd className="text-lg font-semibold">{trip?.vehiclePlate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Driver</dt>
            <dd className="font-medium">{trip?.driverName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Material</dt>
            <dd className="font-medium">
              {trip ? `${trip.materialName} · ${formatQty(trip.loadedQty, trip.unit)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Order</dt>
            <dd className="font-medium">{trip?.orderRef ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-stone-500">Route</dt>
            <dd className="font-medium">
              {trip ? `${trip.yardName ?? trip.providerName} → ${trip.siteName}` : "—"}
            </dd>
          </div>
        </dl>
        <p className="border-t pt-2 text-sm">
          Scan the code with the phone camera and send the loading / unloading slip and photos.
        </p>
        <p className="text-xs text-stone-500">Link valid until {formatDateTime(link.expiresAt)}.</p>
      </div>
      <QrCode text={link.url} label={`Upload QR code for ${link.tripCode}`} size={190} />
    </article>
  );
}

export function TripSheetsDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SheetItem[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trip sheets</DialogTitle>
          <DialogDescription>
            New driver links for {items.length} trip{items.length === 1 ? "" : "s"}. Print them now
            — the links are not shown again (previous links for these trips stop working).
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
        <div className="print-area space-y-4">
          {items.map((i) => (
            <Sheet key={i.link.id} {...i} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
