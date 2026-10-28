// One palette for the whole app. Active stages warm up and brighten as a job progresses
// (amber -> violet -> blue -> teal -> emerald); every way a job can close is a quiet cool/neutral tone.
// Nothing here is red: a rejection is a closed door, not a failure.
// Tailwind needs literal class names, so each entry spells its classes out in full.

export type Swatch = { hex: string; dot: string; text: string; badge: string };

const CLAY = "#c4775a";

export const STATUS_COLORS: Record<string, Swatch> = {
  Applied: { hex: "#f59e0b", dot: "bg-amber-500", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  Scheduled: { hex: "#38bdf8", dot: "bg-sky-400", text: "text-sky-300", badge: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  Interviewed: { hex: "#3b82f6", dot: "bg-blue-500", text: "text-blue-400", badge: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  Offer: { hex: "#14b8a6", dot: "bg-teal-500", text: "text-teal-400", badge: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  // Filled rather than tinted, so landing the job looks like a celebration.
  Accepted: { hex: "#10b981", dot: "bg-emerald-500", text: "text-emerald-400", badge: "bg-emerald-500 text-emerald-950 border-emerald-400" },
  Rejected: { hex: "#64748b", dot: "bg-slate-500", text: "text-slate-400", badge: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  Withdrew: { hex: "#71717a", dot: "bg-zinc-500", text: "text-zinc-400", badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
  Ghosted: { hex: "#a8a29e", dot: "bg-stone-400", text: "text-stone-400", badge: "bg-stone-500/10 text-stone-400 border-stone-500/25 border-dashed" },
  Scam: { hex: CLAY, dot: "bg-[#c4775a]", text: "text-[#d9967a]", badge: "bg-[#c4775a]/15 text-[#d9967a] border-[#c4775a]/30" },
};

// Rejected splits by how far the job got: the deeper slate went further.
export const REJECTED_POST = { hex: "#64748b", dot: "bg-slate-500" };
export const REJECTED_PRE = { hex: "#94a3b8", dot: "bg-slate-400" };

export const EVENT_COLORS: Record<string, { dot: string; text: string }> = {
  Applied: { dot: "bg-amber-400", text: "text-amber-400" },
  Contact: { dot: "bg-violet-500", text: "text-violet-500" },
  "Follow-Up": { dot: "bg-violet-300", text: "text-violet-300" },
  Screen: { dot: "bg-sky-300", text: "text-sky-300" },
  Interview: { dot: "bg-blue-500", text: "text-blue-500" },
  Offer: { dot: "bg-teal-500", text: "text-teal-500" },
  Accepted: { dot: "bg-emerald-400", text: "text-emerald-400" },
  Rejection: { dot: "bg-slate-500", text: "text-slate-400" },
  Withdrew: { dot: "bg-zinc-500", text: "text-zinc-500" },
  Ghosted: { dot: "bg-stone-400", text: "text-stone-400" },
  Scam: { dot: "bg-[#c4775a]", text: "text-[#d9967a]" },
  Note: { dot: "bg-neutral-400", text: "text-neutral-400" },
};

// Stats and charts that color by series rather than by status.
export const CHART = {
  applied: STATUS_COLORS.Applied.hex,
  reply: "#8b5cf6",
  interview: STATUS_COLORS.Interviewed.hex,
  deepInterview: "#2563eb",
  offer: STATUS_COLORS.Offer.hex,
  accepted: STATUS_COLORS.Accepted.hex,
  rejected: STATUS_COLORS.Rejected.hex,
  neutral: "#a3a3a3",
};


// slate-500 and stone-400, for rgba() cell shading.
export const RGB = { amber: "245, 158, 11", blue: "59, 130, 246", deepBlue: "37, 99, 235", slate: "100, 116, 139", stone: "168, 162, 158" };
