import { toast } from "sonner";

// The public demo is a static build (npm run build:demo): reads come from a snapshot of the API, writes are refused.
export const DEMO = import.meta.env.VITE_DEMO === "1";

export class DemoReadOnlyError extends Error {
  constructor() {
    super("This demo is read-only");
  }
}

// One shared toast, so a refused write never shows twice (the page's own handler and the global one both call this).
export function toastError(err: unknown) {
  if (err instanceof DemoReadOnlyError) {
    toast.info("This demo is read-only", { id: "demo-read-only", description: "Install the app to track your own search." });
    return;
  }
  toast.error(err instanceof Error ? err.message : String(err));
}

type Snapshot = Record<string, unknown>;
let snapshot: Promise<Snapshot> | null = null;

// GET responses captured by the demo build, keyed by path ("/api/jobs/12"). Loaded once, on first use.
export async function demoGet<T>(url: string): Promise<T> {
  snapshot ??= import("@demo-snapshot").then((m) => m.default as Snapshot);
  const data = await snapshot;
  if (!(url in data)) throw new Error("Not found");
  return structuredClone(data[url]) as T;
}
