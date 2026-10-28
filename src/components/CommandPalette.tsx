import { type ReactNode, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Keys } from "@/components/Keys";
import { QuickAddEvent } from "@/components/QuickAddEvent";
import { type Job, useJobs, useResumes } from "@/lib/api";
import { useAddJob, useFocusSearch } from "@/hooks/appActions";
import { DAY, formatDate } from "@/lib/format";
import { EVENT_TYPES } from "@/lib/options";
import { GO_TO } from "@/lib/shortcuts";

export type PaletteAction = {
  id: string;
  label: string;
  group: string;
  keys?: readonly string[];
  sep?: string; // joins `keys`; "then" for sequences
  keywords?: string;
  run?: () => void;
  // Picking this action opens a second list instead of running it.
  choices?: PaletteAction[];
};

type Palette = {
  isOpen: () => boolean;
  toggle: () => void;
  logHistory: (job: Job, type?: string) => void;
  register: (id: string, get: () => PaletteAction[]) => () => void;
};

const PaletteContext = createContext<Palette | null>(null);

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette needs <PaletteProvider>");
  return ctx;
}

// Contributes page-specific actions to the palette while the calling component is mounted.
export function usePaletteActions(actions: PaletteAction[]) {
  const { register } = usePalette();
  const id = useId();
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => register(id, () => ref.current), [id, register]);
}

// "Log history…" plus one entry per event type, all opening the quick-add dialog for `job`.
function logActions(job: Job, logHistory: Palette["logHistory"], group: string, withGeneric: boolean): PaletteAction[] {
  const generic: PaletteAction[] = withGeneric
    ? [{ id: "log", label: "Log history…", group, keys: ["L"], keywords: "add event note", run: () => logHistory(job) }]
    : [];
  return [
    ...generic,
    ...EVENT_TYPES.map((t) => ({
      id: `log-${t}`, label: `Log ${t}`, group, keywords: "history add event", run: () => logHistory(job, t),
    })),
  ];
}

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy"));

const inDays = (n: number) => new Date(Date.now() + n * DAY).toLocaleDateString("en-CA");

// Everything the palette can do to one job: log history, open or copy its links, reach the contact,
// and schedule a follow-up.
export function jobActions(
  job: Job,
  o: { logHistory: Palette["logHistory"]; setFollowUp: (date: string | null) => void; group: string; withGeneric: boolean },
): PaletteAction[] {
  const { group } = o;
  const action = (id: string, label: string, run: () => void, extra: Partial<PaletteAction> = {}): PaletteAction => ({ id, label, group, run, ...extra });
  const followUp = (id: string, label: string, date: string | null) => action(id, label, () => o.setFollowUp(date));
  return [
    ...logActions(job, o.logHistory, group, o.withGeneric),
    ...(job.jd_link ? [action("jd", "Open job description", () => void window.open(job.jd_link, "_blank", "noopener"), { keywords: "link posting url" })] : []),
    ...(job.contact_email ? [action("email", `Email ${job.contact_name || "contact"}`, () => { window.location.href = `mailto:${job.contact_email}`; }, { keywords: "contact recruiter mail" })] : []),
    ...(job.contact_phone ? [action("call", `Call ${job.contact_name || "contact"}`, () => { window.location.href = `tel:${job.contact_phone}`; }, { keywords: "contact recruiter phone" })] : []),
    action("copy-link", "Copy job link", () => void copy(`${location.origin}/jobs/${job.id}`, "Job link")),
    ...(job.cover_letter ? [action("copy-cover", "Copy cover letter", () => void copy(job.cover_letter!, "Cover letter"))] : []),
    action("follow-up", "Schedule follow-up…", () => {}, {
      keywords: "remind hold date",
      choices: [
        followUp("fu-1", `Tomorrow (${formatDate(inDays(1))})`, inDays(1)),
        followUp("fu-3", `In 3 days (${formatDate(inDays(3))})`, inDays(3)),
        followUp("fu-7", `In 1 week (${formatDate(inDays(7))})`, inDays(7)),
        followUp("fu-14", `In 2 weeks (${formatDate(inDays(14))})`, inDays(14)),
        followUp("fu-30", `In 1 month (${formatDate(inDays(30))})`, inDays(30)),
        ...(job.follow_up_on ? [followUp("fu-clear", "Clear follow-up date", null)] : []),
      ],
    }),
  ];
}

type Item = { id: string; group: string; node: ReactNode; keys?: readonly string[]; sep?: string; run: () => void; action?: PaletteAction };

// Lower is better; -1 means some word of the query is missing. Matches at the start of a word rank first.
function score(haystack: string, query: string) {
  const h = haystack.toLowerCase();
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = h.indexOf(word);
    if (at < 0) return -1;
    total += at === 0 ? 0 : h[at - 1] === " " ? 1 : 3;
  }
  return total;
}

const MAX_JOBS = 8;
const MAX_RESUMES = 5;

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  const [quick, setQuick] = useState<{ job: Job; type?: string } | null>(null);
  const registry = useRef(new Map<string, () => PaletteAction[]>());

  const value = useMemo<Palette>(() => ({
    isOpen: () => openRef.current,
    toggle: () => setOpen((o) => !o),
    logHistory: (job, type) => setQuick({ job, type }),
    register: (id, get) => {
      registry.current.set(id, get);
      return () => void registry.current.delete(id);
    },
  }), []);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} registry={registry.current} />
      <QuickAddEvent job={quick?.job ?? null} type={quick?.type} onClose={() => setQuick(null)} />
    </PaletteContext.Provider>
  );
}

function CommandPalette({ open, onOpenChange, registry }: { open: boolean; onOpenChange: (o: boolean) => void; registry: Map<string, () => PaletteAction[]> }) {
  const navigate = useNavigate();
  const addJob = useAddJob();
  const focusSearch = useFocusSearch();
  const { data: jobs = [] } = useJobs();
  const { data: resumes = [] } = useResumes();
  // Open second-level lists, outermost first. Backspace on an empty search steps back out.
  const [stack, setStack] = useState<PaletteAction[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setStack([]);
      ran.current = false;
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const fromAction = (a: PaletteAction, group = a.group): Item => ({ id: a.id, group, node: a.label, keys: a.keys, sep: a.sep, run: a.run ?? (() => {}), action: a });
    const context = [...registry.values()].flatMap((get) => get());
    const global: PaletteAction[] = [
      ...GO_TO.map((g) => ({
        id: `go-${g.key}`, label: `Go to ${g.label}`, group: "Go to", keys: ["G", g.key.toUpperCase()], sep: "then", run: () => navigate(g.to),
      })),
      { id: "add-job", label: "Add a job", group: "Actions", keys: ["C"], keywords: "new create", run: addJob },
      { id: "search", label: "Search the jobs list", group: "Actions", keys: ["/"], keywords: "find filter", run: focusSearch },
      { id: "shortcuts", label: "Keyboard shortcuts", group: "Actions", keys: ["?"], keywords: "help keys", run: () => navigate("/shortcuts") },
      { id: "trash", label: "Go to Trash", group: "Go to", keywords: "deleted", run: () => navigate("/trash") },
    ];
    const q = query.trim();
    const haystack = (a: PaletteAction) => `${a.label} ${a.keywords ?? ""} ${a.group}`;
    const rank = <T,>(list: T[], text: (t: T) => string) =>
      q
        ? list.map((t, i) => ({ t, s: score(text(t), q), i })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.t)
        : list;
    const parent = stack[stack.length - 1];
    if (parent?.choices) return rank(parent.choices, haystack).map((a) => fromAction(a, parent.label.replace(/…$/, "")));
    // Context groups first, in the order pages registered them.
    const actions = rank([...context, ...global], haystack);
    const order = [...new Set([...context, ...global].map((a) => a.group))];
    const grouped = order.flatMap((g) => actions.filter((a) => a.group === g)).map((a) => fromAction(a));
    const found = q
      ? rank(jobs, (j) => `${j.title} ${j.company}`).slice(0, MAX_JOBS).map<Item>((j) => ({
          id: `job-${j.id}`,
          group: "Jobs",
          node: (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{j.title}</span>
              <span className="truncate text-muted-foreground">{j.company}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{j.status}</span>
            </span>
          ),
          run: () => navigate(`/jobs/${j.id}`),
        }))
      : [];
    const foundResumes = q
      ? rank(resumes, (r) => r.version).slice(0, MAX_RESUMES).map<Item>((r) => ({
          id: `resume-${r.id}`,
          group: "Resumes",
          node: (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{r.version}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{r.job_count} {r.job_count === 1 ? "job" : "jobs"}</span>
            </span>
          ),
          run: () => navigate(`/resumes/${r.id}`),
        }))
      : [];
    return [...grouped, ...found, ...foundResumes];
  }, [open, query, stack, jobs, resumes, registry, navigate, addJob, focusSearch]);

  useEffect(() => setActive(0), [query]);
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [current, items]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    if (item.action?.choices) {
      setStack((s) => [...s, item.action!]);
      setQuery("");
      return;
    }
    ran.current = true;
    onOpenChange(false);
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[current]);
    } else if (e.key === "Backspace" && !query && stack.length) {
      setStack((s) => s.slice(0, -1));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        // After running an action, leave focus to whatever it opened or navigated to.
        onCloseAutoFocus={(e) => ran.current && e.preventDefault()}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search for an action or a job. Use the arrow keys and Enter to choose.</DialogDescription>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={stack.length ? stack[stack.length - 1].label : "Type a command or search jobs…"}
          aria-label="Command palette search"
          className="border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {items.map((item, i) => (
            <div key={item.id}>
              {(i === 0 || items[i - 1].group !== item.group) && (
                <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{item.group}</div>
              )}
              <div
                role="option"
                aria-selected={i === current}
                data-active={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => run(item)}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-2 text-sm data-[active=true]:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{item.node}</span>
                {item.keys ? <Keys keys={item.keys} sep={item.sep} small /> : item.action?.choices && <span className="text-muted-foreground">›</span>}
              </div>
            </div>
          ))}
          {!items.length && <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
