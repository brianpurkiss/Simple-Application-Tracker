import { useLocation, useNavigate } from "react-router-dom";
import { useParamUpdater } from "@/lib/useParamUpdater";
import { isEditable, useHotkey } from "@/lib/hotkeys";

export const FOLLOW_UP = "/jobs?status=followup";
export const SEARCH_INPUT_ID = "job-search";

// Set on navigation state so the jobs list can act once it has mounted.
export type HotkeyAction = { hotkey?: "add" | "search" };

// URL params that count as an active search/filter on each page (sort and view settings are not).
const FILTER_PARAMS: Record<string, string[]> = {
  "/jobs": ["q", "status", "type", "fit", "resume"],
  "/performance": ["metric", "versions", "conf", "recency", "min", "with"],
  "/activity": ["job_type", "company_type", "resume", "versions"],
};

const overlayOpen = () => !!document.querySelector("[role=dialog], [role=listbox]");

function useGoToHotkey(key: string, to: string) {
  const navigate = useNavigate();
  useHotkey(key, (e) => {
    if (isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    navigate(to);
  });
}

// App-wide shortcuts. The jobs
// list handles "q" itself when it is already showing, so those are skipped here.
export function GlobalHotkeys() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const updateParams = useParamUpdater();
  const onList = pathname === "/jobs";
  // Home and the jobs list both mount the add-job dialog, which handles "q" itself.
  const hasAddDialog = onList || pathname === "/";

  // Job and resume detail pages handle their own Escape (they guard unsaved changes).
  useHotkey("Escape", (e) => {
    const inSearch = (e.target as HTMLElement | null)?.id === SEARCH_INPUT_ID;
    if (isEditable(e.target)) {
      (e.target as HTMLElement).blur();
      if (!inSearch) return;
    }
    if (overlayOpen()) return;
    const keys = FILTER_PARAMS[pathname];
    if (!keys) return;
    const params = new URLSearchParams(search);
    // The jobs list's default view is "active", so only other statuses count as a filter.
    const active = keys.some((k) => params.has(k) && !(onList && k === "status" && params.get(k) === "active"));
    if (active) updateParams((p) => keys.forEach((k) => p.delete(k)));
  });

  useHotkey("q", (e) => {
    if (hasAddDialog || isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    navigate("/jobs", { state: { hotkey: "add" } satisfies HotkeyAction });
  });

  useGoToHotkey("h", "/");
  useGoToHotkey("j", "/jobs");
  useGoToHotkey("r", "/resumes");
  useGoToHotkey("f", FOLLOW_UP);
  useGoToHotkey("p", "/performance");
  useGoToHotkey("a", "/activity");
  useGoToHotkey("t", "/terminology");

  // Cmd+F (Ctrl+F on Windows) jumps to the job search instead of the browser's find bar,
  // but only on the jobs list; elsewhere the browser's find bar is left alone.
  useHotkey("f", (e) => {
    if (!onList || overlayOpen()) return;
    const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (!input) return;
    e.preventDefault();
    input.focus();
    input.select();
  }, { mod: true });

  return null;
}
