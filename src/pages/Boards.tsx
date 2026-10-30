import { useMemo, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextField } from "@/components/fields";
import { confirmDialog } from "@/components/ConfirmDialog";
import { type JobBoard, useAddBoard, useBoards, useDeleteBoard, useDismissBoardDomain, useDismissedBoardDomains, useJobs, useOpenBoard, useUpdateBoard } from "@/lib/api";
import { boardCounts, hostOf, normalizeUrl, suggestBoards } from "@/lib/boards";
import { toastError, toastSaved } from "@/lib/demo";
import { daysSince } from "@/lib/format";
import { plural } from "@/lib/text";
import { cn } from "@/lib/utils";

function lastOpened(day: string | null) {
  const days = daysSince(day);
  if (days === null) return "Not opened yet";
  if (days <= 0) return "Opened today";
  return days === 1 ? "Opened yesterday" : `Opened ${days} days ago`;
}

function progressNote(opened: number, total: number) {
  if (!total) return "Add the boards you check, then open them here.";
  if (opened >= total) return "Every board checked today. Nicely done! 🎉";
  if (!opened) return "Open a board and see what's new. One small step counts.";
  return `${plural(opened, "board")} checked today. Keep browsing!`;
}

type Prefill = Pick<JobBoard, "name" | "url">;

// `board` is the one being edited, or null for a new one, which can start from `prefill`.
function BoardDialog({ open, board, prefill, onClose }: { open: boolean; board: JobBoard | null; prefill?: Prefill; onClose: () => void }) {
  const start = board ?? prefill;
  const [name, setName] = useState(start?.name ?? "");
  const [url, setUrl] = useState(start?.url ?? "");
  const add = useAddBoard();
  const update = useUpdateBoard();
  const busy = add.isPending || update.isPending;
  const valid = !!name.trim() && !!normalizeUrl(url);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name: name.trim(), url };
    const options = {
      onSuccess: () => { onClose(); toastSaved(board ? "Board updated" : `Added ${input.name}`); },
      onError: toastError,
    };
    if (board) update.mutate({ ...input, id: board.id }, options);
    else add.mutate(input, options);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{board ? "Edit Board" : "Add Board"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <TextField label="Name" value={name} onChange={setName} required autoFocus placeholder="Industry job board" />
            <TextField label="Link" value={url} onChange={setUrl} required placeholder="example.com/jobs" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !valid}>{board ? "Save" : "Add Board"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Boards() {
  const { data: boards = [], isLoading } = useBoards();
  const openBoard = useOpenBoard();
  const remove = useDeleteBoard();
  const { data: jobs = [] } = useJobs();
  const { data: dismissed = [] } = useDismissedBoardDomains();
  const dismiss = useDismissBoardDomain();
  // `undefined` is closed, null is a new board.
  const [editing, setEditing] = useState<JobBoard | null | undefined>(undefined);
  const [prefill, setPrefill] = useState<Prefill | undefined>();
  const openDialog = (board: JobBoard | null, from?: Prefill) => { setPrefill(from); setEditing(board); };

  const counts = useMemo(() => boardCounts(boards, jobs), [boards, jobs]);
  const suggestions = useMemo(() => suggestBoards(boards, jobs, dismissed), [boards, jobs, dismissed]);

  const openedToday = boards.filter((b) => daysSince(b.last_opened_on) === 0).length;

  const onDelete = async (b: JobBoard) => {
    if (!(await confirmDialog({ message: `Remove "${b.name}" from your boards?`, confirmLabel: "Remove", destructive: true }))) return;
    remove.mutate(b.id, { onSuccess: () => toastSaved(`Removed ${b.name}`), onError: toastError });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <title>Job Boards | Application Tracker</title>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Job Boards</h1>
          <p className="text-sm text-muted-foreground">Your quick links for browsing new postings. {progressNote(openedToday, boards.length)}</p>
        </div>
        <Button onClick={() => openDialog(null)}><Plus /> Add Board</Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <ul className="divide-y">
          {boards.map((b) => {
            const today = daysSince(b.last_opened_on) === 0;
            // A click opens the link (new tab, however it's opened) and notes the day.
            const mark = () => openBoard.mutate(b.id, { onError: toastError });
            return (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={mark}
                  onAuxClick={(e) => e.button === 1 && mark()}
                  className="group flex min-w-0 flex-1 items-center gap-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium group-hover:underline">{b.name}</div>
                    <div className="truncate text-sm text-muted-foreground">{hostOf(b.url)}</div>
                  </div>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </a>
                <span className="hidden shrink-0 text-sm whitespace-nowrap text-muted-foreground sm:inline">
                  {counts.get(b.id) ? plural(counts.get(b.id)!, "job") : "No jobs yet"}
                  <span aria-hidden className="mr-[-4px] ml-2">·</span>
                </span>
                <span className={cn("flex shrink-0 items-center gap-1 text-right text-sm whitespace-nowrap", today ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                  {today && <Check className="size-3.5" aria-hidden />}
                  {lastOpened(b.last_opened_on)}
                </span>
                <div className="flex shrink-0">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} title="Edit" onClick={() => openDialog(b)}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${b.name}`} title="Remove" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(b)}><Trash2 /></Button>
                </div>
              </li>
            );
          })}
          {!boards.length && <li className="px-4 py-10 text-center text-muted-foreground">No boards yet. Add the sites you like to browse.</li>}
        </ul>
      </div>

      {suggestions.length > 0 && (
        <section aria-label="Suggested boards" className="overflow-hidden rounded-lg border border-dashed bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">Suggested from your jobs</h2>
          <ul className="divide-y">
            {suggestions.map((s) => (
              <li key={s.domain} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.domain}</div>
                  <div className="truncate text-sm text-muted-foreground">{plural(s.count, "job")} link to this site</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openDialog(null, { name: s.name, url: `https://${s.domain}/` })}><Plus /> Add</Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Dismiss ${s.domain}`}
                  title="Don't suggest this site"
                  className="text-muted-foreground"
                  onClick={() => dismiss.mutate(s.domain, { onError: toastError })}
                ><X /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Remounted per board so the fields start from its values. */}
      {editing !== undefined && <BoardDialog key={editing?.id ?? prefill?.url ?? "new"} open board={editing} prefill={prefill} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
