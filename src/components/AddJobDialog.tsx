import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComboField, SalaryRangeField, SelectField, TextField } from "@/components/fields";
import { salaryRangeInvalid, toSalary } from "@/lib/salary";
import { type JobInput, useCreateJob, useSuggestions } from "@/lib/api";
import type { HotkeyAction } from "@/components/GlobalHotkeys";
import { isEditable, useHotkey } from "@/lib/hotkeys";
import { today } from "@/lib/format";
import { APPLIED_VIA, COMPANY_TYPES, FITS, JOB_TYPES, RESUME_VERSIONS, WORK_MODES, latestResumeVersions } from "@/lib/options";

const blank = (): JobInput => ({
  title: "",
  company: "",
  company_type: "",
  fit: "",
  job_type: "",
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
  const badRange = salaryRangeInvalid(salaryMin, salaryMax);
  const create = useCreateJob();
  const navigate = useNavigate();
  const location = useLocation();
  const jobTypes = useSuggestions("job_type", JOB_TYPES);
  const resumeVersions = latestResumeVersions(useSuggestions("resume_version", RESUME_VERSIONS));
  const agencyNames = useSuggestions("agency_name", []);

  const set = (key: keyof JobInput) => (value: string) => setJob((j) => ({ ...j, [key]: value }));

  useHotkey("q", (e) => {
    if (open || isEditable(e.target) || document.querySelector("[role=dialog], [role=listbox]")) return;
    e.preventDefault(); // keep the "q" out of the autofocused title field
    setOpen(true);
  });

  // "q" from another page lands here with the request in navigation state.
  useEffect(() => {
    if ((location.state as HotkeyAction | null)?.hotkey !== "add") return;
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (badRange) return;
    create.mutate(
      { ...job, salary_min: toSalary(salaryMin), salary_max: toSalary(salaryMax), applied_date: job.applied_date || null },
      {
        onSuccess: (created) => {
          setOpen(false);
          setJob(blank());
          setSalaryMin("");
          setSalaryMax("");
          toast.success(`Added ${created.title}`);
          navigate(`/jobs/${created.id}`);
        },
        onError: (err) => toast.error(err.message),
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
            <TextField label="Job Title" value={job.title!} onChange={set("title")} required autoFocus className="col-span-2" />
            <TextField label="Company" value={job.company!} onChange={set("company")} />
            <SelectField label="Company Type" value={job.company_type!} onChange={set("company_type")} options={COMPANY_TYPES} />
            <SelectField label="Fit" value={job.fit!} onChange={set("fit")} options={FITS} />
            <SalaryRangeField min={salaryMin} max={salaryMax} onMin={setSalaryMin} onMax={setSalaryMax} invalid={badRange} />
            <ComboField label="Job Type" value={job.job_type!} onChange={set("job_type")} options={jobTypes} />
            <ComboField label="Resume Version" value={job.resume_version!} onChange={set("resume_version")} options={resumeVersions} placeholder="Product 1.2" />
            <SelectField label="Location" value={job.work_mode!} onChange={set("work_mode")} options={WORK_MODES} />
            <SelectField label="Applied Via" value={job.applied_via!} onChange={set("applied_via")} options={APPLIED_VIA} />
            <ComboField label="Agency Name" value={job.agency_name!} onChange={set("agency_name")} options={agencyNames} />
            <TextField label="Applied Date" type="date" value={job.applied_date ?? ""} onChange={set("applied_date")} />
            <TextField label="Job Description Link" value={job.jd_link!} onChange={set("jd_link")} placeholder="https://" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Add Job</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
