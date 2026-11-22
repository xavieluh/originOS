import { Button } from "@originos/ui";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4"
    >
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-fg-muted">404</p>
      <h1 className="font-display text-3xl font-semibold">This page does not exist</h1>
      <p className="text-fg-muted">
        The address may be mistyped, or the page belongs to a feature that has not been built.
      </p>
      <div>
        <Button action="not-found.home" href="/home" variant="primary">
          Go to the workspace
        </Button>
      </div>
    </main>
  );
}
