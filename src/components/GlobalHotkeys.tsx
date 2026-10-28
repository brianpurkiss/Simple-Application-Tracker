import { useLocation, useNavigate } from "react-router-dom";
import { useParamUpdater } from "@/lib/useParamUpdater";
import { isEditable, overlayOpen, useHotkey, useSequence } from "@/lib/hotkeys";
import { SEARCH_INPUT_ID, useAddJob, useFocusSearch } from "@/lib/appActions";
import { GO_TO } from "@/lib/shortcuts";
import { usePalette } from "@/components/CommandPalette";

// URL params that count as an active search/filter on each page (sort and view settings are not).
const FILTER_PARAMS: Record<string, string[]> = {
  "/jobs": ["q", "status", "type", "fit", "company_type", "resume"],
  "/performance": ["metric", "versions", "conf", "recency", "min", "with"],
  "/activity": ["job_type", "company_type", "resume", "versions"],
};

// App-wide shortcuts. Single keys are ignored while typing or with a dialog open; the palette keys
// work from anywhere. The jobs list handles its own row keys (J/K, Enter, L).
export function GlobalHotkeys() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const updateParams = useParamUpdater();
  const palette = usePalette();
  const addJob = useAddJob();
  const focusSearch = useFocusSearch();
  const onList = pathname === "/jobs";

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

  // "G" then a letter jumps to a page.
  useSequence("g", Object.fromEntries(GO_TO.map((g) => [g.key, () => navigate(g.to)])));

  const plain = (run: () => void) => (e: KeyboardEvent) => {
    if (isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    run();
  };
  useHotkey("c", plain(addJob));
  useHotkey("/", plain(focusSearch));
  useHotkey("?", plain(() => navigate("/shortcuts")));

  // Cmd+K opens the command palette from anywhere, including inside fields; Cmd+P is an alias that
  // replaces the browser's print dialog. Pressing it again closes it.
  const togglePalette = (e: KeyboardEvent) => {
    if (overlayOpen() && !palette.isOpen()) return;
    e.preventDefault();
    palette.toggle();
  };
  useHotkey("k", togglePalette, { mod: true });
  useHotkey("p", togglePalette, { mod: true });

  return null;
}
