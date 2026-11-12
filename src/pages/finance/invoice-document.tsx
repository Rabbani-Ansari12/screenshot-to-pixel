import type { AdditionalCost, AppSettings, GstMode } from "@/types";
import { formatDate, formatINR, formatNumber, rupeesInWords } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface InvoiceDocLine {
  description: string;
  hsn: string;
  quantity: number;
  unit: string;
  rate: number;
  gstRate: number;
  trips: number;
}

/** Totals as stored by the database for an issued invoice (preview computes its own). */
export interface InvoiceDocTotals {
  subtotal: number;
  extras: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/** Printable tax invoice. Used for the live preview while creating, and on the invoice page. */
export function InvoiceDocument({
  settings,
  number,
  date,
  dueDate,
  customer,
  siteName,
  orderRef,
  lines,
  gstMode,
  additionalCharges,
  notes,
  className,
  draft,
  totals,
  placeOfSupply,
}: {
  settings: AppSettings | undefined;
  number: string;
  date: string;
  dueDate: string;
  customer: { name: string; gstin: string; billingAddress: string; state: string };
  siteName: string;
  orderRef: string;
  lines: InvoiceDocLine[];
  gstMode: GstMode;
  additionalCharges: AdditionalCost[];
  notes?: string;
  className?: string;
  draft?: boolean;
  totals?: InvoiceDocTotals;
  placeOfSupply?: string;
}) {
  const subtotal = totals?.subtotal ?? lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const extras = totals?.extras ?? additionalCharges.reduce((s, c) => s + c.amount, 0);
  const taxByRate = new Map<number, number>();
  if (gstMode !== "None")
    lines.forEach((l) =>
      taxByRate.set(
        l.gstRate,
        (taxByRate.get(l.gstRate) ?? 0) + (l.quantity * l.rate * l.gstRate) / 100,
      ),
    );
  const tax = [...taxByRate.values()].reduce((s, v) => s + v, 0);
  const total = totals?.total ?? Math.round((subtotal + extras + tax) * 100) / 100;
  // One rate: show the stored split; several rates: per-rate split of the preview maths.
  const stored =
    totals && taxByRate.size <= 1
      ? {
          rate: [...taxByRate.keys()][0] ?? 0,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
        }
      : null;
  return (
    <article
      className={cn(
        "print-area relative rounded-xl border bg-white p-6 text-[13px] text-stone-800 shadow-sm sm:p-8",
        className,
      )}
      aria-label={`Invoice ${number}`}
    >
      {draft && (
        <span className="pointer-events-none absolute right-6 top-6 rotate-6 rounded border-2 border-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-amber-600">
          Preview
        </span>
      )}
      <header className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-5 sm:flex-row">
        <div>
          <p className="font-display text-lg font-extrabold text-stone-900">
            {settings?.business.legalName ?? "Meridian Materials & Supply Pvt Ltd"}
          </p>
          <p className="max-w-xs text-xs text-stone-500">{settings?.business.address}</p>
          <p className="text-xs text-stone-500">
            GSTIN {settings?.gst.gstin} · {settings?.business.phone}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Tax invoice
          </p>
          <p className="font-display text-xl font-extrabold text-stone-900">{number}</p>
          <p className="text-xs text-stone-500">
            Date {formatDate(date)} · Due {formatDate(dueDate)}
          </p>
        </div>
      </header>
      <section className="grid gap-4 border-b border-stone-200 py-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-stone-500">Bill to</p>
          <p className="font-semibold text-stone-900">{customer.name || "—"}</p>
          <p className="text-xs text-stone-600">{customer.billingAddress}</p>
          <p className="text-xs text-stone-600">
            GSTIN {customer.gstin || "—"} · {customer.state}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase text-stone-500">Ship to / order</p>
          <p className="font-semibold text-stone-900">{siteName || "—"}</p>
          <p className="text-xs text-stone-600">Order {orderRef || "—"}</p>
          {placeOfSupply && (
            <p className="text-xs text-stone-600">Place of supply: state code {placeOfSupply}</p>
          )}
        </div>
      </section>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-stone-300 text-left text-xs text-stone-500">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 font-semibold">HSN</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Rate</th>
              <th className="py-2 text-right font-semibold">GST</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  Select delivered trips to add lines
                </td>
              </tr>
            )}
            {lines.map((l) => (
              <tr key={`${l.description}-${l.rate}`} className="border-b border-stone-100">
                <td className="py-2">
                  <p className="font-medium text-stone-900">{l.description}</p>
                  <p className="text-xs text-stone-500">
                    {l.trips} trip{l.trips === 1 ? "" : "s"} · delivery weight
                  </p>
                </td>
                <td className="py-2">{l.hsn}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatNumber(l.quantity, 2)} {l.unit}
                </td>
                <td className="py-2 text-right tabular-nums">{formatINR(l.rate)}</td>
                <td className="py-2 text-right tabular-nums">
                  {gstMode === "None" ? "—" : `${l.gstRate}%`}
                </td>
                <td className="py-2 text-right tabular-nums">{formatINR(l.quantity * l.rate)}</td>
              </tr>
            ))}
            {additionalCharges
              .filter((c) => c.label)
              .map((c) => (
                <tr key={c.label} className="border-b border-stone-100">
                  <td className="py-2" colSpan={5}>
                    {c.label}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatINR(c.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <section className="mt-4 flex flex-col justify-between gap-6 sm:flex-row">
        <div className="max-w-sm text-xs text-stone-500">
          <p className="font-medium text-stone-700">{rupeesInWords(total)}</p>
          {settings?.business.bankDetails && (
            <p className="mt-3">Bank: {settings.business.bankDetails}</p>
          )}
          {notes && <p className="mt-2">{notes}</p>}
        </div>
        <dl className="w-full space-y-1 sm:w-64">
          <div className="flex justify-between">
            <dt className="text-stone-500">Subtotal</dt>
            <dd className="tabular-nums">{formatINR(subtotal)}</dd>
          </div>
          {extras > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-500">Additional charges</dt>
              <dd className="tabular-nums">{formatINR(extras)}</dd>
            </div>
          )}
          {stored && gstMode === "CGST+SGST" && (
            <>
              <div className="flex justify-between">
                <dt className="text-stone-500">CGST {stored.rate / 2}%</dt>
                <dd className="tabular-nums">{formatINR(stored.cgst, { paise: true })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">SGST {stored.rate / 2}%</dt>
                <dd className="tabular-nums">{formatINR(stored.sgst, { paise: true })}</dd>
              </div>
            </>
          )}
          {stored && gstMode === "IGST" && (
            <div className="flex justify-between">
              <dt className="text-stone-500">IGST {stored.rate}%</dt>
              <dd className="tabular-nums">{formatINR(stored.igst, { paise: true })}</dd>
            </div>
          )}
          {!stored &&
            [...taxByRate.entries()].map(([rate, amount]) =>
              gstMode === "CGST+SGST" ? (
                <div key={rate}>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">CGST {rate / 2}%</dt>
                    <dd className="tabular-nums">{formatINR(amount / 2, { paise: true })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">SGST {rate / 2}%</dt>
                    <dd className="tabular-nums">{formatINR(amount / 2, { paise: true })}</dd>
                  </div>
                </div>
              ) : (
                <div key={rate} className="flex justify-between">
                  <dt className="text-stone-500">IGST {rate}%</dt>
                  <dd className="tabular-nums">{formatINR(amount, { paise: true })}</dd>
                </div>
              ),
            )}
          <div className="flex justify-between border-t border-stone-300 pt-2 text-base font-bold text-stone-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatINR(total, { paise: true })}</dd>
          </div>
        </dl>
      </section>
      <footer className="mt-8 flex justify-between border-t border-stone-200 pt-4 text-xs text-stone-500">
        <span>E. & O.E.</span>
        <span>For {settings?.business.name ?? "Meridian Supply"} · Authorised signatory</span>
      </footer>
    </article>
  );
}
