import { z } from "zod";
import type { TripView, WeighRecord } from "@/types";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import { api, useAction } from "@/hooks/queries";

/**
 * Add a missing weight, or correct a recorded one. Corrections need a reason; the database keeps
 * the old and new values, the user and the reason in the audit log, and recomputes the delivery check.
 */
export function WeightDialog({
  trip,
  kind,
  current,
  open,
  onOpenChange,
}: {
  trip: TripView;
  kind: "loading" | "delivery";
  current: WeighRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const correcting = Boolean(current);
  const schema = z
    .object({
      gross: z.number({ invalid_type_error: "Enter gross weight" }).nonnegative(),
      tare: z.number({ invalid_type_error: "Enter tare weight" }).nonnegative(),
      slipNo: z.string().min(1, "Enter the slip number"),
      reason: z.string(),
    })
    .refine((v) => v.gross > v.tare, { path: ["gross"], message: "Gross must be more than tare" })
    .refine((v) => !correcting || v.reason.trim().length >= 3, {
      path: ["reason"],
      message: "Give a reason for the correction (kept in audit history)",
    });
  const save = useAction(
    (v: z.infer<typeof schema>) =>
      api.trips.saveWeight(trip.id, {
        kind,
        gross: v.gross,
        tare: v.tare,
        slipNo: v.slipNo,
        reason: v.reason.trim(),
      }),
    correcting ? "Weight corrected · recorded in audit history" : "Weight recorded",
  );
  const label = kind === "loading" ? "loading" : "delivery";
  return (
    <QuickAddDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        correcting ? `Correct ${label} weight · ${trip.id}` : `Record ${label} weight · ${trip.id}`
      }
      description={`Weights in ${trip.unit}. The difference and tolerance status are recalculated automatically.`}
      schema={schema}
      defaults={{
        gross: current?.gross ?? Number.NaN,
        tare: current?.tare ?? Number.NaN,
        slipNo: current?.slipNo ?? "",
        reason: "",
      }}
      fields={[
        { name: "gross", label: `Gross (${trip.unit})`, type: "number" },
        { name: "tare", label: `Tare (${trip.unit})`, type: "number" },
        { name: "slipNo", label: "Slip number", full: true },
        ...(correcting
          ? [
              {
                name: "reason",
                label: "Reason for correction",
                full: true,
                placeholder: "e.g. Slip re-read: gross is 41.90, not 41.60",
              },
            ]
          : []),
      ]}
      onSubmit={(v) => save.mutateAsync(v)}
      submitLabel={correcting ? "Save correction" : "Save weight"}
    />
  );
}
