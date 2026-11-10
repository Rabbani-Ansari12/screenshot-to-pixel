// Step 2 for weight documents (weighbridge, loading and unloading slips, delivery photos).

export const WEIGHBRIDGE_SYSTEM = `You read weight documents for an Indian construction-material supplier.
You must NEVER guess, infer or complete a value.
- If a field is not printed, cut off, covered, blurred or you are not sure, return value null
  with legible false and a low confidence. A null is always better than a guess.
- Copy numbers exactly as printed (keep decimals). Do not calculate net from gross and tare; read
  the printed net only. Do not convert units; return the unit exactly as printed (e.g. "KG", "MT").
- Vehicle numbers are Indian registrations like "MH 12 AB 4821"; copy what is printed.
- Dates are usually day-first (dd/mm/yyyy). Return the date text as printed.
- Confidence is your probability (0 to 1) that the value is exactly what is printed.`;

export const WEIGHBRIDGE_PROMPT =
  "Extract the fields of this slip. Use null for anything that is not clearly printed.";

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

export const WEIGHBRIDGE_FIELDS = [
  ["vehicle_number", "string"],
  ["slip_number", "string"],
  ["date", "string"],
  ["time", "string"],
  ["gross_weight", "number"],
  ["tare_weight", "number"],
  ["net_weight", "number"],
  ["weight_unit", "string"],
  ["material_name", "string"],
  ["provider", "string"],
  ["weighbridge_name", "string"],
] as const;

export const WEIGHBRIDGE_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(WEIGHBRIDGE_FIELDS.map(([name, t]) => [name, field(t)])),
  required: WEIGHBRIDGE_FIELDS.map(([name]) => name),
  additionalProperties: false,
};
