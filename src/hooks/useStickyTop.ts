import { useEffect, useRef, useState } from "react";

// The `top` for a position: sticky column. One that fits the window sticks `offset` below the top; a taller one
// gets a negative top, so it scrolls with the page until its bottom is `gap` above the window's bottom, then sticks
// there. Put it on every column: the tallest sets the row's height, so it never sticks, and the rest follow it.
export function useStickyTop<T extends HTMLElement>(offset: number, gap: number) {
  const ref = useRef<T>(null);
  const [top, setTop] = useState(offset);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTop(Math.min(offset, window.innerHeight - el.offsetHeight - gap));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [offset, gap]);

  return { ref, style: { top } };
}
