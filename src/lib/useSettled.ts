import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

export type Phase = "in" | "out";

/**
 * Lags `value` behind by `outMs` so the UI can play an "out" animation (phase "out") before the new
 * value is shown and the "in" animation starts. `key` must change whenever `value` meaningfully does.
 */
export function useSettled<T>(value: T, key: string, outMs = 200): { shown: T; phase: Phase } {
  const [shown, setShown] = useState(value);
  const [phase, setPhase] = useState<Phase>("in");
  const shownKey = useRef(key);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (key === shownKey.current) {
      setPhase("in");
      return;
    }
    if (prefersReducedMotion()) {
      shownKey.current = key;
      setShown(latest.current);
      return;
    }
    setPhase("out");
    const t = setTimeout(() => {
      shownKey.current = key;
      setShown(latest.current);
      setPhase("in");
    }, outMs);
    return () => clearTimeout(t);
  }, [key, outMs]);

  return { shown, phase };
}
