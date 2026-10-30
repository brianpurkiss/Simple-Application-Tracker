import { useSearchParams } from "react-router-dom";

// Edits the URL's query string in place (replacing the history entry) so filters survive reloads and sharing.
// Starts from the live URL, not the last render's params: the router applies updates in a transition, so a second
// edit fired before that render (fast typing) would otherwise overwrite the first one's changes.
export function useParamUpdater() {
  const [, setParams] = useSearchParams();
  return (update: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(window.location.search);
    update(p);
    setParams(p, { replace: true });
  };
}
