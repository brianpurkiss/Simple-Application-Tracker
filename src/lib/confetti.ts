import confetti from "canvas-confetti";
import { prefersReducedMotion } from "./motion";

/** Small burst launched from the center of an element (e.g. the save button). `angle` is degrees, 90 = straight up, 135 = up-left. */
export function burstFrom(el: HTMLElement, angle = 90) {
  if (prefersReducedMotion()) return;
  const r = el.getBoundingClientRect();
  confetti({
    particleCount: 60,
    angle,
    spread: 70,
    startVelocity: 35,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
    zIndex: 9999,
  });
}

/** Big celebration: cannons from both sides plus confetti raining down the page. */
export function celebrate(duration = 4000) {
  if (prefersReducedMotion()) return;
  const end = Date.now() + duration;
  const base = { zIndex: 9999, disableForReducedMotion: true };
  const frame = () => {
    confetti({ ...base, particleCount: 6, angle: 60, spread: 65, startVelocity: 60, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: 6, angle: 120, spread: 65, startVelocity: 60, origin: { x: 1, y: 0.7 } });
    confetti({ ...base, particleCount: 4, angle: 270, spread: 120, startVelocity: 15, gravity: 0.8, ticks: 300, origin: { x: Math.random(), y: -0.1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
