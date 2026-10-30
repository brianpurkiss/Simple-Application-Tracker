import { useLocation, useNavigate } from "react-router-dom";

export const SEARCH_INPUT_ID = "job-search";

// Set on navigation state so the page that owns the control can act once it has mounted.
export type HotkeyAction = { hotkey?: "search" };

// Focuses the job search, first navigating to the jobs list when elsewhere.
export function useFocusSearch() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return () => {
    const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (pathname === "/jobs" && input) {
      input.focus();
      input.select();
    } else {
      navigate("/jobs", { state: { hotkey: "search" } satisfies HotkeyAction });
    }
  };
}

// Opens the Quick Add dialog, which the app mounts once, so it works from any page without navigating
// (a navigation would trip a page's unsaved-changes guard and drop its location state).
const QUICK_ADD = "app:quick-add";
export function useAddJob() {
  return () => window.dispatchEvent(new Event(QUICK_ADD));
}
export function onQuickAdd(open: () => void) {
  window.addEventListener(QUICK_ADD, open);
  return () => window.removeEventListener(QUICK_ADD, open);
}
