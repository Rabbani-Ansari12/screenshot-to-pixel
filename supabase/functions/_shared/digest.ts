// Builds the exceptions digest e-mail (pure; tested in digest.test.ts).

export interface DigestItem {
  kind: string;
  severity: string;
  title: string;
  detail: string | null;
  href: string | null;
  occurrences: number;
  created_at: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const LABEL: Record<string, string> = {
  document_review: "Documents to review",
  document_failed: "Documents that could not be read",
  shortage: "Deliveries above tolerance",
  financial: "Bills / invoices to check",
  ai_cap: "AI reading limit",
  system: "System",
};

export function buildDigest(items: DigestItem[], appOrigin: string | null, businessName: string) {
  const total = items.reduce((s, i) => s + i.occurrences, 0);
  const groups = new Map<string, DigestItem[]>();
  for (const i of items) groups.set(i.kind, [...(groups.get(i.kind) ?? []), i]);
  const link = (href: string | null) => (appOrigin && href ? `${appOrigin}${href}` : null);
  const subject = `${businessName}: ${total} item${total === 1 ? "" : "s"} need attention`;
  const text = [...groups.entries()]
    .map(
      ([kind, list]) =>
        `${LABEL[kind] ?? kind}\n${list.map((i) => `- ${i.title}${i.detail ? ` (${i.detail})` : ""}${link(i.href) ? ` ${link(i.href)}` : ""}`).join("\n")}`,
    )
    .join("\n\n");
  const html =
    `<p>Exceptions since the last summary. Routine work is not included.</p>` +
    [...groups.entries()]
      .map(
        ([kind, list]) =>
          `<h3>${esc(LABEL[kind] ?? kind)}</h3><ul>${list
            .map((i) => {
              const url = link(i.href);
              const title = esc(i.title);
              return `<li>${url ? `<a href="${esc(url)}">${title}</a>` : title}${i.detail ? ` — ${esc(i.detail)}` : ""}</li>`;
            })
            .join("")}</ul>`,
      )
      .join("");
  return { subject, text, html, total };
}
