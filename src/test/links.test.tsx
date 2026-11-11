/** Driver links: staff service, link states, and the public upload page (network mocked). */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import * as links from "@/services/links.service";
import { DriverUploadPage } from "@/pages/public/driver-upload-page";
import { createFakeSupabase } from "./fake-supabase";
import { ID, TRIP_CODE, fixtureTables } from "./fixtures";

afterEach(() => {
  cleanup();
  setSupabaseClient(undefined);
  vi.unstubAllGlobals();
});

const RAW = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

function fake(rpc: Record<string, (a: Record<string, unknown>) => unknown> = {}) {
  const f = createFakeSupabase({ tables: fixtureTables(), userId: ID.owner, rpc });
  setSupabaseClient(f.client);
  return f;
}

describe("links service", () => {
  it("returns the raw link once, built from the token the database generated", async () => {
    const f = fake({
      create_upload_token: () => ({
        id: "new",
        token: RAW,
        expires_at: "2026-11-14T00:00:00Z",
        trip_code: TRIP_CODE,
      }),
    });
    const link = await links.createLink({ tripCode: TRIP_CODE, expiresInHours: 24 });
    expect(link.url).toBe(`${window.location.origin}/u/${RAW}`);
    expect(f.calls[0]?.args).toEqual({ p_trip_id: ID.trip, p_expires_in_hours: 24 });
    // the app never writes tokens itself
    expect(f.log.some((l) => l.table === "upload_tokens" && l.op !== "select")).toBe(false);
  });

  it("works out link states", () => {
    const base = {
      revoked_at: null,
      expires_at: "2099-01-01T00:00:00Z",
      upload_count: 0,
      max_uploads: 5,
    };
    expect(links.linkState(base)).toBe("Active");
    expect(links.linkState({ ...base, revoked_at: "2026-11-10T00:00:00Z" })).toBe("Revoked");
    expect(links.linkState({ ...base, expires_at: "2020-01-01T00:00:00Z" })).toBe("Expired");
    expect(links.linkState({ ...base, upload_count: 5 })).toBe("Used up");
  });

  it("lists a trip's links with the documents that came through them", async () => {
    fake();
    const t = await links.getTripLinks(TRIP_CODE);
    expect(t.current).toMatchObject({
      tripCode: TRIP_CODE,
      remaining: 19,
      state: "Active",
      createdBy: "Aarav Mehta",
    });
    expect(t.documents.map((d) => d.id)).toEqual([ID.docRecorded]);
    expect(t.documents[0]).toMatchObject({ source: "Driver Link", senderName: "Ramesh (driver)" });
  });

  it("bulk-creates links and reports failures per trip", async () => {
    fake({
      create_upload_token: (a) => {
        if (a["p_trip_id"] !== ID.trip) throw new Error("Trip not found.");
        return { id: "x", token: RAW, expires_at: "2026-11-14T00:00:00Z", trip_code: TRIP_CODE };
      },
    });
    const res = await links.createLinks([TRIP_CODE, "TRP-2026-99999"]);
    expect(res.created).toHaveLength(1);
    expect(res.failed[0]?.tripCode).toBe("TRP-2026-99999");
  });
});

describe("driver upload page", () => {
  const info = {
    trip_code: TRIP_CODE,
    vehicle_number: "MH12AB4821",
    material_name: "River Sand",
    allowed_doc_types: ["loading_slip", "unloading_slip"],
    remaining_uploads: 3,
  };

  it("shows only trip code, vehicle and material, and the allowed document types", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(info), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DriverUploadPage token={RAW} />);
    await waitFor(() => expect(screen.getByText("MH12AB4821")).toBeInTheDocument());
    expect(screen.getByText(`${TRIP_CODE} · River Sand`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading slip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delivery photo" })).toBeNull();
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeInTheDocument();
    expect(screen.getByText(/3 left on this link/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/functions/v1/driver-upload-info?token=");
    expect(init.referrerPolicy).toBe("no-referrer");
    // no navigation to the rest of the app
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows a plain message for an invalid link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "This upload link is not valid any more. Ask the office for a new link.",
            }),
            { status: 404 },
          ),
      ),
    );
    render(<DriverUploadPage token={RAW} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not valid any more/));
    expect(screen.queryByRole("button", { name: /Take photo/ })).toBeNull();
  });

  it("remembers the driver's name on the phone when available", async () => {
    localStorage.setItem("driver-name", "Ramesh");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(info), { status: 200 })),
    );
    render(<DriverUploadPage token={RAW} />);
    await waitFor(() => expect(screen.getByLabelText(/Your name/)).toHaveValue("Ramesh"));
    fireEvent.click(screen.getByRole("button", { name: "Unloading slip" }));
    expect(screen.getByRole("button", { name: "Unloading slip" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
