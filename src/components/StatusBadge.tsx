import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api";
import { statusLabel } from "@/lib/jobs";
import { STATUS_COLORS } from "@/lib/colors";
import { GHOSTED_DAYS } from "@/lib/options";

// `plain` shows a rejection as just "Rejected", without the interview qualifier.
export function StatusBadge({ job, plain }: { job: Pick<Job, "status" | "interview_count" | "screen_count" | "auto_ghosted">; plain?: boolean }) {
  return (
    <span
      title={job.auto_ghosted ? `No response or interview in ${GHOSTED_DAYS}+ days` : undefined}
      className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", (STATUS_COLORS[job.status] ?? STATUS_COLORS.Applied).badge)}>
      {plain && job.status === "Rejected" ? "Rejected" : statusLabel(job)}
    </span>
  );
}
