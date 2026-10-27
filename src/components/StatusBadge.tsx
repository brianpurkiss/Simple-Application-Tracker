import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api";
import { statusLabel } from "@/lib/format";
import { GHOSTED_DAYS, INTERVIEWING_STATUSES } from "@/lib/options";

function statusColor(status: string) {
  if (status === "Offer" || status === "Accepted") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (INTERVIEWING_STATUSES.has(status)) return "bg-blue-500/15 text-blue-300 border-blue-500/30";
  if (status === "Rejected" || status === "Scam") return "bg-red-500/10 text-red-300 border-red-500/25";
  if (status === "Withdrew" || status === "Ghosted") return "bg-neutral-500/15 text-neutral-400 border-neutral-500/25";
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

export function StatusBadge({ job }: { job: Pick<Job, "status" | "interview_count" | "screen_count" | "auto_ghosted"> }) {
  return (
    <span
      title={job.auto_ghosted ? `No response or interview in ${GHOSTED_DAYS}+ days` : undefined}
      className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", statusColor(job.status))}>
      {statusLabel(job)}
    </span>
  );
}
