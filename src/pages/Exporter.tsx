import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useJobs } from "@/lib/api";
import { DEFAULT_EXPORT_KEYS, EXPORT_COLUMNS, downloadCsv, exportJobs, selectedColumns } from "@/lib/exportJobs";

const EXAMPLE_ROWS = 12;

export default function Exporter() {
  const { data: allJobs, isLoading } = useJobs();
  const [keys, setKeys] = useState<string[]>(DEFAULT_EXPORT_KEYS);
  const jobs = useMemo(() => exportJobs(allJobs ?? []), [allJobs]);
  const columns = selectedColumns(keys);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const toggle = (key: string, on: boolean) => setKeys((ks) => (on ? [...ks, key] : ks.filter((k) => k !== key)));

  return (
    <div className="space-y-4">
      <title>Exporter | Application Tracker</title>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Exporter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A CSV snapshot of every application as it stands today, handy as proof of your job search for unemployment filings.
          </p>
        </div>
        <Button onClick={() => downloadCsv(jobs, columns)} disabled={!jobs.length || !columns.length}>
          <Download /> Download CSV
        </Button>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Columns to include</h2>
          <button type="button" onClick={() => setKeys(DEFAULT_EXPORT_KEYS)} className="text-xs text-muted-foreground hover:text-foreground">
            Reset to defaults
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-2">
              <input type="checkbox" checked={keys.includes(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
              {c.label}
            </label>
          ))}
        </div>
      </section>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Example: the first {Math.min(EXAMPLE_ROWS, jobs.length)} of {jobs.length} applications in the export.
        </p>
        <div className="table-bleed overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {columns.map((c) => <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, EXAMPLE_ROWS).map((job) => (
                <TableRow key={job.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="max-w-64 truncate whitespace-nowrap">{c.value(job)}</TableCell>
                  ))}
                </TableRow>
              ))}
              {(!jobs.length || !columns.length) && (
                <TableRow>
                  <TableCell colSpan={Math.max(columns.length, 1)} className="py-10 text-center text-muted-foreground">
                    {jobs.length ? "Pick at least one column." : "No applications yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
