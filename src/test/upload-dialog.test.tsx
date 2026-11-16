/** The core flow: upload a slip, see what AI read and where it was recorded; retry on failure. */
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { setSupabaseClient } from "@/lib/supabase";
import { UploadDialog } from "@/components/upload-dialog";
import { createFakeSupabase } from "./fake-supabase";
import { ID, TRIP_CODE, fixtureTables } from "./fixtures";

afterEach(() => {
  cleanup();
  setSupabaseClient(undefined);
});

const NEW_DOC = "4a000000-0000-4000-8000-0000000000aa";

function setup({ failFirstStore = false } = {}) {
  const tables = fixtureTables();
  const template = tables["documents"]![0]!;
  const fake = createFakeSupabase({
    tables,
    userId: ID.owner,
    rpc: {
      current_business_id: () => ID.business,
      register_uploaded_document: (args) => {
        fake.db["documents"]!.push({
          ...template,
          id: NEW_DOC,
          sha256: args["p_sha256"],
          file_name: args["p_file_name"],
          status: "processing",
          trip_id: null,
          trip_hint_id: null,
          extracted: null,
          source: "staff_upload",
        });
        return { id: NEW_DOC, status: "received" };
      },
    },
  });
  if (failFirstStore) {
    const storage = fake.client.storage;
    let failed = false;
    const original = storage.from.bind(storage);
    (storage as { from: typeof storage.from }).from = (bucket: string) => {
      const api = original(bucket);
      return {
        ...api,
        upload: async (...a: Parameters<typeof api.upload>) => {
          if (!failed) {
            failed = true;
            return { data: null, error: { message: "Network request failed" } };
          }
          return api.upload(...a);
        },
      } as typeof api;
    };
  }
  setSupabaseClient(fake.client);

  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <span data-testid="state">{open ? "open" : "closed"}</span>
        <UploadDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }
  const root = createRootRoute({ component: Harness });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fake;
}

const slip = () =>
  new File([new Uint8Array([7, 7, 7, Date.now() % 255])], "slip.pdf", {
    type: "application/pdf",
  });

async function addFile() {
  const input = await screen.findByLabelText("Choose files to upload");
  fireEvent.change(input, { target: { files: [slip()] } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Upload 1 file$/ })).toBeEnabled(),
  );
}

describe("upload dialog", () => {
  it("shows the AI result and the trip it was recorded on", async () => {
    const fake = setup();
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /^Upload 1 file$/ }));

    expect(await screen.findByText(/Reading 1 of 1/)).toBeInTheDocument();
    expect(fake.calls.some((c) => c.name === "register_uploaded_document")).toBe(true);

    // The worker finishes reading and records it on the trip.
    const row = fake.db["documents"]!.find((d) => d["id"] === NEW_DOC)!;
    Object.assign(row, {
      status: "automatically_recorded",
      trip_id: ID.trip,
      extracted: {
        doc_type: "unloading_slip",
        fields: {
          vehicle_number: { value: "MH12AB4821", confidence: 0.97 },
          net_weight: { value: 27.55, confidence: 0.95 },
        },
      },
    });
    expect(await screen.findByText("All read.", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: TRIP_CODE })).toBeInTheDocument();
    expect(screen.getByText(/MH12AB4821 · Net 27.55 MT/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  }, 15000);

  it("sends unclear documents to review with a link to check them", async () => {
    const fake = setup();
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /^Upload 1 file$/ }));
    await screen.findByText(/Reading 1 of 1/);
    Object.assign(
      fake.db["documents"]!.find((d) => d["id"] === NEW_DOC)!,
      {
        status: "needs_review",
        review_reason: "no_match",
      },
    );
    expect(
      await screen.findByRole("link", { name: "Check now" }, { timeout: 8000 }),
    ).toHaveAttribute("href", `/review/${NEW_DOC}`);
  }, 15000);

  it("lets a failed upload be retried without adding the file again", async () => {
    setup({ failFirstStore: true });
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /^Upload 1 file$/ }));
    expect(await screen.findByText(/Some files did not upload/)).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: /^Retry 1 file$/ });
    fireEvent.click(retry);
    expect(await screen.findByText(/Reading 1 of 1/)).toBeInTheDocument();
  }, 15000);

  it("clears the chosen files on Cancel", async () => {
    setup();
    await addFile();
    expect(screen.getByText("slip.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
    expect(screen.queryByText("slip.pdf")).toBeNull();
  }, 15000);
});
