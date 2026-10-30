import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { confirmDialog, DISCARD } from "@/components/ConfirmDialog";

// Asks before leaving the page while there are unsaved changes: in-app navigation gets the styled dialog, reload/close the browser's own prompt.
export function useLeaveGuard(dirty: boolean) {
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirmDialog(DISCARD).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
