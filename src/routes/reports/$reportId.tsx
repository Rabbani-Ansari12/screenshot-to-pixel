import { createFileRoute, notFound } from "@tanstack/react-router";
import { ReportPage } from "@/pages/reports-page";
import { REPORTS, type ReportId } from "@/services/reports.service";

export const Route = createFileRoute("/reports/$reportId")({
  beforeLoad: ({ params }) => {
    if (!REPORTS.some((r) => r.id === params.reportId)) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${REPORTS.find((r) => r.id === params.reportId)?.title ?? "Report"} · Meridian Supply`,
      },
    ],
  }),
  component: function ReportRoute() {
    const { reportId } = Route.useParams();
    return <ReportPage reportId={reportId as ReportId} />;
  },
});
