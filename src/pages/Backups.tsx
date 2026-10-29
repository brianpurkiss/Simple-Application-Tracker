import { useState } from "react";
import { Database, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBackups, useCreateBackup, useDatabaseSize } from "@/lib/api";

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const defaultName = () => `jobs-manual-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function Backups() {
  const { data: backups = [], isLoading } = useBackups();
  const { data: dbSize } = useDatabaseSize();
  const create = useCreateBackup();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const openDialog = () => {
    setName(defaultName());
    setOpen(true);
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(name, {
      onSuccess: (b) => {
        setOpen(false);
        toast.success("Backup created", { description: b.name });
      },
      onError: (err) => toast.error("Backup failed", { description: err.message }),
    });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <title>Backups | Application Tracker</title>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Backups
            {dbSize && <span className="ml-2 text-sm font-normal text-muted-foreground">Database: {formatSize(dbSize.size)}</span>}
          </h1>
        </div>
        <Button onClick={openDialog}><Database /> Back up now</Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Size</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.map((b) => (
              <TableRow key={b.name}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="whitespace-nowrap">{formatWhen(b.created_at)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatSize(b.size)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`/api/backups/${encodeURIComponent(b.name)}/download`} download>
                      <Download /> Download
                    </a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!backups.length && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No backups yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={onCreate} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Back up database</DialogTitle>
              <DialogDescription>Name this backup. It's saved in <code>data/backups</code> as a .db file.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="backup-name" className="text-xs text-muted-foreground">Name</Label>
              <Input id="backup-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus onFocus={(e) => e.target.select()} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending ? "Backing up…" : "Create backup"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
