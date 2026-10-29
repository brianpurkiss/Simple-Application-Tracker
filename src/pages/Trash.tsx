import { useNavigate } from "react-router-dom";
import { confirmDialog } from "@/components/ConfirmDialog";
import { rowLink } from "@/lib/rowLink";
import { RotateCcw, Trash2 } from "lucide-react";
import { toastSaved } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { type Job, useDeleteForever, useRestoreJob, useTrash } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function Trash() {
  const { data: jobs = [], isLoading } = useTrash();
  const restore = useRestoreJob();
  const deleteForever = useDeleteForever();
  const navigate = useNavigate();

  const onRestore = (job: Job) =>
    restore.mutate(job.id, { onSuccess: () => toastSaved("Restored", { description: job.title }) });

  const onDeleteForever = async (job: Job) => {
    if (!(await confirmDialog({ message: `Permanently delete "${job.title}" at ${job.company} and its history? This can't be undone.`, confirmLabel: "Delete forever", destructive: true }))) return;
    deleteForever.mutate(job.id);
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <title>Trash | Application Tracker</title>
      <div>
        <h1 className="text-xl font-semibold">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Deleted jobs stay here until you restore them or delete them for good.
        </p>
      </div>

      <div className="table-bleed overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Job Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="cursor-pointer" {...rowLink(navigate, `/jobs/${job.id}`)}>
                <TableCell className="max-w-[22rem] truncate font-medium" title={job.title}>{job.title}</TableCell>
                <TableCell className="whitespace-nowrap">{job.company}</TableCell>
                <TableCell><StatusBadge job={job} /></TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(job.deleted_at?.slice(0, 10))}</TableCell>
                <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => onRestore(job)}>
                    <RotateCcw /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteForever(job)}
                  >
                    <Trash2 /> Delete forever
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!jobs.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Trash is empty.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
