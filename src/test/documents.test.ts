/** Document intake services against the fake client. */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import { fitWithin, prepareUpload, sha256Hex } from "@/lib/upload-prep";
import * as documents from "@/services/documents.service";
import * as review from "@/services/review.service";
import { createFakeSupabase } from "./fake-supabase";
import { ID, TRIP_CODE, fixtureTables } from "./fixtures";

afterEach(() => setSupabaseClient(undefined));

function fake(
  extra: Record<string, Record<string, unknown>[]> = {},
  rpc: Record<string, (a: Record<string, unknown>) => unknown> = {},
) {
  const f = createFakeSupabase({ tables: { ...fixtureTables(), ...extra }, userId: ID.owner, rpc });
  setSupabaseClient(f.client);
  return f;
}

describe("documents", () => {
  it("maps a recorded document: link to the trip, uploader label, fields with confidence", async () => {
    fake();
    const list = await documents.listDocuments();
    const doc = list.find((d) => d.id === ID.docRecorded)!;
    expect(doc).toMatchObject({
      ref: `DOC-${ID.docRecorded.slice(0, 8).toUpperCase()}`,
      type: "Unloading Slip",
      status: "Automatically Recorded",
      source: "Driver Link",
      senderName: "Ramesh (driver)",
      link: { type: "Trip", id: TRIP_CODE },
      confidence: 95,
    });
    expect(doc.fields.find((f) => f.key === "net_weight")).toMatchObject({
      value: "27.55",
      confidence: 95,
    });
  });

  it("shows corrections on top of the original value, keeping the original in the history", async () => {
    fake({
      document_corrections: [
        {
          id: "c1",
          business_id: ID.business,
          document_id: ID.docReview,
          field_key: "net_weight",
          original_value: "27.52",
          corrected_value: "28.12",
          reason: "Printed net smudged",
          corrected_by: ID.owner,
          corrected_at: "2026-11-10T06:00:00+00:00",
          created_at: "2026-11-10T06:00:00+00:00",
        },
      ],
    });
    const { document } = await documents.getDocument(ID.docReview);
    expect(document.fields.find((f) => f.key === "net_weight")).toMatchObject({
      value: "28.12",
      confidence: 100,
    });
    expect(document.corrections[0]).toMatchObject({
      from: "27.52",
      to: "28.12",
      by: "Aarav Mehta",
      reason: "Printed net smudged",
    });
    expect(document.fileUrl).toMatch(/^https:\/\/storage\.test\/documents\//);
  });

  it("uploads to the private bucket under the business folder and registers the file", async () => {
    const f = fake(
      {},
      {
        current_business_id: () => ID.business,
        register_uploaded_document: () => ({ id: ID.docRecorded, status: "received" }),
      },
    );
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], "slip.pdf", {
      type: "application/pdf",
    });
    const [res] = await documents.uploadDocuments([
      { file, typeHint: "Unloading Slip", tripHint: TRIP_CODE, uploadedByLabel: "  Ramesh  " },
    ]);
    const stored = (f.db["storage.objects"] ?? [])[0] as { name: string };
    expect(stored.name).toMatch(new RegExp(`^${ID.business}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.pdf$`));
    const call = f.calls.find((c) => c.name === "register_uploaded_document")!;
    expect(call.args).toMatchObject({
      p_storage_path: stored.name,
      p_sha256: await sha256Hex(file),
      p_document_type_hint: "unloading_slip",
      p_trip_hint_id: ID.trip,
      p_uploaded_by_label: "Ramesh",
    });
    expect(res?.duplicate).toBe(false);
  });

  it("review actions go through the database functions", async () => {
    const f = fake(
      {},
      {
        correct_document_field: () => null,
        review_attach_document: () => null,
        reject_document: () => null,
      },
    );
    await review.resolveReviewItem(ID.docReview, {
      action: "attach",
      tripId: TRIP_CODE,
      reason: "Printed net smudged, calculated is right",
      corrections: [{ key: "net_weight", value: "28.12" }],
    });
    expect(f.calls.map((c) => c.name)).toEqual([
      "correct_document_field",
      "review_attach_document",
    ]);
    expect(f.calls[1]!.args).toMatchObject({ p_trip_id: ID.trip, p_record_type: "loading" });
    await expect(
      review.resolveReviewItem(ID.docReview, { action: "approve_difference", reason: "x" }),
    ).rejects.toThrow(/Reconciliation/);
  });
});

describe("review queue", () => {
  it("lists documents that need review with ranked candidates and the weight conflict", async () => {
    fake();
    const items = await review.listReviewItems();
    const item = items.find((i) => i.id === ID.docReview)!;
    expect(item).toMatchObject({
      reason: "Conflicting weight values",
      priority: "High",
      status: "Open",
    });
    expect(item.weightConflict).toEqual({ printedNet: 27.52, gross: 42.18, tare: 14.06 });
    expect(item.candidateTrips[0]).toMatchObject({
      tripId: TRIP_CODE,
      score: 82,
      recordType: "loading",
    });
    expect(item.candidateTrips[0]!.criteria.vehicle).toBe(true);
  });
});

describe("upload preparation", () => {
  it("fits photos within 2000 px on the long edge, never upscaling", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500, scaled: true });
    expect(fitWithin(1200, 1600)).toEqual({ width: 1200, height: 1600, scaled: false });
  });
  it("passes PDFs through unchanged and rejects other types", async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], "bill.pdf", { type: "application/pdf" });
    const out = await prepareUpload(pdf);
    expect(out).toMatchObject({ mimeType: "application/pdf", ext: "pdf" });
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      prepareUpload(new File(["x"], "notes.txt", { type: "text/plain" })),
    ).rejects.toThrow(/JPG, PNG/);
  });
});
