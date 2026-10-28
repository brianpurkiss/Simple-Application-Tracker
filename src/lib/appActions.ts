import { useLocation, useNavigate } from "react-router-dom";

export const SEARCH_INPUT_ID = "job-search";

// Set on navigation state so the page that owns the control can act once it has mounted.
export type HotkeyAction = { hotkey?: "add" | "search" };

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

// Opens the add-job dialog, which Home and the jobs list mount. Stays on those pages; otherwise goes to the list.
export function useAddJob() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return () => {
    const here = pathname === "/" || pathname === "/jobs";
    navigate(here ? pathname + search : "/jobs", { replace: here, state: { hotkey: "add" } satisfies HotkeyAction });
  };
}
