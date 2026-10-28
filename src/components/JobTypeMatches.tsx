import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type JobTypeMatch, useCreateJobTypeMatch, useDeleteJobTypeMatch, useJobTypeMatches, useUpdateJobTypeMatch } from "@/lib/api";
import { JOB_TYPES } from "@/lib/options";

const onError = (e: Error) => toast.error(e.message);

// One rule. The term is saved when the field loses focus; the Job Type saves as soon as it's picked.
function MatchRow({ match }: { match: JobTypeMatch }) {
  const [term, setTerm] = useState(match.term);
  const update = useUpdateJobTypeMatch();
  const remove = useDeleteJobTypeMatch();
  const save = (next: Pick<JobTypeMatch, "term" | "job_type">) =>
    update.mutate({ id: match.id, ...next }, { onError: (e) => { onError(e); setTerm(match.term); } });
  return (
    <li className="flex items-center gap-2">
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onBlur={() => term.trim() !== match.term && save({ term: term.trim(), job_type: match.job_type })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label="Term in the title function"
      />
      <Select value={match.job_type} onValueChange={(v) => save({ term: match.term, job_type: v })}>
        <SelectTrigger className="w-56 shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          {JOB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" title="Delete rule" aria-label="Delete rule" onClick={() => remove.mutate(match.id, { onError })}>
        <X />
      </Button>
    </li>
  );
}

export function JobTypeMatches() {
  const { data: matches = [] } = useJobTypeMatches();
  const create = useCreateJobTypeMatch();
  const [term, setTerm] = useState("");
  const [jobType, setJobType] = useState(JOB_TYPES[0]);
  const add = () =>
    create.mutate({ term: term.trim(), job_type: jobType }, { onSuccess: () => setTerm(""), onError });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-muted-foreground">
          Job Type Rules ({matches.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Job Type Rules</DialogTitle>
          <DialogDescription>
            A job's Job Type comes from its title's function when it isn't set by hand. A word or phrase in the function
            picks that Job Type; the longest matching term wins. Functions no rule matches become Other.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {matches.length > 0 && (
            <ul className="space-y-2">
              {matches.map((m) => <MatchRow key={`${m.id}:${m.term}:${m.job_type}`} match={m} />)}
            </ul>
          )}
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (term.trim()) add(); }}>
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="eCommerce" aria-label="New term" />
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger className="w-56 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" disabled={!term.trim() || create.isPending}>Add</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
