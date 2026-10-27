import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { StatusBadge } from "@/components/StatusBadge";
import { AddJobDialog } from "@/components/AddJobDialog";
import { type HotkeyAction, SEARCH_INPUT_ID } from "@/components/GlobalHotkeys";
import { type Job, useJobs } from "@/lib/api";
import { formatDate, isActive, needsFollowUp } from "@/lib/format";
import { FITS, INTERVIEWING_STATUSES, JOB_TYPES, STALE_DAYS, STATUSES } from "@/lib/options";
import { useParamUpdater } from "@/lib/useParamUpdater";
import { cn } from "@/lib/utils";

const GROUP_FILTERS: Record<string, (job: Job) => boolean> = {
  active: isActive,
  interviewing: (j) => INTERVIEWING_STATUSES.has(j.status),
  followup: needsFollowUp,
  closed: (j) => !isActive(j),
};

const dateCell = (key: keyof Job): ColumnDef<Job> => ({
  accessorKey: key,
  sortUndefined: "last",
  cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string | null)}</span>,
});

const columns: ColumnDef<Job>[] = [
  {
    accessorKey: "title",
    header: "Job Title",
    cell: ({ row }) => (
      <div className="flex max-w-[22rem] items-center gap-1.5">
        <span className="truncate font-medium" title={row.original.title}>{row.original.title}</span>
      </div>
    ),
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => {
      const { company, agency_name, applied_via } = row.original;
      const via = agency_name || (applied_via === "Recruiting Agency" ? "recruiter" : "");
      return (
        <span className="block max-w-[200px] truncate" title={[company, via && `via ${via}`].filter(Boolean).join(" · ")}>
          {company || (via && <span className="text-muted-foreground italic">Unknown</span>)}
          {via && <span className="text-muted-foreground"> · via {via}</span>}
        </span>
      );
    },
  },
  { accessorKey: "job_type", header: "Type" },
  { accessorKey: "fit", header: "Fit" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge job={row.original} /> },
  { ...dateCell("applied_date"), header: "Applied" },
  { ...dateCell("latest_update"), header: "Latest Update" },
];

export default function JobsList() {
  const { data: jobs = [], isLoading } = useJobs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const location = useLocation();

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
        const statusOk = GROUP_FILTERS[statusFilter]?.(j) ?? (statusFilter === "all" || j.status === statusFilter);
        return statusOk && (typeFilter === "all" || j.job_type === typeFilter) && (fitFilter === "all" || j.fit === fitFilter)
          && (!resumeFilter || j.resume_version === resumeFilter);
      }),
    [jobs, statusFilter, typeFilter, fitFilter, resumeFilter],
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
      const haystack = [j.title, j.company, j.notes, j.agency_name, j.contact_name, j.salary].join(" ").toLowerCase();
      return haystack.includes(value.toLowerCase());
    },
  });

  const counts = {
    all: jobs.length,
    active: jobs.filter(GROUP_FILTERS.active).length,
    interviewing: jobs.filter(GROUP_FILTERS.interviewing).length,
    followup: jobs.filter(GROUP_FILTERS.followup).length,
    closed: jobs.filter(GROUP_FILTERS.closed).length,
  };
  const chips: [keyof typeof counts, string][] = [
    ["all", "All"],
    ["active", "Active"],
    ["interviewing", "Interviewing"],
    ["followup", "Needs follow-up"],
    ["closed", "Closed"],
  ];

  const rows = table.getRowModel().rows;
  // Rows remount (replaying the enter animation) when filters or sort change; search changes keep
  // existing rows in place so only newly matching rows animate in.
  const viewKey = [statusFilter, typeFilter, fitFilter, resumeFilter, sortParam].join("|");

  return (
    <div className="space-y-4">
      <title>{`${statusFilter === "followup" ? "Follow Up" : "Jobs"} | Application Tracker`}</title>
      <div className="flex flex-wrap items-center gap-2">
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
        <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="w-52 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {chips.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            <SelectSeparator />
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none whitespace-nowrap"
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
              <TableRow
                key={`${viewKey}:${row.id}`}
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                onClick={() => navigate(`/jobs/${row.original.id}`, { state: { fromList: true } })}
                className={cn("row-in cursor-pointer", needsFollowUp(row.original) && "bg-amber-500/10 hover:bg-amber-500/15")}
                title={needsFollowUp(row.original) ? `No activity in ${STALE_DAYS}+ days` : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
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
