// Document worker. Woken by pg_net right after an upload and by pg_cron every minute.
// Auth: header x-worker-secret must equal the WORKER_SECRET function secret (the same value is
// in Vault as document_worker_secret). Deployed with verify_jwt = false (see config.toml).
// Deploy: npx supabase functions deploy process-document --use-api
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai@1";
import { MissingSecretError, getSecret } from "../_shared/env.ts";
import { createGeminiClient, type GenAiLike } from "../_shared/gemini.ts";
import { DEFAULT_WEIGHTS, type CandidateTrip, type Criterion } from "../_shared/matcher.ts";
import { normalizeVehicleNumber } from "../_shared/normalize.ts";
import { CapReachedError, processDocument, type Deps } from "./pipeline.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  // Structured logs (visible in the Supabase dashboard). Never log secrets or file contents.
  console.log(
    JSON.stringify({ level, event, fn: "process-document", at: new Date().toISOString(), ...data }),
  );
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const nextIstMidnight = () => {
  const now = Date.now() + 5.5 * 3_600_000;
  const midnight = Math.ceil(now / 86_400_000) * 86_400_000;
  return new Date(midnight - 5.5 * 3_600_000 + 5 * 60_000).toISOString();
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let expected: string;
  try {
    expected = getSecret("WORKER_SECRET");
  } catch (e) {
    log("error", "worker_not_configured", { message: (e as Error).message });
    return json({ error: "Worker not configured." }, 503);
  }
  if (!safeEqual(req.headers.get("x-worker-secret") ?? "", expected))
    return json({ error: "Unauthorized" }, 401);

  const admin = createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jobs, error } = await admin.rpc("claim_document_jobs", { p_limit: 5 });
  if (error) {
    log("error", "claim_failed", { message: error.message });
    return json({ error: "Could not claim jobs." }, 500);
  }
  if (!jobs?.length) return json({ processed: 0 });

  // The model is created lazily so a missing / placeholder key defers jobs with a clear note.
  let aiError: string | null = null;
  let ai: Deps["ai"] | null = null;
  try {
    const genai = new GoogleGenAI({ apiKey: getSecret("GEMINI_API_KEY") }) as unknown as GenAiLike;
    ai = createGeminiClient(genai, getSecret("GEMINI_MODEL"));
  } catch (e) {
    aiError =
      e instanceof MissingSecretError ? e.message : `AI client error: ${(e as Error).message}`;
  }

  const deps: Omit<Deps, "ai"> = {
    async loadDocument(id) {
      const { data, error } = await admin
        .from("documents")
        .select(
          "id, business_id, storage_path, mime_type, sha256, trip_hint_id, document_type_hint, received_at",
        )
        .eq("id", id)
        .single();
      if (error) throw new Error(`load document: ${error.message}`);
      return data;
    },
    async downloadFile(path) {
      const { data, error } = await admin.storage.from("documents").download(path);
      if (error || !data) throw new Error(`download: ${error?.message ?? "no data"}`);
      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        mimeType: data.type || "image/jpeg",
      };
    },
    async settings(businessId) {
      const { data, error } = await admin
        .from("app_settings")
        .select("*")
        .eq("business_id", businessId)
        .single();
      if (error) throw new Error(`settings: ${error.message}`);
      return {
        weights: {
          ...DEFAULT_WEIGHTS,
          ...((data.match_weights ?? {}) as Partial<Record<Criterion, number>>),
        },
        threshold: Number(data.match_threshold),
        margin: Number(data.match_margin),
        windowHours: Number(data.match_window_hours),
        netTolerance: Number(data.net_weight_tolerance),
        confidenceThreshold: Number(data.auto_process_confidence_threshold),
      };
    },
    async reserveCall(businessId) {
      const { data, error } = await admin.rpc("ai_reserve_call", { p_business_id: businessId });
      if (error) throw new Error(`reserve call: ${error.message}`);
      return Boolean(data);
    },
    async candidateTrips(businessId, q) {
      const centre = q.around ? Date.parse(q.around) : Date.now();
      const from = new Date(centre - q.windowHours * 3_600_000).toISOString();
      const to = new Date(centre + 24 * 3_600_000).toISOString();
      const select =
        "id, trip_code, status, unit, vehicle_number, loaded_at, delivered_at, loading_weight_id, delivery_weight_id, loading_slip_number, delivery_slip_number, loading_net, delivered_net, loading_document_id, delivery_document_id, material_name, provider_name, transporter_name, order_code, site_name";
      const { data, error } = await admin
        .from("v_trip_list")
        .select(select)
        .eq("business_id", businessId)
        .neq("status", "cancelled")
        .gte("loaded_at", from)
        .lte("loaded_at", to)
        .limit(300);
      if (error) throw new Error(`candidates: ${error.message}`);
      const rows = [...(data ?? [])];
      if (q.tripHintId && !rows.some((r) => r.id === q.tripHintId)) {
        const { data: hinted } = await admin
          .from("v_trip_list")
          .select(select)
          .eq("id", q.tripHintId)
          .maybeSingle();
        if (hinted) rows.push(hinted);
      }
      return rows.map((r) => ({
        ...r,
        vehicle_number: normalizeVehicleNumber(r.vehicle_number) ?? "",
        loading_net: r.loading_net === null ? null : Number(r.loading_net),
        delivered_net: r.delivered_net === null ? null : Number(r.delivered_net),
      })) as CandidateTrip[];
    },
    async findSlipDuplicate(businessId, documentId, slip, vehicle) {
      const { data, error } = await admin
        .from("documents")
        .select("id")
        .eq("business_id", businessId)
        .neq("id", documentId)
        .not("status", "in", "(duplicate,rejected,failed)")
        .eq("extracted->fields->slip_number->>value", slip)
        .eq("extracted->fields->vehicle_number->>value", vehicle)
        .order("received_at")
        .limit(1);
      if (error) throw new Error(`duplicate check: ${error.message}`);
      return data?.[0]?.id ?? null;
    },
    async billParties(businessId, kind) {
      const { data, error } = await admin
        .from(kind === "provider" ? "material_providers" : "transporters")
        .select("id, name, gstin")
        .eq("business_id", businessId)
        .is("deleted_at", null);
      if (error) throw new Error(`bill parties: ${error.message}`);
      return (data ?? []).map((p) => ({ id: p.id, name: p.name, gstin: p.gstin ?? null }));
    },
    async materials(businessId) {
      const { data, error } = await admin
        .from("materials")
        .select("id, name")
        .eq("business_id", businessId)
        .is("deleted_at", null);
      if (error) throw new Error(`materials: ${error.message}`);
      return data ?? [];
    },
    async recordExtraction(documentId, payload) {
      const { error } = await admin.rpc("record_document_extraction", {
        p_document_id: documentId,
        p_result: payload,
      });
      if (error) throw new Error(`record extraction: ${error.message}`);
    },
    async applyDecision(documentId, decision) {
      const { data, error } = await admin.rpc("apply_document_decision", {
        p_document_id: documentId,
        p_decision: decision,
      });
      if (error) throw new Error(`apply decision: ${error.message}`);
      return String(data);
    },
    log: (event, data) => log("info", event, data),
  };

  const deadline = Date.now() + 50_000;
  const results: Record<string, string> = {};
  for (const job of jobs as { id: string; document_id: string; attempts: number }[]) {
    if (Date.now() > deadline) {
      await admin.rpc("defer_document_job", {
        p_job_id: job.id,
        p_until: new Date().toISOString(),
        p_note: "time budget",
      });
      continue;
    }
    if (!ai) {
      await admin.rpc("defer_document_job", {
        p_job_id: job.id,
        p_until: new Date(Date.now() + 3_600_000).toISOString(),
        p_note: `Waiting for AI setup: ${aiError}`,
      });
      log("warn", "ai_not_configured", { documentId: job.document_id, message: aiError });
      results[job.document_id] = "waiting_for_ai";
      continue;
    }
    try {
      const outcome = await processDocument({ ...deps, ai }, job.document_id);
      await admin.rpc("finish_document_job", { p_job_id: job.id, p_error: null });
      results[job.document_id] = outcome.status;
    } catch (e) {
      if (e instanceof CapReachedError) {
        await admin.rpc("defer_document_job", {
          p_job_id: job.id,
          p_until: nextIstMidnight(),
          p_note: e.message,
        });
        results[job.document_id] = "deferred_cap";
        continue;
      }
      const message = e instanceof Error ? e.message : String(e);
      log("error", "document_failed", {
        documentId: job.document_id,
        attempt: job.attempts,
        message,
      });
      await admin.rpc("finish_document_job", { p_job_id: job.id, p_error: message });
      results[job.document_id] = "error";
    }
  }
  return json({ processed: Object.keys(results).length, results });
});
