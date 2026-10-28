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
import { ArrowDown, ArrowUp, ChevronDown, Plus, Rows2, Rows4, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_COLORS } from "@/lib/colors";
import { AddJobDialog } from "@/components/AddJobDialog";
import { MissingDataDialog } from "@/components/MissingDataDialog";
import { isMissing, missingField } from "@/lib/missing";
import { type PaletteAction, jobActions, usePalette, usePaletteActions } from "@/components/CommandPalette";
import { type HotkeyAction, SEARCH_INPUT_ID } from "@/hooks/appActions";
import { type Job, type StarKind, useJobs, useProfile, useResumes, useStarredGroups, useUpdateJob, useUpdateProfile } from "@/lib/api";
import { resolveCompanyType, resolveJobTypes, typeNames, type FactContext } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { COMPANY_TYPE_PARAM, STAR_FILTERS, STAR_PARAMS } from "@/lib/jobFilters";
import { jobGroupKeys } from "@/lib/titles/starred";
import type { TitleInfo } from "@/lib/titles/types";
import { loadSelected, saveOrder, saveSelected } from "@/lib/listOrder";
import { isEditable, overlayOpen, useHotkey } from "@/hooks/hotkeys";
import { daysSince, formatDate, isOnHold } from "@/lib/format";
import { isActive, needsFollowUp, reachedInterview } from "@/lib/jobs";
import { toast } from "sonner";
import { FITS, INTERVIEWING_STATUSES, STALE_DAYS, STATUSES } from "@/lib/options";
import { formatSalary } from "@/lib/salary";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { cn } from "@/lib/utils";

const GROUP_FILTERS: Record<string, (job: Job) => boolean> = {
  active: isActive,
  // Timed-out (auto-ghosted) jobs that reached an interview still count; a manually logged close-out does not.
  interviewing: (j) => INTERVIEWING_STATUSES.has(j.status) || (j.auto_ghosted && reachedInterview(j)),
  followup: needsFollowUp,
  closed: (j) => !isActive(j),
};

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
    return v ? <span className="block max-w-[160px] truncate" title={v}>{v}</span> : <span className="text-muted-foreground">—</span>;
  },
});

const buildColumns = (expanded: boolean, onQuickAdd: (job: Job) => void, ctx: FactContext): ColumnDef<Job>[] => [
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
  {
    accessorKey: "title",
    header: "Job Title",
    cell: ({ row }) => {
      const { title, fit, salary_min, salary_max } = row.original;
      const detail = expanded ? [fit, formatSalary(salary_min, salary_max)].filter(Boolean).join(" · ") : "";
      return (
        <div className="max-w-[22rem]">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium" title={title}>{title}</span>
            {isOnHold(row.original) && (
              <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground" title="Held out of Follow Up and Ghosted until then">
                Follow up {formatDate(row.original.follow_up_on)}
              </span>
            )}
          </div>
          {detail && <div className="truncate text-xs text-muted-foreground" title={detail}>{detail}</div>}
        </div>
      );
    },
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => {
      const { company, agency_name, applied_via } = row.original;
      const via = agency_name || (applied_via === "Recruiting Agency" ? "recruiter" : "");
      const name = company || (via && <span className="text-muted-foreground italic">Unknown</span>);
      const tooltip = [company, via && `via ${via}`].filter(Boolean).join(" · ");
      if (expanded) {
        return (
          <div className="max-w-[200px]" title={tooltip}>
            <div className="truncate">{name}</div>
            {via && <div className="truncate text-xs text-muted-foreground">via {via}</div>}
          </div>
        );
      }
      return (
        <span className="block max-w-[200px] truncate" title={tooltip}>
          {name}
          {via && <span className="text-muted-foreground"> · via {via}</span>}
        </span>
      );
    },
  },
  // Expanded view shows the same values the filters match on, so a filtered list reads the same as its dropdowns.
  ...(expanded
    ? [
        textCell("job_type", "Job Type", (j) => resolveJobTypes(j, ctx).values.join(", ")),
        textCell("company_type", "Company Type", (j) => resolveCompanyType(j, ctx).value),
        textCell("resume", "Resume", (j) => j.resume_version),
        textCell("seniority", "Seniority", (j) => ctx.titles.get(j.id)?.seniority.label ?? ""),
        textCell("title_group", "Title Group", (j) => ctx.titles.get(j.id)?.family ?? ""),
      ]
    : []),
  ...(expanded
    ? [{
        accessorKey: "interview_count",
        header: "Interviews",
        cell: ({ getValue }) => {
          const n = getValue() as number;
          return n > 0 ? <span className="whitespace-nowrap">{n}</span> : <span className="text-muted-foreground">—</span>;
        },
      } satisfies ColumnDef<Job>]
    : []),
  { ...dateCell("applied_date"), header: "Applied" },
  { ...dateCell("latest_update"), header: "Update" },
  {
    id: "days_since",
    header: "Days Since",
    accessorFn: (j) => daysSince(j.last_activity ?? j.applied_date) ?? undefined,
    sortUndefined: "last",
    cell: ({ getValue }) => <span className="whitespace-nowrap">{(() => {
      const days = getValue() as number | undefined;
      return days === undefined ? "—" : `${days} ${days === 1 ? "day" : "days"}`;
    })()}</span>,
  },
];

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
] as const;

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
  const { logHistory } = usePalette();
  const [selectedId, setSelectedId] = useState<number | null>(loadSelected);
  const [showMore, setShowMore] = useState(false);
  const tableWrap = useRef<HTMLDivElement>(null);
  // Title groups and stars come from the Job Titles page, so the columns and filters read the same groups.
  const { data: stars = [] } = useStarredGroups();
  const factCtx = useFactContext(jobs);
  const columns = useMemo(() => buildColumns(view === "expanded", logHistory, factCtx), [view, logHistory, factCtx]);

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
  const sortParam = params.get("sort") ?? "applied_date:desc";
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

  const filtered = useMemo(
    () => jobs.filter((j) => passes(j)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, statusFilter, fitFilter, companyTypeFilter, resumeFilter, missing, jobKeys, factCtx, starPicked.join("|")],
  );

  // Jobs that match the search and every filter except the one being counted. Each dropdown option's count is how many
  // jobs it would show with the other filters applied, so it moves as other filters are picked.
  const facetBase = useMemo(
    () => Object.fromEntries(facetKeys.map((k) => [k, jobs.filter((j) => matchesSearch(j, search) && passes(j, k))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, search, statusFilter, fitFilter, companyTypeFilter, resumeFilter, missing, jobKeys, starPicked.join("|")],
  );
  const facetCount = (key: string, value: string) => facetBase[key].filter((j: Job) => facetTest[key](j, value)).length;

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: (updater) => {
      const [next] = typeof updater === "function" ? updater(sorting) : updater;
      setParam("sort", next ? `${next.id}:${next.desc ? "desc" : "asc"}` : "applied_date:desc");
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetPageIndex: false,
    globalFilterFn: (row, _columnId, value: string) => matchesSearch(row.original, value),
  });

  const counts = {
    active: jobs.filter(GROUP_FILTERS.active).length,
    interviewing: jobs.filter(GROUP_FILTERS.interviewing).length,
    followup: jobs.filter(GROUP_FILTERS.followup).length,
  };
  const chips: [keyof typeof counts, string][] = [
    ["active", "Active"],
    ["interviewing", "Interviewing"],
    ["followup", "Follow Up"],
  ];

  const allRows = table.getRowModel().rows;
  // In the Follow Up view, jobs with a future follow-up date sit in their own group at the end.
  const splitScheduled = statusFilter === "followup";
  const rows = splitScheduled ? [...allRows.filter((r) => !isOnHold(r.original)), ...allRows.filter((r) => isOnHold(r.original))] : allRows;
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
  const view2 = view === "compact" ? "expanded" : "compact";
  usePaletteActions([
    ...(selected ? [
      { id: "open", label: "Open selected job", group: "Selected job", keys: ["Enter"], run: () => navigate(`/jobs/${selected.id}`, { state: { fromList: true } }) },
      ...jobActions(selected, {
        logHistory,
        group: "Selected job",
        withGeneric: true,
        setFollowUp: (date) => updateSelected.mutate({ follow_up_on: date }, {
          onSuccess: () => toast.success(date ? `Follow-up scheduled for ${formatDate(date)}` : "Follow-up date cleared"),
          onError: (err) => toast.error(err.message),
        }),
      }),
    ] : []),
    { id: "f-status", label: "Filter by status…", group: "Jobs list", keywords: "show active interviewing follow up closed all", choices: [
      { id: "s-all", label: "All", group: "", run: () => setParam("status", "all") },
      { id: "s-active", label: "Active", group: "", run: () => setParam("status", "active") },
      { id: "s-interviewing", label: "Interviewing", group: "", run: () => setParam("status", "interviewing") },
      { id: "s-followup", label: "Follow Up", group: "", run: () => setParam("status", "followup") },
      { id: "s-closed", label: "Closed", group: "", run: () => setParam("status", "closed") },
      ...STATUSES.map((st) => ({ id: `s-${st}`, label: st, group: "", run: () => setParam("status", st) })),
    ] },
    { id: "f-fit", label: "Filter by fit…", group: "Jobs list", choices: choose("fit", FITS, "All fits") },
    { id: "f-company", label: "Filter by company type…", group: "Jobs list", choices: choose("company_type", typeNames(factCtx, "company"), "All company types") },
    { id: "f-resume", label: "Filter by resume…", group: "Jobs list", choices: choose("resume", resumes.map((r) => r.version), "Any resume", "") },
    { id: "sort", label: "Sort by…", group: "Jobs list", keywords: "order", choices: ([
      ["Applied, newest first", "applied_date:desc"], ["Applied, oldest first", "applied_date:asc"],
      ["Quietest first (days since activity)", "days_since:desc"], ["Most recent activity", "days_since:asc"],
      ["Latest update", "latest_update:desc"], ["Job title A–Z", "title:asc"], ["Company A–Z", "company:asc"], ["Status", "status:asc"],
    ] as [string, string][]).map(([label, value]) => ({ id: `sort-${value}`, label, group: "", run: () => setParam("sort", value) })) },
    { id: "clear", label: "Clear search and filters", group: "Jobs list", keys: ["Esc"], run: clearFilters },
    { id: "view", label: `Switch to ${view2} view`, group: "Jobs list", run: () => updateProfile.mutate({ job_list_view: view2 }) },
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

  return (
    <div className="space-y-4">
      <title>{`${statusFilter === "followup" ? "Follow Up" : "Jobs"} | Application Tracker`}</title>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
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
        <div className="ml-auto">
          <AddJobDialog />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger className="w-52 bg-card [&_.status-dot]:hidden [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All<FacetCount n={facetCount("status", "all")} /></SelectItem>
              {chips.map(([key, label]) => <SelectItem key={key} value={key}>{label}<FacetCount n={facetCount("status", key)} /></SelectItem>)}
              <SelectItem value="closed">Closed<FacetCount n={facetCount("status", "closed")} /></SelectItem>
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
          {renderStar("type", "w-52")}
          <Select value={companyTypeFilter} onValueChange={(v) => setParam("company_type", v)}>
            <SelectTrigger className="w-48 bg-card [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All company types<FacetCount n={facetCount(COMPANY_TYPE_PARAM, "all")} /></SelectItem>
              {typeNames(factCtx, "company").map((t) => <SelectItem key={t} value={t}>{t}<FacetCount n={facetCount(COMPANY_TYPE_PARAM, t)} /></SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            More Filters
            {moreApplied > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{moreApplied}</span>}
            <ChevronDown className={cn("transition-transform", showMore && "rotate-180")} />
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
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            {filtersApplied && (
              <>
                <button onClick={clearFilters} className="underline-offset-4 hover:text-foreground hover:underline">
                  Clear Filters
                </button>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{rows.length} Jobs</span>
          </div>
          <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => updateProfile.mutate({ job_list_view: v })} />
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
              <SelectTrigger className="w-52 bg-card [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any resume<FacetCount n={facetCount("resume", "all")} /></SelectItem>
                {resumes.map((r) => <SelectItem key={r.version} value={r.version}>{r.version}<FacetCount n={facetCount("resume", r.version)} /></SelectItem>)}
              </SelectContent>
            </Select>
            {renderStar("seniority", "w-52")}
            {renderStar("title", "w-52")}
            <Select value={fitFilter} onValueChange={(v) => setParam("fit", v)}>
              <SelectTrigger className="w-40 bg-card [&_.facet-count]:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fits<FacetCount n={facetCount("fit", "all")} /></SelectItem>
                {FITS.map((f) => <SelectItem key={f} value={f}>{f}<FacetCount n={facetCount("fit", f)} /></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div ref={tableWrap} className="overflow-x-auto rounded-lg border bg-card">
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
                    <TableCell colSpan={columns.length} className="bg-muted/50 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  {isLoading ? "Loading…" : "No jobs match."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <MissingDataDialog jobs={jobs} factCtx={factCtx} value={missing?.key ?? ""} onPick={showMissing} />
        <Link to="/trash" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Trash2 className="size-4" /> Trash
        </Link>
      </div>
    </div>
  );
}
