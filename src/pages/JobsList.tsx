import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { rowLink } from "@/lib/rowLink";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, DollarSign, ListFilter, Plus, Rows2, Rows4, Search, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_COLORS } from "@/lib/colors";
import { AddJobButton } from "@/components/AddJobButton";
import { MissingDataDialog } from "@/components/MissingDataDialog";
import { StatusHistoryTermsLink } from "@/components/StatusHistoryTerms";
import { isMissing, missingField } from "@/lib/missing";
import { type PaletteAction, jobActions, usePalette, usePaletteActions } from "@/components/CommandPalette";
import { type HotkeyAction, SEARCH_INPUT_ID } from "@/hooks/appActions";
import { type Job, type JobListView, type Profile, type StarKind, useJobs, useProfile, useResumes, useStarredGroups, useUpdateJob, useUpdateProfile } from "@/lib/api";
import { resolveCompanyType, resolveJobTypes, typeNames, type FactContext } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { COMPANY_TYPE_PARAM, STAR_FILTERS, STAR_PARAMS } from "@/lib/jobFilters";
import { jobGroupKeys } from "@/lib/titles/starred";
import type { TitleInfo } from "@/lib/titles/types";
import { loadSelected, saveOrder, saveSelected } from "@/lib/listOrder";
import { isEditable, overlayOpen, useHotkey } from "@/hooks/hotkeys";
import { daysSince, formatDate, isOnHold } from "@/lib/format";
import { isActive, isApplication, isGoingCold, isInterviewing, isRecentlyUpdated, isScheduledDue, isWarmLead, needsFollowUp, progressParts } from "@/lib/jobs";
import { interviewed } from "@/lib/stats";
import { FITS, STALE_DAYS, STATUSES } from "@/lib/options";
import { formatSalary, k } from "@/lib/salary";
import {
  annualPackage, baseSortValue, BENEFITS, benefitsSummary, bonusOn, changeFrom, EQUITY_TYPES, hasExtras, hasPayData, matchOn, paidDaysOff,
  type TargetFit, targetFit,
} from "@/lib/compensation";
import { FIT_TEXT, TargetBar } from "@/components/CompensationCard";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { cn } from "@/lib/utils";
import { toastError, toastSaved } from "@/lib/demo";

const GROUP_FILTERS: Record<string, (job: Job) => boolean> = {
  active: isActive,
  interviewing: isInterviewing,
  // Everything that ever got to an interview, rejected or ghosted included. Unlike the other status options, not a literal status match.
  Interviewed: (j) => isApplication(j) && interviewed(j),
  followup: needsFollowUp,
  closed: (j) => isApplication(j) && !isActive(j),
  cold: isGoingCold,
  warm: isWarmLead,
  recent: isRecentlyUpdated,
};

// Smart filters: the dropdown's second group, below the core presets.
const SMART_FILTERS: [string, string][] = [
  ["cold", "Going Cold"],
  ["warm", "Warm Leads"],
  ["recent", "Recently Updated"],
];

const Dash = () => <span className="text-muted-foreground">—</span>;

const dateCell = (key: keyof Job): ColumnDef<Job> => ({
  accessorKey: key,
  sortUndefined: "last",
  cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string | null)}</span>,
});

const textCell = (id: string, header: string, value: (job: Job) => string): ColumnDef<Job> => ({
  id,
  accessorFn: value,
  header,
  sortUndefined: "last",
  cell: ({ getValue }) => {
    const v = getValue() as string;
    return v ? <span className="block max-w-[7rem] truncate sm:max-w-[160px]" title={v}>{v}</span> : <Dash />;
  },
});

// A two-line cell: the main value with a muted detail under it. Sorts by `sort`; blank values sort last.
const stackedCell = (
  id: string,
  header: string,
  sort: (job: Job) => string | number | undefined,
  main: (job: Job) => React.ReactNode,
  detail?: (job: Job) => string,
  width = "max-w-[7rem] sm:max-w-[160px]",
): ColumnDef<Job> => ({
  id,
  accessorFn: (j) => {
    const v = sort(j);
    return v === "" ? undefined : v;
  },
  header,
  sortUndefined: "last",
  cell: ({ row }) => {
    const m = main(row.original);
    const d = detail?.(row.original) ?? "";
    if (m == null || m === "") return d ? <div className={cn("truncate text-xs text-muted-foreground", width)} title={d}>{d}</div> : <Dash />;
    return (
      <div className={width} title={[typeof m === "string" ? m : "", d].filter(Boolean).join(" · ") || undefined}>
        <div className="truncate whitespace-nowrap">{m}</div>
        {d && <div className="truncate text-xs text-muted-foreground">{d}</div>}
      </div>
    );
  },
});

type ListProfile = Pick<Profile, "salary_target" | "past_base_salary" | "past_package" | "past_days_off">;

// Short labels for where the Base Salary Target sits against a job's base range.
const FIT_SHORT: Record<TargetFit["kind"], string> = { within: "In range", above: "Under target", below: "Above target" };
// Higher is better pay against the target: ranges starting above it, then ranges it sits low in, then ranges under it.
const fitScore = (fit: TargetFit) => (fit.kind === "below" ? 200 + fit.pct : fit.kind === "within" ? 200 - fit.pct : -fit.pct);

const packageOf = (j: Job) => {
  const pkg = annualPackage(j);
  return pkg && (pkg.max ?? pkg.min ?? undefined);
};
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}`;
const pctChange = (past: number | null, now: number | undefined) => (past && now != null ? (now - past) / past : undefined);

// Marked when the base range reaches the Base Salary Target: the target sits inside it, or the range starts above it.
function TargetIcon({ job, salaryTarget }: { job: Job; salaryTarget: number | null }) {
  const onTarget = targetFit(job.salary_min, job.salary_max, salaryTarget);
  if (!onTarget || onTarget.kind === "above") return null;
  return (
    <span className="shrink-0" title={onTarget.kind === "within" ? "Salary range includes your target" : "Salary range is above your target"}>
      <Target className="size-3.5 text-white" aria-label="Salary on target" />
    </span>
  );
}

// Title with its markers: the target icon (compact only; Expanded shows it by Pay, Offers has vs Target),
// the Offer pill, and the on-hold pill.
function TitleLine({ job, salaryTarget }: { job: Job; salaryTarget: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="truncate font-medium" title={job.title}>{job.title}</span>
      <TargetIcon job={job} salaryTarget={salaryTarget} />
      {job.comp_source === "offer" && (
        <span className="shrink-0 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[11px] text-emerald-300">Offer</span>
      )}
      {isOnHold(job) && (
        <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground" title="Held out of Follow Up and Ghosted until then">
          Follow up {formatDate(job.follow_up_on)}
        </span>
      )}
    </div>
  );
}

const viaOf = (j: Job) => j.agency_name || (j.applied_via === "Recruiting Agency" ? "recruiter" : "");

const titleColumn = (view: JobListView, profile: ListProfile): ColumnDef<Job> => ({
  accessorKey: "title",
  header: view === "offers" ? "Job" : "Job Title",
  cell: ({ row }) => {
    const job = row.original;
    const detail = view === "expanded" ? [job.fit, job.work_mode].filter(Boolean).join(" · ")
      : view === "offers" ? [job.company, viaOf(job) && `via ${viaOf(job)}`].filter(Boolean).join(" · ")
      : "";
    return (
      <div className="max-w-[11rem] sm:max-w-[22rem]">
        <TitleLine job={job} salaryTarget={view === "compact" ? profile.salary_target : null} />
        {detail && <div className="truncate text-xs text-muted-foreground" title={detail}>{detail}</div>}
      </div>
    );
  },
});

const companyColumn = (expanded: boolean, ctx: FactContext): ColumnDef<Job> => ({
  accessorKey: "company",
  header: "Company",
  cell: ({ row }) => {
    const { company } = row.original;
    const via = viaOf(row.original);
    const name = company || (via && <span className="text-muted-foreground italic">Unknown</span>);
    const tooltip = [company, via && `via ${via}`].filter(Boolean).join(" · ");
    if (expanded) {
      const detail = [resolveCompanyType(row.original, ctx).value, via && `via ${via}`].filter(Boolean).join(" · ");
      return (
        <div className="max-w-[8rem] sm:max-w-[200px]" title={[company, detail].filter(Boolean).join(" · ")}>
          <div className="truncate">{name || <Dash />}</div>
          {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
        </div>
      );
    }
    return (
      <span className="block max-w-[8rem] truncate sm:max-w-[200px]" title={tooltip}>
        {name}
        {via && <span className="text-muted-foreground"> · via {via}</span>}
      </span>
    );
  },
});

const daysSinceColumn: ColumnDef<Job> = {
  id: "days_since",
  header: "Days Since",
  accessorFn: (j) => daysSince(j.last_activity ?? j.applied_date) ?? undefined,
  sortUndefined: "last",
  cell: ({ getValue }) => <span className="whitespace-nowrap">{(() => {
    const days = getValue() as number | undefined;
    return days === undefined ? "—" : `${days} ${days === 1 ? "day" : "days"}`;
  })()}</span>,
};

// Interviews and screens so far. Stacked on two lines in Expanded and Offers; Compact shows one combined "N interviews" count so its rows stay single-line.
const progressColumn = (stacked: boolean) => stackedCell(
  "progress", "Progress",
  (j) => (stacked ? j.interview_count * 1000 + j.screen_count : j.interview_count + j.screen_count),
  (j) => {
    if (stacked) return progressParts(j)[0] ?? "";
    const n = j.interview_count + j.screen_count;
    return n ? `${n} ${n === 1 ? "interview" : "interviews"}` : "";
  },
  (j) => (stacked ? progressParts(j)[1] ?? "" : ""),
  "max-w-[9rem] sm:max-w-[200px]",
);

// Expanded view: the facts for comparing roles. Job Type, Company Type, Seniority and Title Group show the same
// values the filters match on, so a filtered list reads the same as its dropdowns.
const expandedColumns = (ctx: FactContext, salaryTarget: number | null): ColumnDef<Job>[] => [
  stackedCell(
    "job_type", "Role",
    (j) => resolveJobTypes(j, ctx).values.join(", "),
    (j) => resolveJobTypes(j, ctx).values.join(", "),
    (j) => [ctx.titles.get(j.id)?.seniority.label, ctx.titles.get(j.id)?.family].filter(Boolean).join(" · "),
    "max-w-[8rem] sm:max-w-[200px]",
  ),
  stackedCell(
    "base", "Pay",
    baseSortValue,
    (j) => {
      const base = formatSalary(j.salary_min, j.salary_max);
      return base && <span className="flex items-center gap-1.5">{base}<TargetIcon job={j} salaryTarget={salaryTarget} /></span>;
    },
    (j) => {
      const pkg = hasExtras(j) ? annualPackage(j) : null;
      return pkg ? `${formatSalary(pkg.min, pkg.max)} package` : "";
    },
  ),
  textCell("resume", "Resume", (j) => j.resume_version),
];

// Offers view: the money side by side. Each column after Job is hidden when no listed job has a value for it (OFFER_EMPTY).
const offerColumns = (profile: ListProfile): ColumnDef<Job>[] => [
  stackedCell("base", "Base", baseSortValue, (j) => formatSalary(j.salary_min, j.salary_max)),
  {
    id: "package",
    header: "Package",
    accessorFn: packageOf,
    sortUndefined: "last",
    cell: ({ row }) => {
      const pkg = annualPackage(row.original);
      if (!pkg) return <Dash />;
      // With nothing beyond base, the package is the base salary: shown muted so listed extras stand out.
      const extras = hasExtras(row.original);
      return (
        <span className={cn("whitespace-nowrap", !extras && "text-muted-foreground")} title={extras ? "Base plus bonus, equity, 401k match, HSA and stipends" : "Base salary only so far"}>
          {formatSalary(pkg.min, pkg.max)}
        </span>
      );
    },
  },
  {
    id: "vs_target",
    header: "vs Target",
    accessorFn: (j) => {
      const fit = targetFit(j.salary_min, j.salary_max, profile.salary_target);
      return fit ? fitScore(fit) : undefined;
    },
    sortUndefined: "last",
    cell: ({ row }) => {
      const fit = targetFit(row.original.salary_min, row.original.salary_max, profile.salary_target);
      if (!fit) return <Dash />;
      return (
        <div className="flex items-center gap-2 whitespace-nowrap" title={FIT_TEXT[fit.kind].detail(fit.pct)}>
          <TargetBar fit={fit} className="w-14" />
          <span className="text-xs text-muted-foreground">{FIT_SHORT[fit.kind]}</span>
        </div>
      );
    },
  },
  stackedCell(
    "vs_past", "vs Past",
    (j) => pctChange(profile.past_base_salary, baseSortValue(j)),
    (j) => changeFrom(profile.past_base_salary, j.salary_min, j.salary_max) ?? "",
    (j) => {
      const pkg = annualPackage(j);
      const change = hasExtras(j) && pkg ? changeFrom(profile.past_package, pkg.min, pkg.max) : null;
      return change ? `package ${change}` : "";
    },
    "max-w-[9rem] sm:max-w-[180px]",
  ),
  stackedCell(
    "bonus", "Bonus",
    (j) => bonusOn(j, baseSortValue(j) ?? 0) || undefined,
    (j) => (j.bonus_amount != null ? k(j.bonus_amount) : j.bonus_pct != null ? `${j.bonus_pct}%` : ""),
    (j) => (j.bonus_amount == null && j.bonus_pct != null && baseSortValue(j) != null ? `${k(Math.round(bonusOn(j, baseSortValue(j)!)))} at top` : ""),
  ),
  stackedCell(
    "equity", "Equity",
    (j) => j.equity_annual ?? undefined,
    (j) => [EQUITY_TYPES.find((t) => t.value === j.equity_type)?.label, j.equity_annual != null && `${k(j.equity_annual)}/yr`].filter(Boolean).join(" · "),
    (j) => (j.equity_vest_years ? `${j.equity_vest_years}-yr vest` : ""),
  ),
  stackedCell(
    "match", "401k",
    (j) => matchOn(j, baseSortValue(j) ?? 0) || undefined,
    (j) => (baseSortValue(j) != null && matchOn(j, 1) > 0 ? k(Math.round(matchOn(j, baseSortValue(j)!))) : ""),
    (j) => (j.match_rate_pct != null ? `${j.match_rate_pct}%${j.match_cap_pct != null ? ` up to ${j.match_cap_pct}%` : ""}` : ""),
  ),
  stackedCell(
    "one_time", "One-time",
    (j) => (j.signing_bonus ?? 0) + (j.relocation ?? 0) || undefined,
    (j) => (j.signing_bonus != null || j.relocation != null ? k((j.signing_bonus ?? 0) + (j.relocation ?? 0)) : ""),
    (j) => [j.signing_bonus != null && "signing", j.relocation != null && "relocation"].filter(Boolean).join(" + "),
  ),
  stackedCell(
    "days_off", "Days Off",
    (j) => {
      const off = paidDaysOff(j);
      return off.unlimited ? 1000 + (off.days ?? 0) : off.days ?? undefined;
    },
    (j) => {
      const off = paidDaysOff(j);
      return off.unlimited ? `Unlimited${off.days ? ` + ${off.days}` : ""}` : off.days != null ? `${off.days} days` : "";
    },
    (j) => {
      const off = paidDaysOff(j);
      return !off.unlimited && off.days != null && profile.past_days_off != null ? `${signed(off.days - profile.past_days_off)} vs past` : "";
    },
  ),
  stackedCell(
    "benefits", "Benefits",
    (j) => benefitsSummary(j).yes || undefined,
    (j) => {
      const b = benefitsSummary(j);
      if (b.yes + b.no === 0) return "";
      const names = BENEFITS.filter((x) => j[x.key] === 1).map((x) => x.label).join(", ");
      return <span title={names || "None offered"}>{b.yes}/{BENEFITS.length}</span>;
    },
    (j) => (j.medical_premium_pct != null ? `${j.medical_premium_pct}% premium paid` : ""),
  ),
  stackedCell(
    "parental", "Parental",
    (j) => j.parental_leave_weeks ?? undefined,
    (j) => (j.parental_leave_weeks != null ? `${j.parental_leave_weeks} wks` : ""),
  ),
  progressColumn(true),
];

// Offers columns that can be empty for a job. A column shows only when at least one listed job has it.
const OFFER_EMPTY: Record<string, (j: Job, profile: ListProfile) => boolean> = {
  base: (j) => j.salary_min == null && j.salary_max == null,
  vs_target: (j, p) => !targetFit(j.salary_min, j.salary_max, p.salary_target),
  vs_past: (j, p) => !changeFrom(p.past_base_salary, j.salary_min, j.salary_max),
  bonus: (j) => j.bonus_amount == null && j.bonus_pct == null,
  equity: (j) => !j.equity_type && j.equity_annual == null,
  match: (j) => j.match_rate_pct == null,
  one_time: (j) => j.signing_bonus == null && j.relocation == null,
  days_off: (j) => paidDaysOff(j).days == null && !j.pto_unlimited,
  benefits: (j) => benefitsSummary(j).yes + benefitsSummary(j).no === 0 && j.medical_premium_pct == null,
  parental: (j) => j.parental_leave_weeks == null,
};

const buildColumns = (view: JobListView, onQuickAdd: (job: Job) => void, ctx: FactContext, profile: ListProfile): ColumnDef<Job>[] => [
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" title="Add history (L)" aria-label={`Add history to ${row.original.title}`} onClick={() => onQuickAdd(row.original)}>
        <Plus />
      </Button>
    ),
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge job={row.original} plain /> },
  titleColumn(view, profile),
  ...(view === "offers"
    ? offerColumns(profile)
    : [
        companyColumn(view === "expanded", ctx),
        ...(view === "expanded" ? expandedColumns(ctx, profile.salary_target) : []),
        { ...dateCell("applied_date"), header: "Applied" },
        daysSinceColumn,
        progressColumn(view === "expanded"),
      ]),
];

// Each view's sort when the URL names none, or names a column the view doesn't have.
const DEFAULT_SORT: Record<JobListView, string> = { compact: "applied_date:desc", expanded: "applied_date:desc", offers: "package:desc" };

// The status chips are views, not filters: with one of them picked and nothing else set, there's nothing to clear.
// The "all" choice on each starred dropdown. Activity keeps its own labels.
const STAR_ALL_LABELS: Record<StarKind, string> = { title: "All Titles", seniority: "All Seniority", type: "All Job Types" };

// Count shown after each dropdown option. Triggers hide it, so the closed dropdown shows only the picked name.
const FacetCount = ({ n }: { n: number }) => <span className="facet-count ml-2 text-muted-foreground">({n})</span>;

// The list search: the text has to appear in the title, company, notes, agency, contact or salary.
const matchesSearch = (j: Job, value: string) => {
  if (!value) return true;
  const haystack = [j.title, j.company, j.notes, j.agency_name, j.contact_name, formatSalary(j.salary_min, j.salary_max)].join(" ").toLowerCase();
  return haystack.includes(value.toLowerCase());
};

// Job Type is filtered through the starred groups only (STAR_PARAMS).
const FILTER_KEYS = ["q", "status", "fit", COMPANY_TYPE_PARAM, "resume", "missing", ...STAR_PARAMS];
const VIEW_STATUSES = new Set(["active", "interviewing", "followup"]);

const VIEW_OPTIONS = [
  { key: "compact", label: <Rows4 className="size-4" />, title: "Compact" },
  { key: "expanded", label: <Rows2 className="size-4" />, title: "Expanded" },
  { key: "offers", label: <DollarSign className="size-4" />, title: "Offers" },
] as const;
const VIEW_NAMES: Record<JobListView, string> = { compact: "Compact", expanded: "Expanded", offers: "Offers" };

export default function JobsList() {
  const { data: jobs = [], isLoading } = useJobs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const location = useLocation();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const view = profile?.job_list_view ?? "compact";
  // Compact view: every column but the last (Days Since) hugs its content; the last absorbs the leftover width.
  const shrink = view === "compact";
  const { logHistory, quickLog } = usePalette();
  const [selectedId, setSelectedId] = useState<number | null>(loadSelected);
  const [showMore, setShowMore] = useState(false);
  const tableWrap = useRef<HTMLDivElement>(null);
  // Title groups and stars come from the Segments page, so the columns and filters read the same groups.
  const { data: stars = [] } = useStarredGroups();
  const factCtx = useFactContext(jobs);
  const listProfile = useMemo<ListProfile>(() => ({
    salary_target: profile?.salary_target ?? null,
    past_base_salary: profile?.past_base_salary ?? null,
    past_package: profile?.past_package ?? null,
    past_days_off: profile?.past_days_off ?? null,
  }), [profile?.salary_target, profile?.past_base_salary, profile?.past_package, profile?.past_days_off]);
  const columns = useMemo(() => buildColumns(view, logHistory, factCtx, listProfile), [view, logHistory, factCtx, listProfile]);

  // Cmd/Ctrl+F from another page lands here with the request in navigation state.
  useEffect(() => {
    if ((location.state as HotkeyAction | null)?.hotkey !== "search") return;
    document.getElementById(SEARCH_INPUT_ID)?.focus();
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate]);

  const search = params.get("q") ?? "";
  const statusFilter = params.get("status") ?? "active";
  const fitFilter = params.get("fit") ?? "all";
  const companyTypeFilter = params.get(COMPANY_TYPE_PARAM) ?? "all";
  const starPicked = STAR_FILTERS.map((f) => params.get(f.param) ?? "all");
  const resumeFilter = params.get("resume") ?? "";
  const missing = missingField(params.get("missing") ?? "");
  const filtersApplied = FILTER_KEYS.some((k) => k !== "status" && params.get(k) && params.get(k) !== "all") || !VIEW_STATUSES.has(statusFilter);
  const clearFilters = () => updateParams((p) => FILTER_KEYS.forEach((k) => p.delete(k)));
  // Missing-data lists cover every job, so picking one resets the other filters.
  const showMissing = (key: string) => updateParams((p) => {
    FILTER_KEYS.forEach((k) => p.delete(k));
    p.set("status", "all");
    p.set("missing", key);
  });
  // A sort on a column this view doesn't have (e.g. Days Since in Offers) falls back to the view's own.
  const sortParam = (() => {
    const sort = params.get("sort");
    const id = sort?.split(":")[0];
    return sort && columns.some((c) => (c.id ?? (c as { accessorKey?: string }).accessorKey) === id) ? sort : DEFAULT_SORT[view];
  })();
  // Memoized: a new array every render makes TanStack Table recompute and re-render in a loop.
  const sorting = useMemo<SortingState>(() => {
    const [id, dir] = sortParam.split(":");
    return [{ id, desc: dir === "desc" }];
  }, [sortParam]);

  const setParam = (key: string, value: string) => updateParams((p) => p.set(key, value));

  // Group keys per job (title, seniority, type), for matching against the starred filters. Stars are read live.
  const jobKeys = useMemo(() => new Map(jobs.map((j) => [j.id, jobGroupKeys(factCtx.titles.get(j.id), resolveJobTypes(j, factCtx).values)])), [jobs, factCtx]);
  // Only starred groups with at least one job are offered.
  const starOptions = useMemo(
    () => STAR_FILTERS.map((f) => stars.filter((s) => s.kind === f.kind && jobs.some((j) => jobKeys.get(j.id)?.[f.kind].includes(s.key)))),
    [stars, jobs, jobKeys],
  );

  // Starred-group dropdown for one kind, hidden until a group of that kind with jobs is starred.
  const renderStar = (kind: StarKind, width: string) => {
    const i = STAR_FILTERS.findIndex((f) => f.kind === kind);
    if (!starOptions[i].length) return null;
    const param = STAR_FILTERS[i].param;
    return (
      <Select value={starPicked[i]} onValueChange={(v) => setParam(param, v)}>
        <SelectTrigger className={cn(width, "bg-card [&_.facet-count]:hidden")}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{STAR_ALL_LABELS[kind]}<FacetCount n={facetCount(param, "all")} /></SelectItem>
          {starOptions[i].map((o) => <SelectItem key={o.key} value={o.key}>{o.label}<FacetCount n={facetCount(param, o.key)} /></SelectItem>)}
        </SelectContent>
      </Select>
    );
  };
  // Filters behind "More Filters": how many are set, so the closed button still shows them.
  const picked = (kind: StarKind) => starPicked[STAR_FILTERS.findIndex((f) => f.kind === kind)];
  const moreApplied = [resumeFilter !== "", fitFilter !== "all", picked("title") !== "all", picked("seniority") !== "all"].filter(Boolean).length;
  // On phones Job Type and Company Type also sit behind More Filters.
  const moreAppliedMobile = moreApplied + [picked("type") !== "all", companyTypeFilter !== "all"].filter(Boolean).length;

  // Each filter's test for one job, keyed by its URL param. "all" (or no resume) matches every job.
  const facetTest: Record<string, (j: Job, v: string) => boolean> = {
    status: (j, v) => GROUP_FILTERS[v]?.(j) || (v === "followup" && isOnHold(j)) || (!GROUP_FILTERS[v] && (v === "all" || j.status === v)),
    fit: (j, v) => v === "all" || j.fit === v,
    [COMPANY_TYPE_PARAM]: (j, v) => v === "all" || resolveCompanyType(j, factCtx).value === v,
    resume: (j, v) => !v || v === "all" || j.resume_version === v,
    ...Object.fromEntries(STAR_FILTERS.map((f) => [f.param, (j: Job, v: string) => v === "all" || !!jobKeys.get(j.id)?.[f.kind].includes(v)])),
  };
  const selection: Record<string, string> = {
    status: statusFilter, fit: fitFilter, [COMPANY_TYPE_PARAM]: companyTypeFilter, resume: resumeFilter,
    ...Object.fromEntries(STAR_FILTERS.map((f, i) => [f.param, starPicked[i]])),
  };
  const facetKeys = Object.keys(facetTest);
  // A job passes when every filter matches it, except the one named by `skip`, and the missing-data list if one is picked.
  const passes = (j: Job, skip?: string) => facetKeys.every((k) => k === skip || facetTest[k](j, selection[k])) && (!missing || isMissing(j, missing, factCtx));

  const matched = useMemo(
    () => jobs.filter((j) => passes(j)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, statusFilter, fitFilter, companyTypeFilter, resumeFilter, missing, jobKeys, factCtx, starPicked.join("|")],
  );
  // The Offers view lists only jobs with pay figures to compare.
  const filtered = useMemo(() => (view === "offers" ? matched.filter(hasPayData) : matched), [view, matched]);
  const noPayHidden = matched.length - filtered.length;
  // Offers columns with nothing to show for any listed job are hidden.
  const columnVisibility = useMemo(
    () => view === "offers"
      ? Object.fromEntries(Object.entries(OFFER_EMPTY).map(([id, empty]) => [id, filtered.some((j) => !empty(j, listProfile))]))
      : {},
    [view, filtered, listProfile],
  );

  // Jobs that match the search and every filter except the one being counted. Each dropdown option's count is how many
  // jobs it would show with the other filters applied, so it moves as other filters are picked.
  const facetBase = useMemo(
    () => Object.fromEntries(facetKeys.map((k) => [k, jobs.filter((j) => matchesSearch(j, search) && (view !== "offers" || hasPayData(j)) && passes(j, k))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, view, search, statusFilter, fitFilter, companyTypeFilter, resumeFilter, missing, jobKeys, starPicked.join("|")],
  );
  const facetCount = (key: string, value: string) => facetBase[key].filter((j: Job) => facetTest[key](j, value)).length;

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter: search, columnVisibility },
    onSortingChange: (updater) => {
      const [next] = typeof updater === "function" ? updater(sorting) : updater;
      setParam("sort", next ? `${next.id}:${next.desc ? "desc" : "asc"}` : DEFAULT_SORT[view]);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetPageIndex: false,
    globalFilterFn: (row, _columnId, value: string) => matchesSearch(row.original, value),
  });

  // Offers lists only jobs with pay figures, so its counts do too.
  const countable = view === "offers" ? jobs.filter(hasPayData) : jobs;
  const counts = {
    active: countable.filter(GROUP_FILTERS.active).length,
    interviewing: countable.filter(GROUP_FILTERS.interviewing).length,
    followup: countable.filter(GROUP_FILTERS.followup).length,
  };
  const chips: [keyof typeof counts, string][] = [
    ["active", "Active"],
    ["interviewing", "Interviewing"],
    ["followup", "Follow Up"],
  ];

  const allRows = table.getRowModel().rows;
  // In the Follow Up view, jobs with a future follow-up date sit in their own group at the end.
  const splitScheduled = statusFilter === "followup";
  const rows = splitScheduled
    ? [
        ...allRows.filter((r) => isScheduledDue(r.original)),
        ...allRows.filter((r) => !isOnHold(r.original) && !isScheduledDue(r.original)),
        ...allRows.filter((r) => isOnHold(r.original)),
      ]
    : allRows;
  const firstScheduled = splitScheduled ? rows.findIndex((r) => isOnHold(r.original)) : -1;
  // Rows remount (replaying the enter animation) when filters or sort change; search changes keep
  // existing rows in place so only newly matching rows animate in.
  const viewKey = [statusFilter, fitFilter, companyTypeFilter, resumeFilter, missing?.key, sortParam, ...starPicked].join("|");

  // Up/Down (or K/J) move the selected row; Enter (or O) opens it and L logs history on it. Only from the page itself or the table, so
  // arrows still work inside the filter dropdowns and search box.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || overlayOpen() || isEditable(e.target)) return;
      if (e.target !== document.body && !tableWrap.current?.contains(e.target as Node)) return;
      const at = rows.findIndex((r) => r.original.id === selectedId);
      const key = e.key.toLowerCase();
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || key === "j" || key === "k") {
        if (!rows.length) return;
        e.preventDefault();
        const down = e.key === "ArrowDown" || key === "j";
        // Based on the previous selection, so quick repeated presses between renders still add up.
        setSelectedId((prev) => {
          const from = rows.findIndex((r) => r.original.id === prev);
          const next = from < 0 ? (down ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, from + (down ? 1 : -1)));
          return rows[next].original.id;
        });
      } else if (e.key === "Enter" || key === "o") {
        // Enter only from the page itself or a row, so it still presses a focused button.
        if (at < 0 || (e.key === "Enter" && !(e.target === document.body || (e.target as HTMLElement).tagName === "TR"))) return;
        e.preventDefault();
        navigate(`/jobs/${selectedId}`, { state: { fromList: true } });
      } else if (key === "l" && !e.repeat && at >= 0) {
        e.preventDefault();
        logHistory(rows[at].original);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, selectedId, logHistory]);

  const selected = rows.find((r) => r.original.id === selectedId)?.original;
  const updateSelected = useUpdateJob(selected?.id ?? 0);
  const { data: resumes = [] } = useResumes();

  // Job pages step through this order with J and K.
  const orderKey = rows.map((r) => r.original.id).join(",");
  useEffect(() => saveOrder(orderKey ? orderKey.split(",").map(Number) : []), [orderKey]);

  const choose = (param: string, options: readonly string[], allLabel: string, allValue = "all"): PaletteAction[] => [
    { id: `${param}-all`, label: allLabel, group: "", run: () => setParam(param, allValue) },
    ...options.map((o) => ({ id: `${param}-${o}`, label: o, group: "", run: () => setParam(param, o) })),
  ];
  const sortIds = new Set(table.getVisibleLeafColumns().map((c) => c.id));
  usePaletteActions([
    ...(selected ? [
      { id: "open", label: "Open selected job", group: "Selected job", keys: ["Enter"], run: () => navigate(`/jobs/${selected.id}`, { state: { fromList: true } }) },
      ...jobActions(selected, {
        logHistory,
        quickLog,
        group: "Selected job",
        withGeneric: true,
        setFollowUp: (date) => updateSelected.mutate({ follow_up_on: date }, {
          onSuccess: () => toastSaved(date ? `Follow-up scheduled for ${formatDate(date)}` : "Follow-up date cleared"),
          onError: (err) => toastError(err),
        }),
      }),
    ] : []),
    { id: "f-status", label: "Filter by status…", group: "Jobs list", keywords: "show active interviewing follow up closed all going cold warm leads referral recently updated", choices: [
      { id: "s-all", label: "All", group: "", run: () => setParam("status", "all") },
      { id: "s-active", label: "Active", group: "", run: () => setParam("status", "active") },
      { id: "s-interviewing", label: "Interviewing", group: "", run: () => setParam("status", "interviewing") },
      { id: "s-followup", label: "Follow Up", group: "", run: () => setParam("status", "followup") },
      { id: "s-closed", label: "Closed", group: "", run: () => setParam("status", "closed") },
      ...SMART_FILTERS.map(([key, label]) => ({ id: `s-${key}`, label, group: "", run: () => setParam("status", key) })),
      ...STATUSES.map((st) => ({ id: `s-${st}`, label: st, group: "", run: () => setParam("status", st) })),
    ] },
    { id: "f-fit", label: "Filter by fit…", group: "Jobs list", choices: choose("fit", FITS, "All fits") },
    { id: "f-company", label: "Filter by company type…", group: "Jobs list", choices: choose("company_type", typeNames(factCtx, "company"), "All company types") },
    { id: "f-resume", label: "Filter by resume…", group: "Jobs list", choices: choose("resume", resumes.map((r) => r.version), "Any resume", "") },
    // Only sorts on columns the current view shows.
    { id: "sort", label: "Sort by…", group: "Jobs list", keywords: "order", choices: ([
      ["Applied, newest first", "applied_date:desc"], ["Applied, oldest first", "applied_date:asc"],
      ["Quietest first (days since activity)", "days_since:desc"], ["Most recent activity", "days_since:asc"],
      ["Package, highest first", "package:desc"], ["Base, highest first", "base:desc"],
      ["Job title A–Z", "title:asc"], ["Company A–Z", "company:asc"], ["Status", "status:asc"],
    ] as [string, string][]).filter(([, value]) => sortIds.has(value.split(":")[0]))
      .map(([label, value]) => ({ id: `sort-${value}`, label, group: "", run: () => setParam("sort", value) })) },
    { id: "clear", label: "Clear search and filters", group: "Jobs list", keys: ["Esc"], run: clearFilters },
    ...VIEW_OPTIONS.filter((o) => o.key !== view).map((o) => ({
      id: `view-${o.key}`, label: `Switch to ${VIEW_NAMES[o.key]} view`, group: "Jobs list", run: () => updateProfile.mutate({ job_list_view: o.key }),
    })),
  ]);

  useEffect(() => saveSelected(selectedId), [selectedId]);

  // Cmd/Ctrl+F replaces the browser's find with the list search, on this page only.
  useHotkey("f", (e) => {
    if (overlayOpen()) return;
    e.preventDefault();
    const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, { mod: true });

  // Esc also deselects the row (alongside GlobalHotkeys clearing filters), unless it's closing something or leaving a field.
  useHotkey("Escape", (e) => {
    if (!isEditable(e.target) && !overlayOpen()) setSelectedId(null);
  });

  // A selection that filters have hidden (e.g. Esc clearing them) is dropped, so it can't linger unseen.
  useEffect(() => {
    if (selectedId !== null && jobs.length && !rows.some((r) => r.original.id === selectedId)) setSelectedId(null);
  }, [rows, selectedId, jobs.length]);

  const hasRows = rows.length > 0;
  useEffect(() => {
    if (selectedId !== null) tableWrap.current?.querySelector(`[data-job-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, hasRows]);

  // Job count and view toggle at the end of the first filter row.
  const listMeta = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {filtersApplied && (
          <>
            <button onClick={clearFilters} className="underline-offset-4 hover:text-foreground hover:underline">
              Clear<span className="max-sm:hidden"> Filters</span>
            </button>
            <span aria-hidden className="max-sm:hidden">·</span>
          </>
        )}
        <span><span className="sm:hidden">({rows.length})</span><span className="max-sm:hidden">{rows.length} Jobs</span></span>
        {view === "offers" && noPayHidden > 0 && (
          <span className="max-sm:hidden" title="The Offers view lists only jobs with a salary or other pay figures">· {noPayHidden} without pay hidden</span>
        )}
      </div>
      <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => updateProfile.mutate({ job_list_view: v })} />
    </>
  );

  return (
    <div className="space-y-4">
      <title>{`${statusFilter === "followup" ? "Follow Up" : "Jobs"} | Application Tracker`}</title>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-full sm:max-w-sm sm:flex-none">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            id={SEARCH_INPUT_ID}
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              // Starting a search resets the view to "All" with no other filters.
              updateParams((p) => {
                if (!search && value) {
                  p.set("status", "all");
                }
                p.set("q", value);
              });
            }}
            placeholder="Search title, company, notes…"
            className="bg-card pl-8"
          />
        </div>
        <div className="contents max-sm:hidden">
        {chips.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setParam("status", key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              statusFilter === key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              key === "followup" && counts.followup > 0 && statusFilter !== key && "border-amber-500/40 text-amber-300",
            )}
          >
            {label} <span className="ml-1 opacity-70">{counts[key]}</span>
          </button>
        ))}
        </div>
        <div className="sm:ml-auto">
          <AddJobButton />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger className="w-32 bg-card sm:w-52 [&_.status-dot]:hidden [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All<FacetCount n={facetCount("status", "all")} /></SelectItem>
              {chips.map(([key, label]) => <SelectItem key={key} value={key}>{label}<FacetCount n={facetCount("status", key)} /></SelectItem>)}
              <SelectItem value="closed">Closed<FacetCount n={facetCount("status", "closed")} /></SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Smart filters</SelectLabel>
                {SMART_FILTERS.map(([key, label]) => <SelectItem key={key} value={key}>{label}<FacetCount n={facetCount("status", key)} /></SelectItem>)}
              </SelectGroup>
              <SelectSeparator />
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={cn("status-dot mr-2 inline-block size-2.5 rounded-full align-middle", STATUS_COLORS[s]?.dot)} />
                  {s}
                  <FacetCount n={facetCount("status", s)} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderStar("type", cn("w-[calc(50%-0.25rem)] max-sm:order-1 sm:w-52", !showMore && "max-sm:hidden"))}
          <Select value={companyTypeFilter} onValueChange={(v) => setParam("company_type", v)}>
            <SelectTrigger className={cn("w-[calc(50%-0.25rem)] bg-card max-sm:order-1 sm:w-48 [&_.facet-count]:hidden", !showMore && "max-sm:hidden")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All company types<FacetCount n={facetCount(COMPANY_TYPE_PARAM, "all")} /></SelectItem>
              {typeNames(factCtx, "company").map((t) => <SelectItem key={t} value={t}>{t}<FacetCount n={facetCount(COMPANY_TYPE_PARAM, t)} /></SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} aria-label="More Filters" className="relative max-sm:px-2">
            <ListFilter className="sm:hidden" />
            <span className="max-sm:hidden">More Filters</span>
            {moreApplied > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground max-sm:hidden">{moreApplied}</span>}
            {moreAppliedMobile > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground sm:hidden">{moreAppliedMobile}</span>}
            <ChevronDown className={cn("transition-transform max-sm:hidden", showMore && "rotate-180")} />
          </Button>
          {resumeFilter && (
            <button
              onClick={() => updateParams((p) => p.delete("resume"))}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent"
              title="Clear resume filter"
            >
              Resume: {resumeFilter} <X className="size-3.5" />
            </button>
          )}
          {missing && (
            <button
              onClick={() => updateParams((p) => p.delete("missing"))}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent"
              title="Clear missing data filter"
            >
              Missing: {missing.label} <X className="size-3.5" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">{listMeta}</div>
        </div>
        {showMore && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={resumeFilter || "all"}
              onValueChange={(v) => updateParams((p) => {
                if (v === "all") p.delete("resume");
                else p.set("resume", v);
              })}
            >
              <SelectTrigger className="w-[calc(50%-0.25rem)] bg-card sm:w-52 [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any resume<FacetCount n={facetCount("resume", "all")} /></SelectItem>
                {resumes.map((r) => <SelectItem key={r.version} value={r.version}>{r.version}<FacetCount n={facetCount("resume", r.version)} /></SelectItem>)}
              </SelectContent>
            </Select>
            {renderStar("seniority", "w-[calc(50%-0.25rem)] sm:w-52")}
            {renderStar("title", "w-[calc(50%-0.25rem)] sm:w-52")}
            <Select value={fitFilter} onValueChange={(v) => setParam("fit", v)}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] bg-card sm:w-40 [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fits<FacetCount n={facetCount("fit", "all")} /></SelectItem>
                {FITS.map((f) => <SelectItem key={f} value={f}>{f}<FacetCount n={facetCount("fit", f)} /></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div ref={tableWrap} className="table-bleed overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header, idx) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn("cursor-pointer select-none whitespace-nowrap", shrink && idx < hg.headers.length - 1 && "w-px")}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" && <ArrowUp className="size-3.5" />}
                        {sorted === "desc" && <ArrowDown className="size-3.5" />}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <Fragment key={`${viewKey}:${row.id}`}>
                {i === firstScheduled && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={table.getVisibleLeafColumns().length} className="bg-muted/50 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Scheduled Follow Up
                    </TableCell>
                  </TableRow>
                )}
              <TableRow
                data-job-id={row.original.id}
                data-selected={row.original.id === selectedId || undefined}
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                {...rowLink(navigate, `/jobs/${row.original.id}`, { fromList: true }, () => setSelectedId(row.original.id))}
                className={cn(
                  "row-in cursor-pointer data-[selected]:bg-accent data-[selected]:outline data-[selected]:-outline-offset-1 data-[selected]:outline-ring",
                  needsFollowUp(row.original) && "bg-amber-500/10 hover:bg-amber-500/15 data-[selected]:bg-amber-500/25",
                )}
                title={needsFollowUp(row.original) ? `No activity in ${STALE_DAYS}+ days` : undefined}
              >
                {row.getVisibleCells().map((cell, idx, cells) =>
                  cell.column.id === "actions" ? (
                    // The dialog is portaled but its events still bubble through React to the row link.
                    <TableCell
                      key={cell.id}
                      className="w-px"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onAuxClick={(e) => e.stopPropagation()}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ) : (
                    <TableCell key={cell.id} className={cn(shrink && idx < cells.length - 1 && "w-px")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ),
                )}
              </TableRow>
              </Fragment>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="py-10 text-center text-muted-foreground">
                  {isLoading ? "Loading…" : "No jobs match."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <MissingDataDialog jobs={jobs} factCtx={factCtx} value={missing?.key ?? ""} onPick={showMissing} />
          <StatusHistoryTermsLink />
        </div>
        <Link to="/trash" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Trash2 className="size-4" /> Trash
        </Link>
      </div>
    </div>
  );
}
