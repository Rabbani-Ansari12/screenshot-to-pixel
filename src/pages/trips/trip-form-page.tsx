import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InfoNote, SectionCard } from "@/components/common";
import { EntityPicker } from "@/components/entity-picker";
import { PageHeader } from "@/components/page-header";
import { api, useAction, useMasterOptions } from "@/hooks/queries";
import { DEMO_TODAY, formatNumber } from "@/lib/format";

const n = (msg: string) => z.number({ invalid_type_error: msg }).nonnegative();
const schema = z
  .object({
    orderId: z.string().min(1, "Choose an order"),
    materialId: z.string().min(1, "Choose a material"),
    source: z.enum(["provider", "yard"]),
    providerId: z.string(),
    yardId: z.string(),
    transporterId: z.string().min(1, "Choose a transporter"),
    vehicleId: z.string().min(1, "Choose a vehicle"),
    driverId: z.string().min(1, "Choose a driver"),
    loadingGross: n("Enter gross weight"),
    loadingTare: n("Enter tare weight"),
    loadingSlip: z.string().min(1, "Enter slip number"),
    loadingAt: z.string().min(1, "Required"),
    delivered: z.boolean(),
    deliveryGross: z.number(),
    deliveryTare: z.number(),
    deliverySlip: z.string(),
    deliveryAt: z.string(),
    freight: n("Enter freight"),
  })
  .superRefine((v, ctx) => {
    if (v.loadingGross <= v.loadingTare)
      ctx.addIssue({
        code: "custom",
        path: ["loadingGross"],
        message: "Gross must be more than tare",
      });
    if (v.source === "provider" && !v.providerId)
      ctx.addIssue({ code: "custom", path: ["providerId"], message: "Choose a provider" });
    if (v.source === "yard" && !v.yardId)
      ctx.addIssue({ code: "custom", path: ["yardId"], message: "Choose a yard" });
    if (v.delivered) {
      if (
        !Number.isFinite(v.deliveryGross) ||
        !Number.isFinite(v.deliveryTare) ||
        v.deliveryGross <= v.deliveryTare
      )
        ctx.addIssue({
          code: "custom",
          path: ["deliveryGross"],
          message: "Gross must be more than tare",
        });
      if (!v.deliverySlip)
        ctx.addIssue({ code: "custom", path: ["deliverySlip"], message: "Enter slip number" });
      if (!v.deliveryAt)
        ctx.addIssue({ code: "custom", path: ["deliveryAt"], message: "Required" });
    }
  });
type Values = z.infer<typeof schema>;

export function TripFormPage({ orderId }: { orderId?: string }) {
  const { data: options } = useMasterOptions();
  const navigate = useNavigate();
  const create = useAction(api.trips.createTrip, (t) => `Trip ${t.id} created`);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      orderId: orderId ?? "",
      materialId: "",
      source: "provider",
      providerId: "",
      yardId: "",
      transporterId: "",
      vehicleId: "",
      driverId: "",
      loadingGross: Number.NaN,
      loadingTare: Number.NaN,
      loadingSlip: "",
      loadingAt: `${DEMO_TODAY}T09:00`,
      delivered: false,
      deliveryGross: Number.NaN,
      deliveryTare: Number.NaN,
      deliverySlip: "",
      deliveryAt: `${DEMO_TODAY}T13:00`,
      freight: Number.NaN,
    },
  });
  const [oid, materialId, source, transporterId, vehicleId, lg, lt, delivered, dg, dt] = form.watch(
    [
      "orderId",
      "materialId",
      "source",
      "transporterId",
      "vehicleId",
      "loadingGross",
      "loadingTare",
      "delivered",
      "deliveryGross",
      "deliveryTare",
    ],
  );
  const order = options?.orders.find((o) => o.id === oid);
  const orderOptions = useMemo(
    () =>
      (options?.orders ?? [])
        .filter((o) => !["Draft", "Cancelled", "Completed"].includes(o.status))
        .map((o) => ({
          value: o.id,
          label: o.ref,
          hint: options?.customers.find((c) => c.id === o.customerId)?.name ?? "",
        })),
    [options],
  );
  const materialChoices = (options?.materials ?? []).filter((m) =>
    order?.materialIds.includes(m.id),
  );
  const providerChoices = (options?.providers ?? []).filter((p) =>
    p.materialIds.includes(materialId),
  );
  const vehicles = (options?.vehicles ?? []).filter((v) => v.transporterId === transporterId);
  const drivers = (options?.drivers ?? []).filter((d) => d.transporterId === transporterId);

  useEffect(() => {
    if (materialChoices.length === 1 && !materialId)
      form.setValue("materialId", materialChoices[0]?.id ?? "");
  }, [materialChoices, materialId, form]);
  useEffect(() => {
    const v = options?.vehicles.find((x) => x.id === vehicleId);
    if (v) form.setValue("driverId", v.driverId);
  }, [vehicleId, options, form]);
  useEffect(() => {
    const t = options?.transporters.find((x) => x.id === transporterId);
    if (t) form.setValue("freight", t.ratePerTrip);
  }, [transporterId, options, form]);

  const netL = Number.isFinite(lg) && Number.isFinite(lt) ? lg - lt : null;
  const netD = Number.isFinite(dg) && Number.isFinite(dt) ? dg - dt : null;
  const numField = (f: { value: number; onChange: (v: number) => void }) => ({
    value: Number.isFinite(f.value) ? f.value : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => f.onChange(e.target.valueAsNumber),
  });
  const select = (
    name: "providerId" | "yardId" | "transporterId" | "vehicleId" | "driverId" | "materialId",
    label: string,
    items: { id: string; name: string }[],
    disabled = false,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const submit = async (v: Values) => {
    const trip = await create.mutateAsync({
      ...v,
      yardId: v.source === "yard" ? v.yardId : null,
      providerId:
        v.source === "provider"
          ? v.providerId
          : (options?.providers.find((p) => p.materialIds.includes(v.materialId))?.id ?? ""),
    });
    void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });
  };

  return (
    <>
      <PageHeader
        title="Create trip"
        crumbs={[{ label: "New (manual)" }]}
        description="Manual fallback. Normally trips are created when the loading slip arrives on WhatsApp."
      />
      <InfoNote tone="warning" className="mb-4">
        Only use this when WhatsApp is down or a slip was never sent. Manually entered values are
        marked “Manual entry” on the trip.
      </InfoNote>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <SectionCard title="Order & material">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl>
                      <EntityPicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("materialId", "");
                        }}
                        options={orderOptions}
                        placeholder="Choose order"
                        aria-label="Order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {select(
                "materialId",
                "Material",
                materialChoices.map((m) => ({ id: m.id, name: m.name })),
                !oid,
              )}
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loaded from</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="provider">Provider (direct to site)</SelectItem>
                        <SelectItem value="yard">Own stock yard</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {source === "provider"
                ? select("providerId", "Provider", providerChoices)
                : select("yardId", "Yard", options?.yards ?? [])}
            </div>
          </SectionCard>
          <SectionCard title="Truck">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {select("transporterId", "Transporter", options?.transporters ?? [])}
              {select(
                "vehicleId",
                "Vehicle",
                vehicles.map((v) => ({ id: v.id, name: v.plate })),
                !transporterId,
              )}
              {select("driverId", "Driver", drivers, !transporterId)}
              <FormField
                control={form.control}
                name="freight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Freight (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" {...numField(field)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>
          <SectionCard
            title="Loading weighbridge slip"
            description={netL !== null ? `Net ${formatNumber(netL, 2)} MT` : "Net = gross − tare"}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField
                control={form.control}
                name="loadingGross"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross (MT)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...numField(field)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loadingTare"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tare (MT)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...numField(field)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loadingSlip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slip number</FormLabel>
                    <FormControl>
                      <Input placeholder="WB-12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loadingAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SectionCard>
          <SectionCard
            title="Delivery slip"
            actions={
              <FormField
                control={form.control}
                name="delivered"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Already delivered"
                    />
                    Already delivered
                  </label>
                )}
              />
            }
            description={
              delivered
                ? netD !== null
                  ? `Net ${formatNumber(netD, 2)} MT${netL !== null ? ` · difference ${formatNumber(netL - netD, 2)} MT` : ""}`
                  : "Net = gross − tare"
                : "Leave off if the truck is still on the road."
            }
          >
            {delivered && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FormField
                  control={form.control}
                  name="deliveryGross"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross (MT)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...numField(field)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryTare"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tare (MT)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...numField(field)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliverySlip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slip number</FormLabel>
                      <FormControl>
                        <Input placeholder="SW-12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deliveryAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date & time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </SectionCard>
          <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
            <Button type="button" variant="outline" asChild>
              <Link to="/trips">Cancel</Link>
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}Create trip
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
