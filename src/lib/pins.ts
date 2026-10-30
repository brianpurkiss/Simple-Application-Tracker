import { useCallback, useMemo, useSyncExternalStore } from "react";

// Jobs pinned on the Jobs list so they stay visible whatever the filters say. Kept in this browser only, since a pin
// set is a throwaway comparison, not job data.
const KEY = "pinned-jobs";
const listeners = new Set<() => void>();

// The raw stored text doubles as the snapshot, so React sees a stable value between changes.
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const parse = (raw: string): number[] => {
  try {
    const ids = JSON.parse(raw || "[]");
    return Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};
const write = (ids: number[]) => {
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: pins just won't stick.
  }
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

export function usePinnedJobs() {
  const raw = useSyncExternalStore(subscribe, read);
  const pinned = useMemo(() => new Set(parse(raw)), [raw]);
  const toggle = useCallback((id: number) => {
    const ids = parse(read());
    write(ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  }, []);
  const clear = useCallback(() => write([]), []);
  return { pinned, toggle, clear };
}
