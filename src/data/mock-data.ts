import type {
  Bill, Customer, DocumentRecord, Expense, Invoice, Material, Order, Payment,
  Provider, Purchase, Transporter, Trip, Vehicle,
} from "@/types/domain";

export const materials: Material[] = [
  { id: "MAT-01", name: "River Sand", category: "Sand", unit: "MT", purchaseRate: 1_480, sellingRate: 1_860, stock: 126 },
  { id: "MAT-02", name: "Crush Sand", category: "Sand", unit: "MT", purchaseRate: 1_120, sellingRate: 1_490, stock: 204 },
  { id: "MAT-03", name: "10 mm Aggregate", category: "Aggregate", unit: "MT", purchaseRate: 870, sellingRate: 1_180, stock: 88 },
  { id: "MAT-04", name: "20 mm Aggregate", category: "Aggregate", unit: "MT", purchaseRate: 940, sellingRate: 1_260, stock: 172 },
  { id: "MAT-05", name: "OPC Cement 53", category: "Cement", unit: "MT", purchaseRate: 6_450, sellingRate: 7_050, stock: 42 },
  { id: "MAT-06", name: "Red Clay Bricks", category: "Masonry", unit: "Trips", purchaseRate: 8_600, sellingRate: 10_400, stock: 0 },
  { id: "MAT-07", name: "TMT Steel Fe 500", category: "Steel", unit: "MT", purchaseRate: 55_200, sellingRate: 59_800, stock: 18 },
];
export const customers: Customer[] = [
  { id: "CUS-01", name: "Meridian Buildcon", kind: "Residential", site: "Meridian Heights", city: "Pune", phone: "+91 98220 41031", outstanding: 4_82_600 },
  { id: "CUS-02", name: "Aster Infra Projects", kind: "Infrastructure", site: "Ring Road Package 3", city: "Pimpri-Chinchwad", phone: "+91 98231 40782", outstanding: 3_18_400 },
  { id: "CUS-03", name: "Northstar Developers", kind: "Commercial", site: "Aundh Business Park", city: "Pune", phone: "+91 97654 19206", outstanding: 1_68_200 },
  { id: "CUS-04", name: "Sahyadri Civil Works", kind: "Civil works", site: "Baner Residency", city: "Pune", phone: "+91 98227 65391", outstanding: 2_34_800 },
  { id: "CUS-05", name: "Kaveri Housing Co.", kind: "Residential", site: "Wagholi Phase II", city: "Wagholi", phone: "+91 98222 80814", outstanding: 0 },
  { id: "CUS-06", name: "Vertex Engineering", kind: "Industrial", site: "Chakan Logistics Park", city: "Chakan", phone: "+91 97662 52283", outstanding: 5_12_000 },
];
export const providers: Provider[] = [
  { id: "PRV-01", name: "Sahyadri Aggregates", city: "Khed", rating: 4.8, materials: ["River Sand", "10 mm Aggregate", "20 mm Aggregate"], payable: 3_76_200 },
  { id: "PRV-02", name: "BlueRock Materials", city: "Talegaon", rating: 4.6, materials: ["Crush Sand", "10 mm Aggregate", "20 mm Aggregate"], payable: 2_18_400 },
  { id: "PRV-03", name: "Deccan Cement Depot", city: "Pune", rating: 4.9, materials: ["OPC Cement 53"], payable: 1_42_800 },
  { id: "PRV-04", name: "Patil Brickyard", city: "Wagholi", rating: 4.4, materials: ["Red Clay Bricks"], payable: 84_600 },
  { id: "PRV-05", name: "Metro Steel & TMT", city: "Bhosari", rating: 4.7, materials: ["TMT Steel Fe 500"], payable: 5_18_000 },
];
export const transporters: Transporter[] = [
  { id: "TRN-01", name: "Om Sai Logistics", city: "Pune", vehicles: 4, payable: 2_14_800, ratePerTrip: 5_800 },
  { id: "TRN-02", name: "Western Haulage Co.", city: "Pimpri", vehicles: 3, payable: 1_68_200, ratePerTrip: 6_200 },
  { id: "TRN-03", name: "Shree Ganesh Carriers", city: "Chakan", vehicles: 4, payable: 98_400, ratePerTrip: 5_400 },
  { id: "TRN-04", name: "Morya Transport", city: "Wagholi", vehicles: 3, payable: 1_32_600, ratePerTrip: 5_600 },
];
export const vehicles: Vehicle[] = [
  { id: "VEH-01", plate: "MH 12 AB 4821", transporterId: "TRN-01", driver: "Ramesh Jadhav", phone: "+91 98221 47018", trips: 24, shortageCount: 3 },
  { id: "VEH-02", plate: "MH 12 CD 7193", transporterId: "TRN-01", driver: "Sanjay Pawar", phone: "+91 98810 62371", trips: 19, shortageCount: 0 },
  { id: "VEH-03", plate: "MH 14 GH 3168", transporterId: "TRN-02", driver: "Nitin Shinde", phone: "+91 99750 11264", trips: 21, shortageCount: 2 },
  { id: "VEH-04", plate: "MH 12 JK 9052", transporterId: "TRN-02", driver: "Akash More", phone: "+91 98229 30518", trips: 17, shortageCount: 1 },
  { id: "VEH-05", plate: "MH 14 LM 2864", transporterId: "TRN-03", driver: "Pravin Bhosale", phone: "+91 97655 77314", trips: 15, shortageCount: 0 },
  { id: "VEH-06", plate: "MH 12 NP 6410", transporterId: "TRN-03", driver: "Ganesh Kale", phone: "+91 98817 24290", trips: 18, shortageCount: 4 },
  { id: "VEH-07", plate: "MH 12 QR 5537", transporterId: "TRN-04", driver: "Mahesh Yadav", phone: "+91 98225 66108", trips: 13, shortageCount: 0 },
  { id: "VEH-08", plate: "MH 14 ST 8024", transporterId: "TRN-04", driver: "Dilip Pawar", phone: "+91 97661 90345", trips: 11, shortageCount: 1 },
];
const o = (id: string, customerId: string, site: string, materialId: string, required: number, dispatched: number, delivered: number, status: string, profit: number): Order => ({ id, ref: `ORD-2026-${id.slice(-2)}${id.slice(-2)}`, customerId, site, materialId, required, dispatched, delivered, rate: materials.find(m => m.id === materialId)?.sellingRate ?? 1_500, status, expected: "2026-11-15", profit });
export const orders: Order[] = [
  o("ORD-01", "CUS-01", "Meridian Heights, Baner", "MAT-01", 180, 132, 108, "In progress", 1_64_800),
  o("ORD-02", "CUS-02", "Ring Road Package 3", "MAT-04", 260, 190, 176, "In progress", 2_88_400),
  o("ORD-03", "CUS-03", "Aundh Business Park", "MAT-02", 145, 145, 145, "Delivered", 1_82_500),
  o("ORD-04", "CUS-04", "Baner Residency", "MAT-03", 110, 88, 72, "Needs review", 92_600),
  o("ORD-05", "CUS-05", "Wagholi Phase II", "MAT-05", 60, 42, 42, "In progress", 1_08_000),
  o("ORD-06", "CUS-06", "Chakan Logistics Park", "MAT-07", 90, 50, 36, "Confirmed shortage", 2_16_800),
  o("ORD-07", "CUS-01", "Meridian Heights, Baner", "MAT-04", 120, 96, 84, "In progress", 1_32_000),
  o("ORD-08", "CUS-02", "Ring Road Package 3", "MAT-03", 160, 128, 128, "Delivered", 1_06_400),
];
export const purchases: Purchase[] = orders.map((order, i) => {
  const material = materials.find(m => m.id === order.materialId)!;
  const provider = providers[i % providers.length]!;
  const qty = order.dispatched + (i % 2 === 0 ? 0 : 12);
  return { id: `PUR-${String(i + 1).padStart(2, "0")}`, ref: `PUR-2026-${String(146 + i).padStart(3, "0")}`, providerId: provider.id, materialId: material.id, orderId: order.id, date: `2026-11-${String(4 + i).padStart(2, "0")}`, quantity: qty, rate: material.purchaseRate + (i % 3) * 22, extraCost: 8_400 + i * 1_250, destination: i % 3 === 0 ? "Stock yard" : "Direct to site", status: i === 5 ? "Needs verification" : "Recorded" };
});
export const trips: Trip[] = Array.from({ length: 12 }, (_, i) => {
  const order = orders[i % orders.length]!;
  const vehicle = vehicles[i % vehicles.length]!;
  const purchase = purchases[i % purchases.length]!;
  const loaded = [28.4, 31.2, 29.8, 26.6, 32, 30.4, 24.8, 27.2, 29.4, 31.8, 25.6, 28.8][i]!;
  const shortage = i === 5 ? 0.8 : i === 2 ? 0.35 : i === 9 ? 0.65 : i === 10 ? 0.45 : 0.12;
  const delivered = Number((loaded - shortage).toFixed(2));
  const status = i === 5 ? "Confirmed shortage" : [2, 9, 10].includes(i) ? "Needs verification" : i === 0 || i === 7 ? "In transit" : "Delivered";
  return { id: `TRP-${String(i + 1).padStart(3, "0")}`, ref: `TRP-2026-${String(123 + i).padStart(5, "0")}`, orderId: order.id, purchaseId: purchase.id, transporterId: vehicle.transporterId, vehicleId: vehicle.id, loaded, delivered, gross: Number((loaded + 14.6).toFixed(2)), tare: 14.6, slip: `WB-${String(8874 + i)}`, date: `2026-11-${String(7 + (i % 3)).padStart(2, "0")}`, status, docs: i % 3 === 0 ? 3 : 2, source: i === 1 || i === 4 ? "Manual" : "WhatsApp AI" };
});
export const documents: DocumentRecord[] = Array.from({ length: 14 }, (_, i) => {
  const trip = trips[i % trips.length]!;
  const statuses = ["Auto-recorded", "Matched", "Needs review", "Processing", "Information extracted", "Received", "Duplicate", "Failed", "Auto-recorded", "Matched", "Needs review", "Auto-recorded", "Received", "Needs review"];
  const kinds = ["Weighbridge slip", "Loading slip", "Unloading slip", "Provider bill", "Delivery photo", "Transporter bill", "Payment receipt", "Weighbridge slip"];
  const status = statuses[i]!;
  return { id: `DOC-${String(i + 1).padStart(3, "0")}`, ref: `WA-2026-${String(2401 + i)}`, kind: kinds[i % kinds.length]!, sender: ["Ramesh Jadhav", "Sahyadri Aggregates", "Western Haulage", "Meridian Site Desk"][i % 4]!, phone: ["+91 98221 47018", "+91 98224 70215", "+91 98231 80550", "+91 98220 41031"][i % 4]!, source: i === 5 ? "Manual upload" : "WhatsApp", received: `2026-11-${String(9 - (i % 4)).padStart(2, "0")}T${String(9 + (i % 9)).padStart(2, "0")}:${i % 2 ? "24" : "08"}:00+05:30`, status, confidence: status === "Needs review" ? 63 + i % 16 : status === "Failed" ? 0 : status === "Duplicate" ? 97 : 91 + i % 8, linked: i % 5 === 3 ? `Bill ${146 + i}` : trip.ref, reason: i === 2 ? "Printed net weight differs from gross − tare." : i === 6 ? "Same weighbridge slip received twice." : i === 10 ? "Vehicle plate could match two active trips." : status === "Needs review" ? "Low confidence in net-weight reading." : "", tripId: trip.id };
});
export const bills: Bill[] = [
  { id: "BIL-01", ref: "SA/26-118", party: "Sahyadri Aggregates", kind: "Provider bill", date: "2026-11-08", amount: 4_86_200, paid: 2_00_000, status: "Needs review", trips: 6, reason: "Billed quantity exceeds linked weighbridge slips by 2.4 MT." },
  { id: "BIL-02", ref: "BR/2026/094", party: "BlueRock Materials", kind: "Provider bill", date: "2026-11-07", amount: 3_24_800, paid: 3_24_800, status: "Reconciled", trips: 4, reason: "All purchase entries match." },
  { id: "BIL-03", ref: "DCD-2611-48", party: "Deccan Cement Depot", kind: "Provider bill", date: "2026-11-06", amount: 2_18_400, paid: 1_00_000, status: "Pending", trips: 3, reason: "Payment is part-settled." },
  { id: "BIL-04", ref: "WH/1108/22", party: "Western Haulage Co.", kind: "Transporter bill", date: "2026-11-08", amount: 1_24_000, paid: 60_000, status: "Needs review", trips: 20, reason: "Two trips are missing from the bill attachment." },
  { id: "BIL-05", ref: "OSL-2026-77", party: "Om Sai Logistics", kind: "Transporter bill", date: "2026-11-05", amount: 98_600, paid: 98_600, status: "Reconciled", trips: 17, reason: "All trip charges matched." },
  { id: "BIL-06", ref: "MG-1126-13", party: "Morya Transport", kind: "Transporter bill", date: "2026-11-04", amount: 86_800, paid: 0, status: "Pending", trips: 14, reason: "Awaiting trip-level verification." },
  { id: "BIL-07", ref: "PS/26/355", party: "Patil Brickyard", kind: "Provider bill", date: "2026-11-03", amount: 1_52_000, paid: 70_000, status: "Pending", trips: 2, reason: "Part payment recorded." },
];
export const invoices: Invoice[] = orders.slice(0, 7).map((order, i) => ({ id: `INV-${String(i + 1).padStart(2, "0")}`, ref: `INV-2026-${String(398 + i)}`, customerId: order.customerId, orderId: order.id, date: `2026-11-${String(3 + i).padStart(2, "0")}`, amount: order.delivered * order.rate * 1.05, paid: [0, 0.45, 1, 0, 0.7, 0, 1][i]! * order.delivered * order.rate * 1.05, status: ["Unpaid", "Partial", "Paid", "Unpaid", "Partial", "Unpaid", "Paid"][i]!, tax: "CGST + SGST" }));
export const payments: Payment[] = Array.from({ length: 12 }, (_, i) => {
  const invoice = invoices[i % invoices.length]!;
  const bill = bills[i % bills.length]!;
  const incoming = i % 3 !== 0;
  const party = incoming ? customers[i % customers.length]!.name : bill.party;
  return { id: `PAY-${String(i + 1).padStart(3, "0")}`, ref: `PAY-2026-${String(610 + i)}`, party, direction: incoming ? "Incoming" : "Outgoing", date: `2026-11-${String(2 + i % 8).padStart(2, "0")}`, amount: [42_000, 78_500, 1_25_000, 56_000, 96_400, 32_000][i % 6]!, mode: ["UPI", "Bank transfer", "Cheque", "NEFT", "UPI", "Cash"][i % 6]!, linked: incoming ? invoice.ref : bill.ref };
});
export const expenses: Expense[] = [
  { id: "EXP-01", category: "Loading", note: "Site loading · Meridian Heights", date: "2026-11-08", amount: 8_400, linked: "TRP-2026-00123" },
  { id: "EXP-02", category: "Fuel", note: "Diesel advance · MH 12 AB 4821", date: "2026-11-08", amount: 12_000, linked: "TRP-2026-00123" },
  { id: "EXP-03", category: "Toll", note: "Pune–Nashik highway toll", date: "2026-11-08", amount: 1_280, linked: "TRP-2026-00125" },
  { id: "EXP-04", category: "Unloading", note: "Ring Road Package 3", date: "2026-11-07", amount: 6_200, linked: "ORD-2026-0202" },
  { id: "EXP-05", category: "Labour", note: "Yard handling team · weekly", date: "2026-11-07", amount: 18_600, linked: "Stock yard" },
  { id: "EXP-06", category: "Waiting charges", note: "Queue delay · Chakan Logistics", date: "2026-11-06", amount: 3_600, linked: "TRP-2026-00128" },
  { id: "EXP-07", category: "Other", note: "Weighbridge service charge", date: "2026-11-05", amount: 1_800, linked: "Operations" },
];
export const whatsappMessages = documents.slice(0, 8).map((doc, i) => ({ id: `MSG-${i + 1}`, sender: doc.sender, phone: doc.phone, date: doc.received, text: ["Sharing today's loading slip for the Baner delivery.", "Please find the weighbridge slip attached.", "Bill copy for this week's material supply.", "Delivery confirmed at the site. Receipt attached."][i % 4], attachments: i % 3 + 1, status: doc.status, documentId: doc.id }));
export const auditEvents = [
  { date: "09 Nov 2026, 09:42", user: "Aarav Mehta", action: "Document auto-matched", entity: "DOC-012 · Weighbridge slip", change: "Trip match: TRP-2026-00131" },
  { date: "09 Nov 2026, 09:18", user: "Neha Kulkarni", action: "Payment recorded", entity: "PAY-012 · Customer receipt", change: "₹96,400 · UPI" },
  { date: "08 Nov 2026, 18:06", user: "Aarav Mehta", action: "Bill marked for review", entity: "BIL-04 · Transporter bill", change: "2 trips not matched" },
  { date: "08 Nov 2026, 16:44", user: "System", action: "Delivery slip received", entity: "DOC-011 · Unloading slip", change: "Confidence 71% · Review requested" },
  { date: "08 Nov 2026, 15:32", user: "Aarav Mehta", action: "Order updated", entity: "ORD-2026-0101", change: "Required quantity: 165 → 180 MT" },
  { date: "08 Nov 2026, 11:12", user: "Neha Kulkarni", action: "Invoice created", entity: "INV-2026-403", change: "₹7,43,310 · CGST + SGST" },
];
export const employeeRecords = [
  { id: "EMP-01", name: "Neha Kulkarni", role: "Operations", email: "neha@meridianmaterials.in", permissions: ["View records", "Manage orders", "Review documents", "Manage trips", "Correct extracted info"] },
  { id: "EMP-02", name: "Rohit Deshmukh", role: "Accounts", email: "rohit@meridianmaterials.in", permissions: ["View records", "Verify bills", "Record payments", "View financial reports"] },
  { id: "EMP-03", name: "Priya Nair", role: "Dispatch", email: "priya@meridianmaterials.in", permissions: ["View records", "Manage orders", "Manage trips"] },
];
export const monthlyTrend = [
  { month: "Jun", sales: 38.4, cost: 31.2, profit: 7.2 }, { month: "Jul", sales: 42.6, cost: 34.1, profit: 8.5 },
  { month: "Aug", sales: 46.1, cost: 36.7, profit: 9.4 }, { month: "Sep", sales: 44.8, cost: 35.8, profit: 9 },
  { month: "Oct", sales: 52.2, cost: 41.4, profit: 10.8 }, { month: "Nov", sales: 26.8, cost: 20.6, profit: 6.2 },
];
export const automationTrend = [
  { day: "Mon", matched: 32, review: 8 }, { day: "Tue", matched: 44, review: 6 }, { day: "Wed", matched: 38, review: 11 },
  { day: "Thu", matched: 52, review: 7 }, { day: "Fri", matched: 47, review: 8 }, { day: "Sat", matched: 41, review: 5 }, { day: "Sun", matched: 36, review: 4 },
];
