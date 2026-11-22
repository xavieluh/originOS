import { Button, NotYetAvailable } from "@originos/ui";
import { publicPlanned } from "../../lib/navigation";

export default function PublicHomePage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-accent-text">
            Evidence-centered infrastructure
          </p>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Show how work was made, by whom, and what backs it up.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-fg-muted">
            OriginOS connects creator identity, content provenance, AI-agent accountability and
            scientific evidence in one record. Labels say exactly what was checked: a valid C2PA
            manifest proves a supported provenance claim, not human authorship or factual truth.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button action="public.open-workspace" href="/home" variant="primary">
              Open the workspace
            </Button>
            <Button action="public.open-developers" href="/developers">
              Developer console
            </Button>
          </div>
        </div>
      </section>
      <section aria-labelledby="public-network" className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <h2 id="public-network" className="font-display text-2xl font-semibold">
          The public network
        </h2>
        <p className="mt-1 mb-5 text-fg-muted">
          This is a development build. No public records exist yet.
        </p>
        <ul className="grid gap-3 md:grid-cols-3">
          {publicPlanned.map((p) => (
            <li key={p.feature}>
              <NotYetAvailable feature={p.feature} phase={p.phase} description={p.description} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
