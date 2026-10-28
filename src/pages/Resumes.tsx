import { useNavigate } from "react-router-dom";
import { rowLink } from "@/lib/rowLink";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddResumeDialog } from "@/components/AddResumeDialog";
import { type Resume, useResumes } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { splitResumes } from "@/lib/options";

function ResumeTable({ title, resumes, empty, muted }: { title: string; resumes: Resume[]; empty: string; muted?: boolean }) {
  const navigate = useNavigate();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
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
              <TableRow key={r.id} className={`cursor-pointer ${muted ? "text-muted-foreground" : ""}`} {...rowLink(navigate, `/resumes/${r.id}`)}>
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
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{empty}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default function Resumes() {
  const { data: resumes = [], isLoading } = useResumes();

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const { active, inactive } = splitResumes(resumes);

  return (
    <div className="space-y-6">
      <title>Resumes | Application Tracker</title>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Resumes</h1>
        <AddResumeDialog />
      </div>

      <ResumeTable title="Active" resumes={active} empty="No active resumes." />
      <ResumeTable title="Inactive" resumes={inactive} empty="No inactive resumes." muted />
    </div>
  );
}
