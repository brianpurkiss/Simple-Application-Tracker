import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComboField, CompanyTypeField, JobTypesField, SalaryRangeField, SelectField, TextField } from "@/components/fields";
import { salaryRangeInvalid, toSalary } from "@/lib/salary";
import { type JobInput, useCreateJob, useJobs, useSuggestions } from "@/lib/api";
import { useFactContext } from "@/hooks/useFactContext";
import { factHints, typeNames } from "@/lib/jobFacts";
import type { HotkeyAction } from "@/hooks/appActions";
import { today } from "@/lib/format";
import { APPLIED_VIA, FITS, RESUME_VERSIONS, WORK_MODES, latestResumeVersions, sortResumeVersions } from "@/lib/options";
import { DEMO, toastError, toastSaved } from "@/lib/demo";

const blank = (): JobInput => ({
  title: "",
  company: "",
  company_type: "",
  fit: "",
  job_types: [],
  resume_version: "",
  work_mode: "Remote",
  applied_date: today(),
  applied_via: "Direct",
  agency_name: "",
  jd_link: "",
});

export function AddJobDialog() {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState(blank);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  // Saved postings are kept for segment analysis without being applied to.
  const [savedOnly, setSavedOnly] = useState(false);
  const badRange = salaryRangeInvalid(salaryMin, salaryMax);
  const keyFieldsFilled = [job.title, job.company, job.jd_link, ...(savedOnly ? [] : [job.resume_version])].every((v) => v?.trim());
  const create = useCreateJob();
  const navigate = useNavigate();
  const location = useLocation();
  const titles = useSuggestions("title", []);
  // Job Type and Company Type are worked out live from the other jobs as the title and company are typed.
  const { data: jobs = [] } = useJobs();
  const factCtx = useFactContext(jobs);
  const hints = factHints({ id: -1, title: job.title!, normalized_title: "", company: job.company!, company_type: "", job_types: [] }, factCtx);
  const resumeVersions = sortResumeVersions(latestResumeVersions(useSuggestions("resume_version", RESUME_VERSIONS)));
  const agencyNames = useSuggestions("agency_name", []);

  const set = (key: Exclude<keyof JobInput, "job_types">) => (value: string) => setJob((j) => ({ ...j, [key]: value }));

  // The "c" shortcut and the palette's "Add a job" land here with the request in navigation state.
  useEffect(() => {
    if ((location.state as HotkeyAction | null)?.hotkey !== "add") return;
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (badRange) return;
    create.mutate(
      { ...job, salary_min: toSalary(salaryMin), salary_max: toSalary(salaryMax), applied_date: savedOnly ? null : job.applied_date || null, saved: savedOnly },
      {
        onSuccess: (created) => {
          setOpen(false);
          setJob(blank());
          setSalaryMin("");
          setSalaryMax("");
          setSavedOnly(false);
          toastSaved(`${savedOnly ? "Saved" : "Added"} ${created.title}`);
          // The demo saves nothing, so there's no new job page to open.
          if (!DEMO) navigate(`/jobs/${created.id}`);
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus /> Add Job</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add Job</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <ComboField label="Job Title" value={job.title!} onChange={set("title")} options={titles} autoFocus />
            <TextField label="Company" value={job.company!} onChange={set("company")} />
            <TextField label="Job Description Link" value={job.jd_link!} onChange={set("jd_link")} placeholder="https://" />
            <ComboField label="Resume Version" value={job.resume_version!} onChange={set("resume_version")} options={resumeVersions} placeholder="General 1.0" />
          </div>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Additional Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <JobTypesField value={job.job_types!} onChange={(v) => setJob((j) => ({ ...j, job_types: v }))} options={typeNames(factCtx, "job")} auto={hints.jobTypes} className="col-span-2" />
              <CompanyTypeField value={job.company_type!} onChange={set("company_type")} options={typeNames(factCtx, "company")} auto={hints.companyType} />
              <SalaryRangeField min={salaryMin} max={salaryMax} onMin={setSalaryMin} onMax={setSalaryMax} invalid={badRange} />
              <SelectField label="Fit" value={job.fit!} onChange={set("fit")} options={FITS} />
              <SelectField label="Work Mode" value={job.work_mode!} onChange={set("work_mode")} options={WORK_MODES} />
              {!savedOnly && <TextField label="Applied" type="date" value={job.applied_date ?? ""} onChange={set("applied_date")} />}
              <SelectField label="Applied Via" value={job.applied_via!} onChange={set("applied_via")} options={APPLIED_VIA} />
              <ComboField label="Agency Name" value={job.agency_name!} onChange={set("agency_name")} options={agencyNames} />
            </div>
          </section>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} className="mt-0.5" />
            <span>
              Just saving this, not applied
              <span className="block text-xs text-muted-foreground">Can be included on Segments for combos and salary; never counts in Activity or Performance. Mark it applied later from its page.</span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {/* Soft check: highlights the form once the key fields are filled, never blocks submit. */}
            <Button type="submit" variant={keyFieldsFilled ? "default" : "outline"} disabled={create.isPending}>{savedOnly ? "Save Job" : "Add Job"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
