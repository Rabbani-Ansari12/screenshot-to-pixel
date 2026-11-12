// Step 2 for bills: provider (material) bills and transporter (freight) bills.
// Every field is {value | null, confidence, legible}; nothing is ever guessed or calculated.

const RULES = `You must NEVER guess, infer, calculate or complete a value.
- If a value is not printed, cut off, covered, blurred or you are not sure, return value null with
  legible false and a low confidence. A null is always better than a guess.
- Copy numbers exactly as printed (keep decimals, drop currency symbols and thousands separators
  only). Do not add up columns, do not compute amounts from quantity × rate, do not fill totals.
- Copy each table row as its own line, in printed order. Do not merge or split rows.
- Vehicle numbers are Indian registrations like "MH 12 AB 4821"; copy what is printed.
- Dates are usually day-first (dd/mm/yyyy). Return the date text as printed.
- GSTIN is 15 characters (e.g. 27AAAAA0000A1Z5); copy exactly or null.
- Confidence is your probability (0 to 1) that the value is exactly what is printed.`;

export const PROVIDER_BILL_SYSTEM = `You read material supplier bills (tax invoices for sand, aggregate, cement, bricks)
sent to an Indian construction-material supplier.
${RULES}`;
export const PROVIDER_BILL_PROMPT =
  "Extract this supplier bill: header, every line item, additional charges and tax. Use null for anything not clearly printed.";

export const TRANSPORTER_BILL_SYSTEM = `You read transporter (freight / truck hire) bills sent to an Indian construction-material supplier.
${RULES}
- rate_basis is "per_trip" only if the bill says the rate is per trip / per load, "per_mt" only if it
  says per MT / per ton / per tonne; otherwise null.`;
export const TRANSPORTER_BILL_PROMPT =
  "Extract this transporter bill: header, every trip line, additional charges and tax. Use null for anything not clearly printed.";

const field = (valueType: "string" | "number") => ({
  type: "object",
  properties: {
    value: { anyOf: [{ type: valueType }, { type: "null" }] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    legible: { type: "boolean" },
  },
  required: ["value", "confidence", "legible"],
  additionalProperties: false,
});

const objectOf = (fields: readonly (readonly [string, "string" | "number"])[]) => ({
  type: "object",
  properties: Object.fromEntries(fields.map(([n, t]) => [n, field(t)])),
  required: fields.map(([n]) => n),
  additionalProperties: false,
});

const CHARGE_FIELDS = [
  ["label", "string"],
  ["amount", "number"],
] as const;

const TAX_FIELDS = [
  ["taxable_amount", "number"],
  ["gst_rate", "number"],
  ["cgst", "number"],
  ["sgst", "number"],
  ["igst", "number"],
  ["tax_total", "number"],
] as const;

export const PROVIDER_HEADER_FIELDS = [
  ["bill_number", "string"],
  ["bill_date", "string"],
  ["due_date", "string"],
  ["provider_name", "string"],
  ["provider_gstin", "string"],
  ["material_name", "string"],
  ["quantity", "number"],
  ["unit", "string"],
  ["rate", "number"],
  ["subtotal", "number"],
  ["total_amount", "number"],
] as const;

export const PROVIDER_LINE_FIELDS = [
  ["date", "string"],
  ["reference", "string"],
  ["vehicle_number", "string"],
  ["material_name", "string"],
  ["quantity", "number"],
  ["unit", "string"],
  ["rate", "number"],
  ["amount", "number"],
] as const;

export const TRANSPORTER_HEADER_FIELDS = [
  ["bill_number", "string"],
  ["bill_date", "string"],
  ["due_date", "string"],
  ["transporter_name", "string"],
  ["transporter_gstin", "string"],
  ["period_from", "string"],
  ["period_to", "string"],
  ["number_of_trips", "number"],
  ["transport_quantity", "number"],
  ["rate", "number"],
  ["rate_basis", "string"],
  ["subtotal", "number"],
  ["total_amount", "number"],
] as const;

export const TRANSPORTER_LINE_FIELDS = [
  ["date", "string"],
  ["reference", "string"],
  ["vehicle_number", "string"],
  ["quantity", "number"],
  ["rate", "number"],
  ["amount", "number"],
] as const;

const billSchema = (
  header: readonly (readonly [string, "string" | "number"])[],
  linesKey: string,
  line: readonly (readonly [string, "string" | "number"])[],
  extra: Record<string, unknown> = {},
) => ({
  type: "object",
  properties: {
    ...Object.fromEntries(header.map(([n, t]) => [n, field(t)])),
    [linesKey]: { type: "array", items: objectOf(line) },
    additional_charges: { type: "array", items: objectOf(CHARGE_FIELDS) },
    tax: objectOf(TAX_FIELDS),
    ...extra,
  },
  required: [
    ...header.map(([n]) => n),
    linesKey,
    "additional_charges",
    "tax",
    ...Object.keys(extra),
  ],
  additionalProperties: false,
});

export const PROVIDER_BILL_SCHEMA = billSchema(
  PROVIDER_HEADER_FIELDS,
  "line_items",
  PROVIDER_LINE_FIELDS,
);
export const TRANSPORTER_BILL_SCHEMA = billSchema(
  TRANSPORTER_HEADER_FIELDS,
  "trip_lines",
  TRANSPORTER_LINE_FIELDS,
  { vehicle_numbers: { type: "array", items: field("string") } },
);
