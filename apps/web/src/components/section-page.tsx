import { NotYetAvailable, PageHeader } from "@originos/ui";
import type { ReactNode } from "react";
import type { Section } from "../lib/navigation";

/** Standard page for a section: honest header plus one "not yet available" card per planned feature. */
export function SectionPage({
  section,
  children,
}: {
  readonly section: Section;
  readonly children?: ReactNode;
}) {
  const sorted = [...section.planned].sort((a, b) => a.phase - b.phase);
  return (
    <>
      <PageHeader
        eyebrow={section.modules.join(" · ")}
        title={section.label}
        description={section.summary}
      />
      {children}
      <section aria-labelledby={`${section.id}-planned`}>
        <h2 id={`${section.id}-planned`} className="mb-1 font-display text-xl font-semibold">
          Planned for this section
        </h2>
        <p className="mb-4 text-sm text-fg-muted">
          None of these features is built yet. Each card names the build phase that delivers it.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {sorted.map((p) => (
            <li key={p.feature}>
              <NotYetAvailable feature={p.feature} phase={p.phase} description={p.description} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
