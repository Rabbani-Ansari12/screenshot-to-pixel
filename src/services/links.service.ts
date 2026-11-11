/**
 * Driver upload links (staff side). The raw token exists only in the result of createLink();
 * the database keeps its SHA-256, so a lost link is regenerated, never recovered.
 */
import type { DocumentRecord } from "@/types";
import type { Tables } from "@/lib/supabase";
import { lookupsFor, toDocumentRecord } from "./documents.service";
import { AppError, check, rows, unwrap } from "./supabase/errors";
import { sb, tripUuid } from "./supabase/fetch";

export type LinkDocType =
  "weighbridge_slip" | "loading_slip" | "unloading_slip" | "delivery_photo" | "other";

export const LINK_DOC_TYPES: { value: LinkDocType; label: string }[] = [
  { value: "loading_slip", label: "Loading slip" },
  { value: "unloading_slip", label: "Unloading slip" },
  { value: "delivery_photo", label: "Delivery photo" },
  { value: "weighbridge_slip", label: "Weighbridge slip" },
  { value: "other", label: "Other" },
];

export type LinkState = "Active" | "Expired" | "Revoked" | "Used up";

export interface DriverLink {
  id: string;
  tripId: string;
  tripCode: string;
  vehiclePlate: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  maxUploads: number;
  uploadCount: number;
  remaining: number;
  allowedDocTypes: LinkDocType[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  state: LinkState;
}

export interface CreatedLink {
  id: string;
  /** Full URL with the raw token. Shown once; never stored by the app. */
  url: string;
  expiresAt: string;
  tripCode: string;
}

export function linkState(
  r: Pick<Tables<"upload_tokens">, "revoked_at" | "expires_at" | "upload_count" | "max_uploads">,
  now = Date.now(),
): LinkState {
  if (r.revoked_at) return "Revoked";
  if (Date.parse(r.expires_at) <= now) return "Expired";
  if (r.upload_count >= r.max_uploads) return "Used up";
  return "Active";
}

export const driverLinkUrl = (
  token: string,
  origin = typeof window !== "undefined" ? window.location.origin : "",
) => `${origin}/u/${token}`;

async function toLinks(list: Tables<"upload_tokens">[]): Promise<DriverLink[]> {
  const tripIds = [...new Set(list.map((l) => l.trip_id))];
  const [trips, profiles] = await Promise.all([
    tripIds.length
      ? sb().from("v_trip_list").select("id, trip_code, vehicle_number").in("id", tripIds)
      : Promise.resolve({ data: [], error: null }),
    sb().from("profiles").select("id, full_name, email"),
  ]);
  const tripBy = new Map(rows(trips).map((t) => [t.id ?? "", t]));
  const names = new Map(rows(profiles).map((p) => [p.id, p.full_name || p.email || "User"]));
  return list.map((l) => ({
    id: l.id,
    tripId: l.trip_id,
    tripCode: tripBy.get(l.trip_id)?.trip_code ?? "—",
    vehiclePlate: tripBy.get(l.trip_id)?.vehicle_number ?? "—",
    createdAt: l.created_at,
    createdBy: (l.created_by && names.get(l.created_by)) || "—",
    expiresAt: l.expires_at,
    maxUploads: l.max_uploads,
    uploadCount: l.upload_count,
    remaining: Math.max(0, l.max_uploads - l.upload_count),
    allowedDocTypes: l.allowed_doc_types as LinkDocType[],
    revokedAt: l.revoked_at,
    lastUsedAt: l.last_used_at,
    state: linkState(l),
  }));
}

/** All links (manage_trips; RLS returns nothing for others). */
export async function listLinks(): Promise<DriverLink[]> {
  return toLinks(
    rows(
      await sb()
        .from("upload_tokens")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
  );
}

export interface TripLinks {
  current: DriverLink | null;
  history: DriverLink[];
  documents: DocumentRecord[];
}

/** Links of one trip (by trip code) and the documents uploaded through them. */
export async function getTripLinks(tripCode: string): Promise<TripLinks> {
  const tripId = await tripUuid(tripCode);
  const links = await toLinks(
    rows(
      await sb()
        .from("upload_tokens")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
    ),
  );
  const ids = links.map((l) => l.id);
  const docs = ids.length
    ? rows(
        await sb()
          .from("documents")
          .select("*")
          .in("upload_token_id", ids)
          .is("deleted_at", null)
          .order("received_at", { ascending: false }),
      )
    : [];
  const lk = await lookupsFor(docs);
  return {
    current: links.find((l) => l.state === "Active") ?? null,
    history: links,
    documents: docs.map((d) => toDocumentRecord(d, lk)),
  };
}

export async function createLink(input: {
  tripCode: string;
  expiresInHours?: number;
  allowedDocTypes?: LinkDocType[];
}): Promise<CreatedLink> {
  const res = unwrap(
    await sb().rpc("create_upload_token", {
      p_trip_id: await tripUuid(input.tripCode),
      ...(input.expiresInHours ? { p_expires_in_hours: input.expiresInHours } : {}),
      ...(input.allowedDocTypes?.length ? { p_allowed_doc_types: input.allowedDocTypes } : {}),
    }),
  ) as { id: string; token: string; expires_at: string; trip_code: string };
  if (!res.token) throw new AppError("The link could not be created.");
  return {
    id: res.id,
    url: driverLinkUrl(res.token),
    expiresAt: res.expires_at,
    tripCode: res.trip_code,
  };
}

/** One link per trip, for the bulk action on the trips list. Failures are reported per trip. */
export async function createLinks(
  tripCodes: string[],
): Promise<{ created: CreatedLink[]; failed: { tripCode: string; error: string }[] }> {
  const created: CreatedLink[] = [];
  const failed: { tripCode: string; error: string }[] = [];
  for (const tripCode of tripCodes) {
    try {
      created.push(await createLink({ tripCode }));
    } catch (e) {
      failed.push({ tripCode, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  return { created, failed };
}

export async function revokeLink(id: string): Promise<void> {
  check(await sb().rpc("revoke_upload_token", { p_id: id }));
}

// ---------- Intake status (top bar, Uploads page) ----------
export interface IntakeStats {
  receivedToday: number;
  processedToday: number;
  failedToday: number;
  inProgress: number;
}

const startOfTodayIST = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3_600_000,
  ).toISOString();
};

export async function getIntakeStats(): Promise<IntakeStats> {
  const since = startOfTodayIST();
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    (await build(base())).count ?? 0;
  const base = () =>
    sb().from("documents").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const [receivedToday, processedToday, failedToday, inProgress] = await Promise.all([
    count((q) => q.gte("received_at", since)),
    count((q) =>
      q
        .gte("processed_at", since)
        .in("status", [
          "automatically_recorded",
          "matched",
          "information_extracted",
          "needs_review",
          "duplicate",
        ]),
    ),
    count((q) => q.gte("received_at", since).eq("status", "failed")),
    count((q) => q.in("status", ["received", "processing"])),
  ]);
  return { receivedToday, processedToday, failedToday, inProgress };
}

/** Recent incoming documents from every channel (Uploads page feed). */
export async function listRecentUploads(limit = 100): Promise<DocumentRecord[]> {
  const list = rows(
    await sb()
      .from("documents")
      .select("*")
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(limit),
  );
  const lk = await lookupsFor(list);
  return list.map((d) => toDocumentRecord(d, lk));
}
