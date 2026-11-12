import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BellRing,
  Building2,
  CheckCircle2,
  DatabaseBackup,
  FileDigit,
  Loader2,
  Link2,
  Sparkles,
  Receipt,
  Ruler,
  Save,
  Scale,
  SlidersHorizontal,
} from "lucide-react";
import type { AppSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { DetailList, ErrorState, InfoNote, PageSkeleton, SectionCard } from "@/components/common";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { api, useAction, useMaterials, useSettings } from "@/hooks/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const businessSchema = z.object({
  business: z.object({
    name: z.string().min(2),
    legalName: z.string().min(2),
    address: z.string().min(5),
    phone: z.string().min(8),
    email: z.string().email(),
    bankDetails: z.string(),
  }),
  payments: z.object({
    allocation: z.enum(["selected", "oldest_first"]),
    allowOverpayment: z.boolean(),
    billTolerance: z.number().min(0).max(10000),
  }),
  gst: z.object({
    gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "Enter a valid GSTIN"),
    pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN"),
    stateCode: z.string().min(2),
    defaultMode: z.enum(["CGST+SGST", "IGST"]),
    defaultRate: z.number().min(0).max(28),
  }),
  invoiceNumbering: z.object({
    prefix: z.string().regex(/^[A-Z]{2,6}$/, "2–6 capital letters"),
    format: z.string().min(3),
    nextNumber: z.number().int().positive(),
  }),
});
type BusinessValues = z.infer<typeof businessSchema>;

function SaveButton({ pending, label = "Save" }: { pending: boolean; label?: string }) {
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      {label}
    </Button>
  );
}

function BusinessForms({ settings }: { settings: AppSettings }) {
  const save = useAction(
    (patch: Partial<AppSettings>) => api.admin.updateSettings(patch),
    "Settings saved",
  );
  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      business: settings.business,
      payments: settings.payments,
      gst: settings.gst,
      invoiceNumbering: settings.invoiceNumbering,
    },
  });
  const [prefix, nextNumber] = form.watch([
    "invoiceNumbering.prefix",
    "invoiceNumbering.nextNumber",
  ]);
  const text = (
    name:
      | `business.${keyof AppSettings["business"]}`
      | "gst.gstin"
      | "gst.pan"
      | "gst.stateCode"
      | "invoiceNumbering.prefix"
      | "invoiceNumbering.format",
    label: string,
    full = false,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn(full && "sm:col-span-2")}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              Business profile
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {text("business.name", "Trading name")}
            {text("business.legalName", "Legal name")}
            {text("business.address", "Registered address", true)}
            {text("business.phone", "Phone")}
            {text("business.email", "Accounts email")}
            {text("business.bankDetails", "Bank details printed on invoices", true)}
          </div>
        </SectionCard>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              Payments & reconciliation
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="payments.allocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apply payments</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="selected">To the chosen invoice / bill</SelectItem>
                      <SelectItem value="oldest_first">Oldest open first</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payments.billTolerance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Match tolerance (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payments.allowOverpayment"
              render={({ field }) => (
                <FormItem className="flex flex-col justify-end">
                  <FormLabel>Allow advances</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Payments above the outstanding balance are refused unless advances are allowed; then the
            extra is kept on account. Bill and invoice differences within the tolerance count as
            matched.
          </p>
        </SectionCard>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              GST details
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {text("gst.gstin", "GSTIN")}
            {text("gst.pan", "PAN")}
            {text("gst.stateCode", "State")}
            <FormField
              control={form.control}
              name="gst.defaultMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default tax mode</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CGST+SGST">CGST + SGST (intra-state)</SelectItem>
                      <SelectItem value="IGST">IGST (inter-state)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gst.defaultRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default GST rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each material's own GST rate is used on invoices; the mode switches to IGST
            automatically for customers outside Maharashtra.
          </p>
        </SectionCard>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <FileDigit className="size-4 text-primary" />
              Invoice numbering
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {text("invoiceNumbering.prefix", "Prefix")}
            {text("invoiceNumbering.format", "Format")}
            <FormField
              control={form.control}
              name="invoiceNumbering.nextNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next number</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <p className="mt-3 text-sm">
            Next invoice will be{" "}
            <span className="font-mono font-semibold">
              {prefix}-2026-{String(nextNumber || 0).padStart(4, "0")}
            </span>
          </p>
        </SectionCard>
        <div className="flex justify-end">
          <SaveButton pending={save.isPending} label="Save business settings" />
        </div>
      </form>
    </Form>
  );
}

const UNITS = ["MT", "CFT", "Brass", "m³", "Trips", "Bags", "Nos"];
type NotifKey = keyof AppSettings["notifications"];
const NOTIFS: { key: NotifKey; label: string; hint: string }[] = [
  {
    key: "reviewQueue",
    label: "Documents need review",
    hint: "Low confidence, missing info, multiple matches, weight conflicts",
  },
  {
    key: "shortages",
    label: "Delivery differences above tolerance",
    hint: "Needs verification or confirmed shortage",
  },
  {
    key: "billMismatch",
    label: "Bill doesn't match records",
    hint: "Provider and transporter bill differences",
  },
  { key: "overduePayments", label: "Overdue invoices and bills", hint: "Past the due date" },
  {
    key: "failedDocuments",
    label: "Document could not be read",
    hint: "Blurred, password-protected or unsupported files",
  },
  {
    key: "dailySummary",
    label: "Daily summary",
    hint: "One message at 7 PM — off keeps it exceptions-only",
  },
];

const LINK_TYPES = [
  ["loading_slip", "Loading slip"],
  ["unloading_slip", "Unloading slip"],
  ["delivery_photo", "Delivery photo"],
  ["weighbridge_slip", "Weighbridge slip"],
  ["other", "Other"],
] as const;

/** Driver upload links: expiry, uploads per link, allowed types, per-network limit (owner only). */
function DriverLinkSettingsCard({ settings }: { settings: AppSettings }) {
  const [v, setV] = useState(settings.driverLinks);
  const [digest, setDigest] = useState(settings.emailDigest);
  useEffect(() => setV(settings.driverLinks), [settings.driverLinks]);
  useEffect(() => setDigest(settings.emailDigest), [settings.emailDigest]);
  const save = useAction(
    (patch: Partial<AppSettings>) => api.admin.updateSettings(patch),
    "Driver link settings saved",
  );
  const num = (
    key: "expiryHours" | "maxUploads" | "rateLimitPerIp",
    label: string,
    hint: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`dl-${key}`}>{label}</Label>
      <Input
        id={`dl-${key}`}
        type="number"
        min={1}
        step={1}
        value={Number.isFinite(v[key]) ? v[key] : ""}
        onChange={(e) => setV((x) => ({ ...x, [key]: e.target.valueAsNumber }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          Driver upload links
        </span>
      }
      actions={
        <Button
          size="sm"
          disabled={save.isPending || v.allowedDocTypes.length === 0}
          onClick={() => save.mutate({ driverLinks: v, emailDigest: digest })}
        >
          <Save className="size-4" />
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {num("expiryHours", "Link valid for (hours)", "Default for new links (1–720).")}
        {num("maxUploads", "Files per link", "After this the link stops (1–200).")}
        {num("rateLimitPerIp", "Uploads per hour per network", "Protects against abuse.")}
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">Drivers may send</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {LINK_TYPES.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={v.allowedDocTypes.includes(key)}
                onCheckedChange={(on) =>
                  setV((x) => ({
                    ...x,
                    allowedDocTypes: on
                      ? [...new Set([...x.allowedDocTypes, key])]
                      : x.allowedDocTypes.filter((t) => t !== key),
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex items-start justify-between gap-4 border-t pt-4">
        <div>
          <Label htmlFor="digest">Daily e-mail summary of exceptions</Label>
          <p className="text-xs text-muted-foreground">
            Sent at 6 PM to the owner through Resend. Needs RESEND_API_KEY and NOTIFY_EMAIL_FROM;
            stays silent until they are set.
          </p>
        </div>
        <Switch id="digest" checked={digest} onCheckedChange={setDigest} />
      </div>
    </SectionCard>
  );
}

/** AI document reading: daily cost cap and matching thresholds (owner only). */
function AiSettingsCard({ settings }: { settings: AppSettings }) {
  const [ai, setAi] = useState(settings.ai);
  useEffect(() => setAi(settings.ai), [settings.ai]);
  const save = useAction(
    (patch: Partial<AppSettings>) => api.admin.updateSettings(patch),
    "AI settings saved",
  );
  const num = (key: keyof AppSettings["ai"], label: string, hint: string, step = 1) => (
    <div className="space-y-1">
      <Label htmlFor={`ai-${key}`}>{label}</Label>
      <Input
        id={`ai-${key}`}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={Number.isFinite(ai[key]) ? ai[key] : ""}
        onChange={(e) => setAi((v) => ({ ...v, [key]: e.target.valueAsNumber }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          AI document reading
        </span>
      }
      actions={
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ ai })}>
          <Save className="size-4" />
          Save
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Today: <span className="font-medium text-foreground">{settings.ai.callsToday}</span> of{" "}
        {settings.ai.dailyCallCap} AI calls used (about two per document).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {num(
          "dailyCallCap",
          "Daily AI call limit",
          "New documents wait until tomorrow when reached.",
        )}
        {num(
          "netWeightTolerance",
          "Net weight tolerance (MT)",
          "Printed net vs gross − tare.",
          0.01,
        )}
        {num("matchThreshold", "Match score needed (%)", "Below this a document goes to review.")}
        {num(
          "matchMargin",
          "Lead over runner-up (%)",
          "Closer than this counts as several matches.",
        )}
        {num(
          "matchWindowHours",
          "Late documents window (hours)",
          "How long after loading a slip can still match.",
        )}
      </div>
    </SectionCard>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings();
  const { data: materials } = useMaterials();
  const save = useAction(
    (patch: Partial<AppSettings>) => api.admin.updateSettings(patch),
    "Settings saved",
  );
  const saveTol = useAction(api.masters.updateTolerances, "Tolerances saved");
  const [threshold, setThreshold] = useState(85);
  const [authoritative, setAuthoritative] = useState<"Loading" | "Delivery">("Delivery");
  const [units, setUnits] = useState<string[]>([]);
  const [notifs, setNotifs] = useState<AppSettings["notifications"] | null>(null);
  const [tol, setTol] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!settings) return;
    setThreshold(settings.autoProcessThreshold);
    setAuthoritative(settings.authoritativeWeight);
    setUnits(settings.enabledUnits);
    setNotifs(settings.notifications);
  }, [settings]);
  useEffect(() => {
    if (materials) setTol(Object.fromEntries(materials.map((m) => [m.id, m.tolerance])));
  }, [materials]);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !settings || !notifs) return <PageSkeleton rows={6} />;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details, automation thresholds and alert preferences."
      />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <BusinessForms settings={settings} />
        <div className="space-y-4">
          <AiSettingsCard settings={settings} />
          <DriverLinkSettingsCard settings={settings} />
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <DatabaseBackup className="size-4 text-primary" />
                Backup
              </span>
            }
            actions={<StatusBadge status={settings.backup.status} />}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-8 text-emerald-600" />
              <div>
                <p className="font-medium">
                  Last backup {formatRelative(settings.backup.lastBackupAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(settings.backup.lastBackupAt)} · {settings.backup.sizeMb} MB
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{settings.backup.destination}</p>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-primary" />
              Automation
            </span>
          }
          actions={
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ autoProcessThreshold: threshold, authoritativeWeight: authoritative })
              }
            >
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="threshold">Auto-processing confidence threshold</Label>
              <span className="font-display text-xl font-bold tabular-nums">{threshold}%</span>
            </div>
            <Slider
              id="threshold"
              min={50}
              max={99}
              step={1}
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0] ?? 85)}
              aria-label="Confidence threshold"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50% · more automatic</span>
              <span>99% · more reviews</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Documents with any essential field below {threshold}% go to the review queue instead
              of being recorded automatically.
            </p>
          </div>
          <div className="mt-6 space-y-2 border-t pt-5">
            <Label>Authoritative weight for invoicing and profit</Label>
            <RadioGroup
              value={authoritative}
              onValueChange={(v) => setAuthoritative(v as "Loading" | "Delivery")}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  ["Delivery", "Delivery weight", "Customer pays for what reached the site"],
                  ["Loading", "Loading weight", "Customer pays for what left the quarry"],
                ] as const
              ).map(([v, l, h]) => (
                <Label
                  key={v}
                  htmlFor={`aw-${v}`}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 font-normal has-[:checked]:border-primary"
                >
                  <RadioGroupItem id={`aw-${v}`} value={v} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{l}</span>
                    <span className="text-xs text-muted-foreground">{h}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Scale className="size-4 text-primary" />
              Shortage tolerance per material
            </span>
          }
          actions={
            <Button size="sm" disabled={saveTol.isPending} onClick={() => saveTol.mutate(tol)}>
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <ul className="divide-y">
            {(materials ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <label htmlFor={`tol-${m.id}`} className="text-sm">
                  {m.name}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`tol-${m.id}`}
                    type="number"
                    step="0.01"
                    min={0}
                    className="h-8 w-24 text-right"
                    value={tol[m.id] ?? 0}
                    onChange={(e) => setTol((t) => ({ ...t, [m.id]: e.target.valueAsNumber }))}
                  />
                  <span className="w-12 text-xs text-muted-foreground">{m.unit}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Up to 1× = Normal · up to 2× = Needs verification · above = Confirmed shortage.{" "}
            <Link to="/shortages" className="text-primary hover:underline">
              See shortages
            </Link>
          </p>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Ruler className="size-4 text-primary" />
              Units
            </span>
          }
          actions={
            <Button
              size="sm"
              disabled={save.isPending || !units.length}
              onClick={() => save.mutate({ enabledUnits: units })}
            >
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {UNITS.map((u) => (
              <label key={u} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <Checkbox
                  checked={units.includes(u)}
                  onCheckedChange={(c) =>
                    setUnits((all) => (c ? [...all, u] : all.filter((x) => x !== u)))
                  }
                />
                {u}
              </label>
            ))}
          </div>
          <InfoNote className="mt-4">
            There is no automatic MT ↔ volume conversion. Each material keeps its own unit.
          </InfoNote>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" />
              Notifications · exceptions only
            </span>
          }
          actions={
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() => save.mutate({ notifications: notifs })}
            >
              <Save className="size-4" />
              Save
            </Button>
          }
        >
          <ul className="divide-y">
            {NOTIFS.map((n) => (
              <li key={n.key} className="flex items-center justify-between gap-4 py-3">
                <label htmlFor={`n-${n.key}`}>
                  <span className="block text-sm font-medium">{n.label}</span>
                  <span className="text-xs text-muted-foreground">{n.hint}</span>
                </label>
                <Switch
                  id={`n-${n.key}`}
                  checked={notifs[n.key]}
                  onCheckedChange={(c) => setNotifs({ ...notifs, [n.key]: c })}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Routine events (a slip recorded automatically, a matched bill) never notify.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
