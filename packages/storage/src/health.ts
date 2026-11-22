import type { DependencyCheck } from "@originos/contracts";
import type { ObjectStore } from "./object-store.js";
import type { MalwareScanner } from "./scanner.js";

async function timed(fn: () => Promise<boolean>): Promise<DependencyCheck> {
  const start = performance.now();
  const ok = await fn();
  const latencyMs = Math.round(performance.now() - start);
  return ok ? { status: "ok", latencyMs } : { status: "unreachable", latencyMs };
}

export function storageHealthCheck(store: ObjectStore | null): Promise<DependencyCheck> {
  if (!store)
    return Promise.resolve({ status: "not_configured", detail: "S3_ENDPOINT is not set" });
  return timed(() => store.ping());
}

export function scannerHealthCheck(scanner: MalwareScanner | null): Promise<DependencyCheck> {
  if (!scanner)
    return Promise.resolve({
      status: "not_configured",
      detail: "CLAMAV_HOST is not set; uploads stay quarantined",
    });
  return timed(() => scanner.ping());
}
