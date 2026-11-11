import { createFileRoute } from "@tanstack/react-router";
import { DriverUploadPage } from "@/pages/public/driver-upload-page";

/** Public driver upload page. Not indexed, never sends the link in a Referer header. */
export const Route = createFileRoute("/u/$token")({
  head: () => ({
    meta: [
      { title: "Send documents" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function DriverUploadRoute() {
    const { token } = Route.useParams();
    return <DriverUploadPage token={token} />;
  },
});
