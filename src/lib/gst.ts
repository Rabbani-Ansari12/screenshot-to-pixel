/**
 * GST helpers shared by the invoice preview and tests. The database (create_invoice) makes the
 * final decision with the same rule: same state as the business → CGST + SGST, otherwise IGST.
 */
import type { GstMode } from "@/types";

const STATES: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  "andaman and nicobar islands": "35",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
};

/** "27AAAAA0000A1Z5", "27 · Maharashtra" or "Maharashtra" → "27"; null when unknown. */
export function gstStateCode(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const digits = /^(\d{2})/.exec(v);
  if (digits) return digits[1] ?? null;
  return STATES[v.replace(/^[\d\s·-]+/, "").toLowerCase()] ?? null;
}

/** Tax mode for a sale, given the business state and the customer's GSTIN / state. */
export function gstModeFor(
  businessState: string | null | undefined,
  customer: { gstin?: string | null; state?: string | null },
  fallback: GstMode = "CGST+SGST",
): GstMode {
  const home = gstStateCode(businessState);
  const place = gstStateCode(customer.gstin) ?? gstStateCode(customer.state);
  if (!home || !place) return fallback;
  return home === place ? "CGST+SGST" : "IGST";
}

/** CGST / SGST / IGST split of a tax amount, rounded to paise like the database does. */
export function splitGst(tax: number, mode: GstMode): { cgst: number; sgst: number; igst: number } {
  const t = Math.round(tax * 100) / 100;
  if (mode === "None") return { cgst: 0, sgst: 0, igst: 0 };
  if (mode === "IGST") return { cgst: 0, sgst: 0, igst: t };
  const half = Math.round((t / 2) * 100) / 100;
  return { cgst: half, sgst: Math.round((t - half) * 100) / 100, igst: 0 };
}
