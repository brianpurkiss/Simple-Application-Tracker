import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComboField, TextField } from "@/components/fields";
import { keyFieldsFilled } from "@/components/JobFormCards";
import { useCreateJob, useSuggestions } from "@/lib/api";
import { onQuickAdd } from "@/hooks/appActions";
import { useJobDefaults } from "@/hooks/useJobDefaults";
import { RESUME_VERSIONS, latestResumeVersions, sortResumeVersions } from "@/lib/options";
import { DEMO, toastError, toastSaved } from "@/lib/demo";

const blank = { title: "", company: "", jd_link: "", resume_version: "" };

// The few fields worth typing the moment you apply. Saving opens the new job's page in Edit for the rest;
// "Open full form" carries what's typed to the Add Job page instead. Opened from anywhere by C or the palette.
export function QuickAddJobDialog() {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState(blank);
  const { defaults } = useJobDefaults();
  const create = useCreateJob();
  const navigate = useNavigate();
  const titles = useSuggestions("title", []);
  const resumeVersions = sortResumeVersions(latestResumeVersions(useSuggestions("resume_version", RESUME_VERSIONS)));

  const set = (key: keyof typeof blank) => (value: string) => setJob((j) => ({ ...j, [key]: value }));

  // Each opening starts fresh, with the starred resume filled in.
  useEffect(() => onQuickAdd(() => {
    setJob({ ...blank, resume_version: defaults.resume_version });
    setOpen(true);
  }), [defaults.resume_version]);

  const openFullForm = () => {
    setOpen(false);
    navigate("/jobs/new", { state: { prefill: job } });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { ...job, applied_date: defaults.applied_date, work_mode: defaults.work_mode, applied_via: defaults.applied_via },
      {
        onSuccess: (created) => {
          setOpen(false);
          toastSaved(`Added ${created.title}`);
          // The demo saves nothing, so there's no new job page to open.
          if (!DEMO) navigate(`/jobs/${created.id}`, { state: { edit: true } });
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Sits in the upper third, so the title suggestions have room to open below. */}
      <DialogContent className="top-[12vh] translate-y-0 sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Quick Add Job</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComboField label="Job Title" value={job.title} onChange={set("title")} options={titles} autoFocus />
            <TextField label="Company" value={job.company} onChange={set("company")} />
            <TextField label="Job Description Link" value={job.jd_link} onChange={set("jd_link")} placeholder="https://" />
            <ComboField label="Resume Version" value={job.resume_version} onChange={set("resume_version")} options={resumeVersions} placeholder="General 1.0" />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={openFullForm}>Open full form</Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              {/* Soft check: highlights the form once the key fields are filled, never blocks submit. */}
              <Button type="submit" variant={keyFieldsFilled(job) ? "default" : "outline"} disabled={create.isPending}>Add Job</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
