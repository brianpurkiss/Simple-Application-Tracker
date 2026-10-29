import { toast } from "sonner";

// The public demo is a static build (npm run build:demo): reads come from a snapshot of the API, writes pretend to
// succeed but change nothing.
export const DEMO = import.meta.env.VITE_DEMO === "1";

export function toastError(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err));
}

// Every write in the demo ends here. One shared id, so a write that also has a success toast never shows two.
const toastNotSaved = () => toast.info("This is a demo, your changes were not saved.", { id: "demo-not-saved" });

// Success toasts for writes. The demo shows its notice instead, which also covers profile edits that stay in the tab.
export const toastSaved: typeof toast.success = (...args) => (DEMO ? toastNotSaved() : toast.success(...args));

type Snapshot = Record<string, unknown>;
let snapshot: Promise<Snapshot> | null = null;

// GET responses captured by the demo build, keyed by path ("/api/jobs/12"). Loaded once, on first use.
export async function demoGet<T>(url: string): Promise<T> {
  snapshot ??= import("@demo-snapshot").then((m) => m.default as Snapshot);
  const data = await snapshot;
  if (!(url in data)) throw new Error("Not found");
  return structuredClone(data[url]) as T;
}

// A write in the demo: a short pause so the form feels like it saved, then the request echoed back. Callers only
// close dialogs and reset forms with the result, and the refetch that follows brings back the snapshot's data.
export async function demoWrite<T>(body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 350));
  toastNotSaved();
  return structuredClone(body ?? {}) as T;
}
