import { Fragment, useEffect, useMemo } from "react";
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
import { ArrowDown, ArrowUp, Search, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_COLORS } from "@/lib/colors";
import { AddJobDialog } from "@/components/AddJobDialog";
import { type HotkeyAction, SEARCH_INPUT_ID } from "@/components/GlobalHotkeys";
import { type Job, useJobs, useProfile, useUpdateProfile } from "@/lib/api";
import { daysSince, formatDate, isActive, isOnHold, needsFollowUp, reachedInterview } from "@/lib/format";
import { COMPANY_TYPES, FITS, INTERVIEWING_STATUSES, JOB_TYPES, STALE_DAYS, STATUSES } from "@/lib/options";
import { formatSalary } from "@/lib/salary";
import { useParamUpdater } from "@/lib/useParamUpdater";
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

const textCell = (key: "resume_version" | "job_type" | "company_type", header: string): ColumnDef<Job> => ({
  accessorKey: key,
  header,
  sortUndefined: "last",
  cell: ({ getValue }) => {
    const v = getValue() as string;
    return v ? <span className="block max-w-[160px] truncate" title={v}>{v}</span> : <span className="text-muted-foreground">—</span>;
  },
});

const buildColumns = (expanded: boolean): ColumnDef<Job>[] => [
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
  ...(expanded ? [textCell("resume_version", "Resume"), textCell("job_type", "Job Type"), textCell("company_type", "Company Type")] : []),
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge job={row.original} plain /> },
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

const VIEW_OPTIONS = [
  { key: "compact", label: "Compact" },
  { key: "expanded", label: "Expanded" },
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
  // Compact view: every column but the last hugs its content; the last (Days Since) absorbs the leftover width.
  const shrink = view === "compact";
  const columns = useMemo(() => buildColumns(view === "expanded"), [view]);

  // Cmd/Ctrl+F from another page lands here with the request in navigation state.
  useEffect(() => {
    if ((location.state as HotkeyAction | null)?.hotkey !== "search") return;
    document.getElementById(SEARCH_INPUT_ID)?.focus();
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate]);

  const search = params.get("q") ?? "";
  const statusFilter = params.get("status") ?? "active";
  const typeFilter = params.get("type") ?? "all";
  const fitFilter = params.get("fit") ?? "all";
  const companyTypeFilter = params.get("company_type") ?? "all";
  const resumeFilter = params.get("resume") ?? "";
  const sortParam = params.get("sort") ?? "applied_date:desc";
  // Memoized: a new array every render makes TanStack Table recompute and re-render in a loop.
  const sorting = useMemo<SortingState>(() => {
    const [id, dir] = sortParam.split(":");
    return [{ id, desc: dir === "desc" }];
  }, [sortParam]);

  const setParam = (key: string, value: string) => updateParams((p) => p.set(key, value));

  const filtered = useMemo(
    () =>
      jobs.filter((j) => {
        const statusOk = GROUP_FILTERS[statusFilter]?.(j) || (statusFilter === "followup" && isOnHold(j)) || (!GROUP_FILTERS[statusFilter] && (statusFilter === "all" || j.status === statusFilter));
        return statusOk && (typeFilter === "all" || j.job_type === typeFilter) && (fitFilter === "all" || j.fit === fitFilter)
          && (companyTypeFilter === "all" || j.company_type === companyTypeFilter)
          && (!resumeFilter || j.resume_version === resumeFilter);
      }),
    [jobs, statusFilter, typeFilter, fitFilter, companyTypeFilter, resumeFilter],
  );

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
    globalFilterFn: (row, _columnId, value: string) => {
      const j = row.original;
      const haystack = [j.title, j.company, j.notes, j.agency_name, j.contact_name, formatSalary(j.salary_min, j.salary_max)].join(" ").toLowerCase();
      return haystack.includes(value.toLowerCase());
    },
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
  const viewKey = [statusFilter, typeFilter, fitFilter, companyTypeFilter, resumeFilter, sortParam].join("|");

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
                  p.set("type", "all");
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

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="w-52 bg-card [&_.status-dot]:hidden"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {chips.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            <SelectItem value="closed">Closed</SelectItem>
            <SelectSeparator />
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className={cn("status-dot mr-2 inline-block size-2.5 rounded-full align-middle", STATUS_COLORS[s]?.dot)} />
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All job types</SelectItem>
            {JOB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fitFilter} onValueChange={(v) => setParam("fit", v)}>
          <SelectTrigger className="w-40 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fits</SelectItem>
            {FITS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={companyTypeFilter} onValueChange={(v) => setParam("company_type", v)}>
          <SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All company types</SelectItem>
            {COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {resumeFilter && (
          <button
            onClick={() => updateParams((p) => p.delete("resume"))}
            className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent"
            title="Clear resume filter"
          >
            Resume: {resumeFilter} <X className="size-3.5" />
          </button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} jobs</span>
        <Segmented options={VIEW_OPTIONS} value={view} onChange={(v) => updateProfile.mutate({ job_list_view: v })} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
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
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                {...rowLink(navigate, `/jobs/${row.original.id}`, { fromList: true })}
                className={cn("row-in cursor-pointer", needsFollowUp(row.original) && "bg-amber-500/10 hover:bg-amber-500/15")}
                title={needsFollowUp(row.original) ? `No activity in ${STALE_DAYS}+ days` : undefined}
              >
                {row.getVisibleCells().map((cell, idx, cells) => (
                  <TableCell key={cell.id} className={cn(shrink && idx < cells.length - 1 && "w-px")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
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
      <Link to="/trash" className="ml-auto flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <Trash2 className="size-4" /> Trash
      </Link>
    </div>
  );
}
