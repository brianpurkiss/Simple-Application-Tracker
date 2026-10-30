import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FactKind, FactType } from "./jobFacts.ts";
import { today } from "./clock.ts";
import { DEMO, demoGet, demoWrite } from "./demo.ts";

export type Job = {
  id: number;
  title: string;
  /** Optional hand-written title used only for title analysis. */
  normalized_title: string;
  company: string;
  company_type: string;
  fit: string;
  salary_min: number | null;
  salary_max: number | null;
  /** Hand-set Job Types, main one first. Empty means worked out automatically (see jobFacts.ts). */
  job_types: string[];
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
  /** Whether the compensation below is from the posting or an offer; "" when not said. */
  comp_source: "" | "posted" | "offer";
  /** Target bonus as a % of base. Use bonus_amount instead when it's stated in dollars. */
  bonus_pct: number | null;
  bonus_amount: number | null;
  equity_type: "" | "none" | "rsu" | "options" | "profit_share" | "other";
  /** Estimated equity value per year, in dollars. */
  equity_annual: number | null;
  equity_vest_years: number | null;
  /** One-time cash; shown, but never counted in the annual package. */
  signing_bonus: number | null;
  relocation: number | null;
  /** 401k match: the employer matches match_rate_pct% of contributions, up to match_cap_pct% of salary. */
  match_rate_pct: number | null;
  match_cap_pct: number | null;
  hsa_employer: number | null;
  stipends_annual: number | null;
  /** Benefits: null is unknown, 0 no, 1 yes. */
  benefit_medical: TriState;
  benefit_dental: TriState;
  benefit_vision: TriState;
  benefit_life: TriState;
  benefit_disability: TriState;
  /** % of the employee's medical premium the employer pays. */
  medical_premium_pct: number | null;
  pto_days: number | null;
  pto_unlimited: boolean;
  /** Null when sick time is part of PTO or not stated. */
  sick_days: number | null;
  holidays: number | null;
  parental_leave_weeks: number | null;
  /** Free-form compensation notes. */
  offer_info: string;
  notes: string;
  job_description?: string; // only included when fetching a single job
  cover_letter?: string; // only included when fetching a single job
  has_job_description?: boolean; // only included in job lists
  has_cover_letter?: boolean; // only included in job lists
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
  /** A posting kept for segment analysis, not applied to. Left out of activity and performance until it's applied to. */
  saved: boolean;
  deleted_at: string | null;
};

export type TriState = 0 | 1 | null;

export type JobEvent = {
  id: number;
  job_id: number;
  date: string;
  type: string;
  description: string;
  notes: string;
  time: string | null;
};

export type JobInput = Partial<Omit<Job, "id" | "created_at" | "updated_at" | "latest_update" | "last_follow_up" | "last_activity" | "status" | "interview_count" | "screen_count" | "last_heard" | "first_contact" | "first_interview" | "rejected_date" | "auto_ghosted" | "deleted_at">>;
export type EventInput = Pick<JobEvent, "date" | "type" | "description" | "notes" | "time">;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (DEMO) return method === "GET" ? demoGet<T>(url) : demoWrite<T>(body);
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
export function useSuggestions(field: "title" | "resume_version" | "agency_name", preset: readonly string[]) {
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
export const useDatabaseSize = () =>
  useQuery({ queryKey: ["database-size"], queryFn: () => request<{ size: number }>("GET", "/api/database/size") });
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

// The demo serves each resume's PDF as a static file next to the app.
export const resumePdfUrl = (resume: Pick<Resume, "id" | "updated_at">) =>
  DEMO ? `${import.meta.env.BASE_URL}demo/resume-${resume.id}.pdf` : `/api/resumes/${resume.id}/pdf?v=${encodeURIComponent(resume.updated_at)}`;

// The file is the raw body, so this skips the JSON request helper.
export async function uploadResumePdf(id: number, file: File): Promise<Resume> {
  if (DEMO) return demoWrite<Resume>();
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

export const useApplyJob = (jobId: number) =>
  useInvalidatingMutation((date: string) => request<Job>("POST", `/api/jobs/${jobId}/apply`, { date }));
export const useAddEvent = (jobId: number) =>
  useInvalidatingMutation((e: EventInput) => request<JobEvent>("POST", `/api/jobs/${jobId}/events`, e));
// For callers that pick the job per call, like the command palette.
export const useAddEventTo = () =>
  useInvalidatingMutation(({ jobId, ...e }: EventInput & { jobId: number }) => request<JobEvent>("POST", `/api/jobs/${jobId}/events`, e));
export const useUpdateEvent = () =>
  useInvalidatingMutation(({ id, ...e }: Partial<EventInput> & { id: number }) =>
    request<JobEvent>("PATCH", `/api/events/${id}`, e));
export const useDeleteEvent = () =>
  useInvalidatingMutation((id: number) => request<void>("DELETE", `/api/events/${id}`));

export type JobListView = "compact" | "expanded" | "offers";
export type Profile = {
  salary_target: number | null;
  /** The last job's base salary, annual package and paid days off, for comparison. */
  past_base_salary: number | null;
  past_package: number | null;
  past_days_off: number | null;
  your_name: string;
  cover_letter: string;
  job_list_view: JobListView;
  hide_financials: boolean;
  /** What a new job starts with. */
  favorite_resume_id: number | null;
  default_work_mode: string;
  default_applied_via: string;
};

export const useProfile = () =>
  useQuery({ queryKey: ["profile"], queryFn: () => request<Profile>("GET", "/api/profile") });
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    // In the demo, profile changes (list view, hiding figures…) stay in this tab.
    mutationFn: (p: Partial<Profile>) =>
      DEMO ? Promise.resolve({ ...qc.getQueryData<Profile>(["profile"])!, ...p }) : request<Profile>("PATCH", "/api/profile", p),
    onSuccess: (data) => qc.setQueryData(["profile"], data),
  });
}

export type JobBoard = { id: number; name: string; url: string; last_opened_on: string | null };
export type JobBoardInput = Pick<JobBoard, "name" | "url">;

export const useBoards = () =>
  useQuery({ queryKey: ["boards"], queryFn: () => request<JobBoard[]>("GET", "/api/boards") });

// Every board call answers with the whole list. The demo saves nothing, so its answers (the request echoed back)
// are ignored, apart from opening a board, which stays in this tab like stars do.
function useBoardMutation<V>(fn: (vars: V, cached: JobBoard[]) => Promise<JobBoard[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(vars, qc.getQueryData<JobBoard[]>(["boards"]) ?? []),
    onSuccess: (data) => qc.setQueryData(["boards"], data),
  });
}
const keepIfDemo = (cached: JobBoard[]) => (written: unknown) => (DEMO ? cached : (written as JobBoard[]));
export const useAddBoard = () =>
  useBoardMutation((b: JobBoardInput, cached) => request<JobBoard[]>("POST", "/api/boards", b).then(keepIfDemo(cached)));
export const useUpdateBoard = () =>
  useBoardMutation(({ id, ...b }: JobBoardInput & { id: number }, cached) => request<JobBoard[]>("PATCH", `/api/boards/${id}`, b).then(keepIfDemo(cached)));
export const useDeleteBoard = () =>
  useBoardMutation((id: number, cached) => request<JobBoard[]>("DELETE", `/api/boards/${id}`).then(keepIfDemo(cached)));
export const useOpenBoard = () =>
  useBoardMutation((id: number, cached) =>
    DEMO ? Promise.resolve(cached.map((b) => (b.id === id ? { ...b, last_opened_on: today() } : b))) : request<JobBoard[]>("POST", `/api/boards/${id}/open`));

export const useDismissedBoardDomains = () =>
  useQuery({ queryKey: ["board-dismissed"], queryFn: () => request<string[]>("GET", "/api/board-suggestions/dismissed") });
// In the demo the dismissal stays in this tab, like stars.
export function useDismissBoardDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      DEMO ? Promise.resolve([...(qc.getQueryData<string[]>(["board-dismissed"]) ?? []), domain]) : request<string[]>("POST", "/api/board-suggestions/dismissed", { domain }),
    onSuccess: (data) => qc.setQueryData(["board-dismissed"], data),
  });
}

export type StarKind = "title" | "seniority" | "type";
export type StarredGroup = { kind: StarKind; key: string; label: string };

export const useStarredGroups = () =>
  useQuery({ queryKey: ["starred-groups"], queryFn: () => request<StarredGroup[]>("GET", "/api/starred-groups") });
export function useToggleStar() {
  const qc = useQueryClient();
  return useMutation({
    // In the demo, stars stay in this tab: the optimistic list below is the result.
    mutationFn: (v: StarredGroup & { starred: boolean }) =>
      DEMO ? Promise.resolve(qc.getQueryData<StarredGroup[]>(["starred-groups"]) ?? []) : request<StarredGroup[]>("PUT", "/api/starred-groups", v),
    // Flip the star right away; the server's list replaces it on success or the old one returns on error.
    onMutate: async ({ kind, key, label, starred }) => {
      await qc.cancelQueries({ queryKey: ["starred-groups"] });
      const prev = qc.getQueryData<StarredGroup[]>(["starred-groups"]) ?? [];
      const rest = prev.filter((s) => !(s.kind === kind && s.key === key));
      qc.setQueryData(["starred-groups"], starred ? [...rest, { kind, key, label }] : rest);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(["starred-groups"], ctx.prev),
    onSuccess: (data) => qc.setQueryData(["starred-groups"], data),
  });
}

export type TitleSynonym = { id: number; terms: string[] };

export const useTitleSynonyms = () =>
  useQuery({ queryKey: ["title-synonyms"], queryFn: () => request<TitleSynonym[]>("GET", "/api/title-synonyms") });

function useSynonymMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  // Titles are consolidated from jobs plus synonyms, so refresh both for the Segments page.
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["title-synonyms"] }), qc.invalidateQueries({ queryKey: ["jobs"] })]),
  });
}

export const useCreateTitleSynonym = () =>
  useSynonymMutation((terms: string[]) => request<TitleSynonym[]>("POST", "/api/title-synonyms", { terms }));
export const useUpdateTitleSynonym = () =>
  useSynonymMutation(({ id, terms }: TitleSynonym) => request<TitleSynonym[]>("PATCH", `/api/title-synonyms/${id}`, { terms }));
export const useDeleteTitleSynonym = () =>
  useSynonymMutation((id: number) => request<void>("DELETE", `/api/title-synonyms/${id}`));

export type { FactType } from "./jobFacts.ts";

export const useFactTypes = () =>
  useQuery({ queryKey: ["fact-types"], queryFn: () => request<FactType[]>("GET", "/api/fact-types") });

function useFactTypeMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  // Renaming or deleting a type relabels jobs too, so both refresh.
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["fact-types"] }), qc.invalidateQueries({ queryKey: ["jobs"] })]),
  });
}

export const useCreateFactType = () =>
  useFactTypeMutation((t: Pick<FactType, "kind" | "name">) => request<FactType[]>("POST", "/api/fact-types", t));
export const useRenameFactType = () =>
  useFactTypeMutation(({ id, name }: Pick<FactType, "id" | "name">) => request<FactType[]>("PATCH", `/api/fact-types/${id}`, { name }));
export const useReorderFactTypes = () =>
  useFactTypeMutation((o: { kind: FactKind; ids: number[] }) => request<FactType[]>("PUT", "/api/fact-types/order", o));
export const useDeleteFactType = () =>
  useFactTypeMutation((id: number) => request<FactType[]>("DELETE", `/api/fact-types/${id}`));
export const useResetFactLabels = () =>
  useFactTypeMutation(() => request<{ backup: string }>("POST", "/api/facts/reset"));
