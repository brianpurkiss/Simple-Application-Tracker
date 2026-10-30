import type { MouseEvent } from "react";
import type { NavigateFunction } from "react-router-dom";

// Makes a clickable table row behave like a link: plain click navigates in-app,
// cmd/ctrl/shift-click opens it the way the browser would for an <a>; middle-click acts like cmd/ctrl+shift+click.
export function rowLink(navigate: NavigateFunction, to: string, state?: unknown, onOpen?: () => void) {
  // `to` is router-relative; new tabs need the real URL, which includes the deploy base (e.g. the demo's Pages path).
  const href = import.meta.env.BASE_URL.replace(/\/$/, "") + to;
  const openInBrowser = (mods: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">) => {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true,
      metaKey: mods.metaKey, ctrlKey: mods.ctrlKey, shiftKey: mods.shiftKey, altKey: mods.altKey,
    }));
  };
  return {
    onClick: (e: MouseEvent) => {
      onOpen?.();
      if (e.metaKey || e.ctrlKey || e.shiftKey) openInBrowser(e);
      else navigate(to, state === undefined ? undefined : { state });
    },
    // Middle-click acts like cmd/ctrl+shift+click: open in a foreground tab.
    onMouseDown: (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); },
    onAuxClick: (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      window.open(href, "_blank", "noopener");
    },
  };
}
