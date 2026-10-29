import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Target, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { TableCell } from "@/components/ui/table";
import { type Job, useProfile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { rowLink } from "@/lib/rowLink";
import { k } from "@/lib/salary";
import { fmtPct, MIN_SAMPLE, salaryQuartiles } from "@/lib/stats";
import { cn } from "@/lib/utils";

// Pay columns shared by the segment tables: quartiles of listed pay (range midpoints), plus how many jobs listed it.
export type SalaryCells = { salaryLow: number | null; salaryMid: number | null; salaryHigh: number | null; paid: number };

export function salaryCells(jobs: Job[]): SalaryCells {
  const q = salaryQuartiles(jobs);
  return { salaryLow: q?.p25 ?? null, salaryMid: q?.p50 ?? null, salaryHigh: q?.p75 ?? null, paid: q?.n ?? 0 };
}

const PAY_NOTE = "of listed pay (range midpoints)";
export const SALARY_COLUMNS: { key: "salaryLow" | "salaryMid" | "salaryHigh"; label: string; numeric: true; title: string }[] = [
  { key: "salaryLow", label: "Low", numeric: true, title: `25th percentile ${PAY_NOTE}` },
  { key: "salaryMid", label: "Median", numeric: true, title: `Median ${PAY_NOTE}` },
  { key: "salaryHigh", label: "High", numeric: true, title: `75th percentile ${PAY_NOTE}` },
];

// Quartiles land between listings, so they're shown to the nearest $1k.
const money = (n: number | null) => (n === null ? "–" : k(Math.round(n / 1000) * 1000));

// Dimmed when too few jobs list pay for the spread to mean much. A median at or above the salary target is marked.
export function SalaryCellsView({ row }: { row: SalaryCells }) {
  const target = useProfile().data?.salary_target ?? null;
  const dim = row.paid < MIN_SAMPLE && "text-muted-foreground";
  const title = row.paid ? `${row.paid} job${row.paid === 1 ? "" : "s"} list pay` : "No jobs list pay";
  const meets = target != null && row.salaryMid != null && row.salaryMid >= target;
  return (
    <>
      {SALARY_COLUMNS.map((c) =>
        c.key === "salaryMid" && meets ? (
          <TableCell key={c.key} title={`${title}. At or above your ${k(target)} target`} className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
            <span className="inline-flex items-center gap-1"><Target className="size-3.5" aria-label="Meets salary target" />{money(row[c.key])}</span>
          </TableCell>
        ) : (
          <TableCell key={c.key} title={title} className={cn("text-right whitespace-nowrap", dim)}>{money(row[c.key])}</TableCell>
        ),
      )}
    </>
  );
}

// Interview rate, dimmed on small samples. Marked when it beats the overall rate on enough applications to mean something.
export function RateCell({ rate, applications, average }: { rate: number | null; applications: number; average: number | null }) {
  const small = applications < MIN_SAMPLE;
  const above = !small && rate != null && average != null && rate > average;
  return above ? (
    <TableCell title={`Above your ${average}% average`} className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
      <span className="inline-flex items-center gap-1"><TrendingUp className="size-3.5" aria-label="Above average interview rate" />{fmtPct(rate)}</span>
    </TableCell>
  ) : (
    <TableCell className={cn("text-right", small && "text-muted-foreground")}>{fmtPct(rate)}</TableCell>
  );
}

export const newestFirst = (jobs: Job[]) => [...jobs].sort((a, b) => (b.applied_date ?? "").localeCompare(a.applied_date ?? ""));

// The jobs inside an expanded segment row. `extra` adds columns before the status, e.g. the review tabs' label picker.
export function SegmentJobList({ items, extra }: { items: { job: Job; rolledUp?: boolean }[]; extra?: (job: Job) => ReactNode }) {
  const navigate = useNavigate();
  return (
    <ul className="text-sm">
      {items.map(({ job: j, rolledUp }) => (
        <li
          key={j.id}
          className="-mx-2 flex cursor-pointer items-center gap-3 rounded px-2 py-1 hover:bg-muted/60"
          {...rowLink(navigate, `/jobs/${j.id}`)}
        >
          <span className={cn("min-w-0 flex-1 truncate", rolledUp && "text-muted-foreground")}>
            {j.title}
            {j.normalized_title && <span className="ml-2 text-xs text-muted-foreground">→ {j.normalized_title}</span>}
            {rolledUp && <span className="ml-2 text-xs text-muted-foreground">rolled up</span>}
          </span>
          <span className="w-48 truncate text-muted-foreground">{j.company}</span>
          <span className="w-24 whitespace-nowrap text-muted-foreground">{formatDate(j.applied_date)}</span>
          {extra?.(j)}
          <span className="w-44 text-right"><StatusBadge job={j} /></span>
        </li>
      ))}
    </ul>
  );
}
