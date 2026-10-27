import { useNavigate } from "react-router-dom";
import { rowLink } from "@/lib/rowLink";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddResumeDialog } from "@/components/AddResumeDialog";
import { useResumes } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function Resumes() {
  const { data: resumes = [], isLoading } = useResumes();
  const navigate = useNavigate();

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <title>Resumes | Application Tracker</title>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Resumes</h1>
          <p className="text-sm text-muted-foreground">
            Each version's PDF, notes and plain text. Jobs are linked by matching the version name.
          </p>
        </div>
        <AddResumeDialog />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>PDF</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Interviews</TableHead>
              <TableHead>Success Rate</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumes.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" {...rowLink(navigate, `/resumes/${r.id}`)}>
                <TableCell className="font-medium">{r.version}</TableCell>
                <TableCell className="max-w-[20rem] truncate" title={r.pdf_name ?? ""}>{r.has_pdf ? r.pdf_name : "—"}</TableCell>
                <TableCell>{r.job_count}</TableCell>
                <TableCell>{r.interview_company_count}</TableCell>
                <TableCell>{r.job_count ? `${Math.round((r.interview_job_count / r.job_count) * 100)}%` : "–"}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(r.created_at.slice(0, 10))}</TableCell>
              </TableRow>
            ))}
            {!resumes.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No resumes yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
