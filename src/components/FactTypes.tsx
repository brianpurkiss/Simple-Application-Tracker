import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type FactType,
  type Job,
  useCreateFactType,
  useDeleteFactType,
  useRenameFactType,
  useReorderFactTypes,
  useResetFactLabels,
  useUpdateJob,
} from "@/lib/api";
import { type FactContext, type FactKind, isAutomatic, resolveCompanyType, resolveJobTypes } from "@/lib/jobFacts";

const onError = (e: Error) => toast.error(e.message);
const NOUN: Record<FactKind, string> = { job: "Job Type", company: "Company Type" };

// The hand-set labels a job carries for one kind.
const labelsOf = (job: Job, kind: FactKind) => (kind === "job" ? job.job_types ?? [] : [job.company_type].filter(Boolean));

// One type, renamed when the field loses focus. Renaming carries through to every job labeled with it.
function TypeRow({ type, used, first, last, onMove }: { type: FactType; used: number; first: boolean; last: boolean; onMove: (step: -1 | 1) => void }) {
  const [name, setName] = useState(type.name);
  const rename = useRenameFactType();
  const remove = useDeleteFactType();
  const commit = () => {
    if (name.trim() === type.name) return;
    rename.mutate({ id: type.id, name: name.trim() }, { onError: (e) => { onError(e); setName(type.name); } });
  };
  const del = () => {
    if (used && !window.confirm(`${used} ${used === 1 ? "job is" : "jobs are"} labeled ${type.name}. Delete it and remove the label from them?`)) return;
    remove.mutate(type.id, { onError });
  };
  return (
    <li className="flex items-center gap-1.5">
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label="Type name" />
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground" title="Jobs labeled with it by hand">{used ? `${used} labeled` : ""}</span>
      <Button variant="ghost" size="icon" aria-label={`Move ${type.name} up`} disabled={first} onClick={() => onMove(-1)}><ArrowUp /></Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${type.name} down`} disabled={last} onClick={() => onMove(1)}><ArrowDown /></Button>
      <Button variant="ghost" size="icon" aria-label={`Delete ${type.name}`} onClick={del}><X /></Button>
    </li>
  );
}

// The list of types for one kind, plus how much of the job list they cover. Opened from the Job Type and
// Company Type tabs of the Segments page.
export function FactTypes({ kind, jobs, factCtx }: { kind: FactKind; jobs: Job[]; factCtx: FactContext }) {
  const types = factCtx.model.types[kind];
  const create = useCreateFactType();
  const reorder = useReorderFactTypes();
  const reset = useResetFactLabels();
  const [draft, setDraft] = useState("");
  const newRef = useRef<HTMLInputElement>(null);

  const sources = jobs.map((j) => (kind === "job" ? resolveJobTypes(j, factCtx).source : resolveCompanyType(j, factCtx).source));
  const handSet = sources.filter((s) => s === "manual").length;
  const automatic = sources.filter(isAutomatic).length;
  const unknown = sources.filter((s) => s === "none").length;
  const usedBy = (name: string) => jobs.filter((j) => labelsOf(j, kind).some((l) => l.toLowerCase() === name.toLowerCase())).length;

  const move = (i: number, step: -1 | 1) => {
    const ids = types.map((t) => t.id);
    [ids[i], ids[i + step]] = [ids[i + step], ids[i]];
    reorder.mutate({ kind, ids }, { onError });
  };
  const add = () => create.mutate({ kind, name: draft.trim() }, { onSuccess: () => setDraft(""), onError });
  const startOver = () => {
    if (!window.confirm("Clear every hand-set Job Type and Company Type on all jobs? A backup is saved first, and the type lists stay as they are.")) return;
    reset.mutate(undefined, { onSuccess: (r) => toast.success("Labels cleared", { description: `Backup saved as ${r.backup}` }), onError });
  };

  return (
    <div className="flex flex-1 flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">
        {handSet} hand-set · {automatic} automatic · <span className={unknown ? "text-amber-600 dark:text-amber-500" : undefined}>{unknown} unknown</span>
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-muted-foreground">{NOUN[kind]}s ({types.length})</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl" onOpenAutoFocus={(e) => { e.preventDefault(); newRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>{NOUN[kind]}s</DialogTitle>
            <DialogDescription>
              The {NOUN[kind].toLowerCase()}s a job can have. Label a few jobs with each and the rest are worked out from them:
              {kind === "job" ? " jobs in the same title family, then words in the title." : " other jobs at the same company, then words in the title."}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {types.map((t, i) => (
              <TypeRow key={`${t.id}:${t.name}`} type={t} used={usedBy(t.name)} first={i === 0} last={i === types.length - 1} onMove={(step) => move(i, step)} />
            ))}
          </ul>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add(); }}>
            <Input ref={newRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`New ${NOUN[kind].toLowerCase()}`} />
            <Button type="submit" variant="outline" disabled={!draft.trim() || create.isPending}>Add</Button>
          </form>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={startOver} disabled={reset.isPending}>Clear all labels…</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Labels one job from a review list. Picking a Job Type sets just that one; add more on the job page.
export function LabelPicker({ job, kind, factCtx }: { job: Job; kind: FactKind; factCtx: FactContext }) {
  const update = useUpdateJob(job.id);
  const current = labelsOf(job, kind)[0];
  const set = (v: string) => update.mutate(kind === "job" ? { job_types: [v] } : { company_type: v }, { onError });
  return (
    // Stops clicks (including ones in the portaled menu) from opening the job.
    <span className="w-40" onClick={(e) => e.stopPropagation()}>
      <Select value={current} onValueChange={set}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label={`Label ${job.title}`}>
          <SelectValue placeholder="Label…" />
        </SelectTrigger>
        <SelectContent>
          {factCtx.model.types[kind].map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </span>
  );
}
