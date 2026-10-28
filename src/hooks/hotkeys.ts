import { useEffect, useRef } from "react";

export function isEditable(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export const overlayOpen = () => !!document.querySelector("[role=dialog], [role=listbox]");

// Page-level shortcut for a single key. Skips events already handled elsewhere (Radix layers and
// the combo field call preventDefault on Escape). With `mod`, the key must be pressed with cmd
// (or ctrl); without it, keys pressed with modifiers are skipped.
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, { mod = false } = {}) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || (e.metaKey || e.ctrlKey) !== mod || e.altKey) return;
      if (e.key.toLowerCase() === key.toLowerCase()) ref.current(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod]);
}

// Two-key sequence: `first`, then one of the `bindings` keys within `timeout` ms. Ignored while typing
// or with a dialog open. Listens in the capture phase and consumes the second key, so page-level
// handlers for the same letter (like "j" on the jobs list) don't also fire.
export function useSequence(first: string, bindings: Record<string, () => void>, timeout = 1500) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    let armedAt = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target) || overlayOpen()) {
        armedAt = 0;
        return;
      }
      const key = e.key.toLowerCase();
      if (armedAt && Date.now() - armedAt < timeout) {
        armedAt = 0;
        const run = ref.current[key];
        if (run) {
          e.preventDefault();
          e.stopPropagation();
          run();
          return;
        }
      }
      armedAt = key === first ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [first, timeout]);
}
