import { useSearchParams } from "react-router-dom";

// Edits the URL's query string in place (replacing the history entry) so filters survive reloads and sharing.
export function useParamUpdater() {
  const [, setParams] = useSearchParams();
  return (update: (p: URLSearchParams) => void) =>
    setParams((p) => {
      update(p);
      return p;
    }, { replace: true });
}
