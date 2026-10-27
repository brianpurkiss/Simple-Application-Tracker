import { useEffect, useRef } from "react";

export function isEditable(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

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
