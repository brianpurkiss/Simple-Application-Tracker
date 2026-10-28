import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Job = {
  id: number;
  title: string;
  company: string;
  company_type: string;
  fit: string;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string;
  resume_version: string;
  work_mode: string;
  status: string;
  applied_date: string | null;
  follow_up_on: string | null; // hold off following up / ghosting until this date
  jd_link: string;
  applied_via: string;
  agency_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_linkedin: string;
  offer_info: string;
  notes: string;
  job_description?: string; // only included when fetching a single job
  cover_letter?: string; // only included when fetching a single job
  created_at: string;
  updated_at: string;
  latest_update: string | null;
  last_follow_up: string | null;
  last_activity: string | null;
  interview_count: number;
  screen_count: number;
  last_heard: string | null;
  first_contact: string | null;
  first_interview: string | null;
  rejected_date: string | null;
  auto_ghosted: boolean;
  deleted_at: string | null;
};

export type JobEvent = {
  id: number;
  job_id: number;
  date: string;
  type: string;
  description: string;
  time: string | null;
};

export type JobInput = Partial<Omit<Job, "id" | "created_at" | "updated_at" | "latest_update" | "last_follow_up" | "last_activity" | "status" | "interview_count" | "screen_count" | "last_heard" | "first_contact" | "first_interview" | "rejected_date" | "auto_ghosted" | "deleted_at">>;
export type EventInput = Pick<JobEvent, "date" | "type" | "description" | "time">;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const useJobs = () =>
  useQuery({ queryKey: ["jobs"], queryFn: () => request<Job[]>("GET", "/api/jobs") });

// Preset options plus any other values already used on jobs, for autocomplete.
export function useSuggestions(field: "title" | "job_type" | "resume_version" | "agency_name", preset: readonly string[]) {
  const { data: jobs = [] } = useJobs();
  const { data: resumes = [] } = useResumes();
  const used = jobs.map((j) => j[field]).filter(Boolean);
  const vault = field === "resume_version" ? resumes.map((r) => r.version) : [];
  return [...new Set([...preset, ...vault, ...used])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export type ActivityEvent = Pick<JobEvent, "id" | "job_id" | "date" | "time" | "type"> & { title: string; company: string; resume_id?: number };

// Shares the "jobs" key prefix so event and job mutations refresh it.
export const useEvents = () =>
  useQuery({ queryKey: ["jobs", "events"], queryFn: () => request<ActivityEvent[]>("GET", "/api/events") });

export const useJob = (id: number) =>
  useQuery({
    queryKey: ["jobs", id],
    queryFn: () => request<Job & { events: JobEvent[] }>("GET", `/api/jobs/${id}`),
  });

function useInvalidatingMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }) });
}

export const useCreateJob = () => useInvalidatingMutation((job: JobInput) => request<Job>("POST", "/api/jobs", job));
export const useUpdateJob = (id: number) =>
  useInvalidatingMutation((job: JobInput) => request<Job>("PATCH", `/api/jobs/${id}`, job));
export const useDeleteJob = () => useInvalidatingMutation((id: number) => request<void>("DELETE", `/api/jobs/${id}`));

// Trash queries share the "jobs" key prefix so the mutations above refresh them too.
export const useTrash = () =>
  useQuery({ queryKey: ["jobs", "trash"], queryFn: () => request<Job[]>("GET", "/api/trash") });
export const useRestoreJob = () =>
  useInvalidatingMutation((id: number) => request<Job>("POST", `/api/jobs/${id}/restore`));
export const useDeleteForever = () =>
  useInvalidatingMutation((id: number) => request<void>("DELETE", `/api/trash/${id}`));

export type Backup = { name: string; size: number; created_at: string };

export const useBackups = () => useQuery({ queryKey: ["backups"], queryFn: () => request<Backup[]>("GET", "/api/backups") });
export const useCreateBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => request<Backup>("POST", "/api/backups", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
};

export type Resume = {
  id: number;
  version: string;
  notes: string;
  plain_text: string;
  pdf_name: string | null;
  pdf_size: number | null;
  has_pdf: boolean;
  active: boolean;
  job_count: number;
  interview_job_count: number;
  interview_company_count: number;
  created_at: string;
  updated_at: string;
};

export type ResumeInput = Partial<Pick<Resume, "version" | "notes" | "plain_text" | "active">>;

export const useResumes = () =>
  useQuery({ queryKey: ["resumes"], queryFn: () => request<Resume[]>("GET", "/api/resumes") });
export const useResume = (id: number) =>
  useQuery({ queryKey: ["resumes", id], queryFn: () => request<Resume>("GET", `/api/resumes/${id}`) });

function useResumeMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }) });
}

export const useCreateResume = () =>
  useResumeMutation((r: ResumeInput) => request<Resume>("POST", "/api/resumes", r));
export const useUpdateResume = (id: number) =>
  useResumeMutation((r: ResumeInput) => request<Resume>("PATCH", `/api/resumes/${id}`, r));
export const useDeleteResume = () =>
  useResumeMutation((id: number) => request<void>("DELETE", `/api/resumes/${id}`));
export const useRemoveResumePdf = (id: number) =>
  useResumeMutation(() => request<Resume>("DELETE", `/api/resumes/${id}/pdf`));

// The file is the raw body, so this skips the JSON request helper.
export async function uploadResumePdf(id: number, file: File): Promise<Resume> {
  const res = await fetch(`/api/resumes/${id}/pdf?name=${encodeURIComponent(file.name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
  return res.json();
}
export const useUploadResumePdf = (id: number) =>
  useResumeMutation((file: File) => uploadResumePdf(id, file));

export const useAddEvent = (jobId: number) =>
  useInvalidatingMutation((e: EventInput) => request<JobEvent>("POST", `/api/jobs/${jobId}/events`, e));
export const useUpdateEvent = () =>
  useInvalidatingMutation(({ id, ...e }: Partial<EventInput> & { id: number }) =>
    request<JobEvent>("PATCH", `/api/events/${id}`, e));
export const useDeleteEvent = () =>
  useInvalidatingMutation((id: number) => request<void>("DELETE", `/api/events/${id}`));

type JobListView = "compact" | "expanded";
export type Profile = { salary_target: number | null; your_name: string; cover_letter: string; job_list_view: JobListView };

export const useProfile = () =>
  useQuery({ queryKey: ["profile"], queryFn: () => request<Profile>("GET", "/api/profile") });
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Profile>) => request<Profile>("PATCH", "/api/profile", p),
    onSuccess: (data) => qc.setQueryData(["profile"], data),
  });
}
