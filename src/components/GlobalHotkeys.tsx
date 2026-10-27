import { useLocation, useNavigate } from "react-router-dom";
import { isEditable, useHotkey } from "@/lib/hotkeys";

export const FOLLOW_UP = "/?status=followup";
export const SEARCH_INPUT_ID = "job-search";

// Set on navigation state so the jobs list can act once it has mounted.
export type HotkeyAction = { hotkey?: "add" | "search" };

const overlayOpen = () => !!document.querySelector("[role=dialog], [role=listbox]");

function useGoToHotkey(key: string, to: string) {
  const navigate = useNavigate();
  useHotkey(key, (e) => {
    if (isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    navigate(to);
  });
}

// App-wide shortcuts. Job detail handles its own Escape (it guards unsaved changes), and the jobs
// list handles "q" itself when it is already showing, so those are skipped here.
export function GlobalHotkeys() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === "/";

  useHotkey("Escape", (e) => {
    if (isEditable(e.target)) return (e.target as HTMLElement).blur();
    if (!pathname.startsWith("/jobs/")) navigate("/");
  });

  useHotkey("q", (e) => {
    if (onList || isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    navigate("/", { state: { hotkey: "add" } satisfies HotkeyAction });
  });

  useGoToHotkey("h", "/");
  useGoToHotkey("f", FOLLOW_UP);
  useGoToHotkey("p", "/performance");
  useGoToHotkey("a", "/activity");

  // Cmd+F (Ctrl+F on Windows) jumps to the job search instead of the browser's find bar.
  useHotkey("f", (e) => {
    if (overlayOpen()) return;
    e.preventDefault();
    const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    } else navigate("/", { state: { hotkey: "search" } satisfies HotkeyAction });
  }, { mod: true });

  return null;
}
