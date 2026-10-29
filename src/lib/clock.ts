// The app's idea of "now". Normally the real clock; set FROZEN_NOW (server) or VITE_FROZEN_NOW (browser) to a
// local wall time like "2026-10-28T14:30" to pin it, as the demo does so it never goes stale. No "Z": the
// frozen moment reads the same in every timezone. Shared by the server, so it can't rely on Vite alone.
const frozen: string | undefined =
  (typeof process !== "undefined" ? process.env?.FROZEN_NOW : undefined) || import.meta.env?.VITE_FROZEN_NOW || undefined;

export const isFrozen = !!frozen;

export const now = () => (frozen ? new Date(frozen) : new Date());

export const today = () => now().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export const nowTime = () => now().toTimeString().slice(0, 5); // HH:MM in local time
