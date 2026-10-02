const MOVE_MS = 480;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function animateElement(el: HTMLElement, className: string, duration = 400): void {
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), duration);
}

export function pulseElement(el: HTMLElement): void {
  animateElement(el, "splendor-pulse", 480);
}

export function shakeElement(el: HTMLElement): void {
  animateElement(el, "splendor-shake", 420);
}

export function scalePop(el: HTMLElement): void {
  animateElement(el, "splendor-pop", 420);
}

export function fadeIn(el: HTMLElement): void {
  animateElement(el, "splendor-fade-in", 280);
}

export function fadeOut(el: HTMLElement): void {
  animateElement(el, "splendor-fade-out", 240);
}

export function animateNumber(
  onStep: (value: number) => void,
  from: number,
  to: number,
  stepMs?: number
): () => void {
  if (from === to || prefersReducedMotion()) {
    onStep(to);
    return () => {};
  }
  const direction = to > from ? 1 : -1;
  const steps = Math.abs(to - from);
  const pace = stepMs ?? Math.max(32, Math.min(80, Math.floor(640 / steps)));
  let current = from;
  const timer = window.setInterval(() => {
    current += direction;
    onStep(current);
    if (current === to) {
      window.clearInterval(timer);
    }
  }, pace);
  return () => window.clearInterval(timer);
}

export function flyElement(from: DOMRect, to: DOMRect, className: string): void {
  if (prefersReducedMotion() || from.width < 1 || to.width < 1) {
    return;
  }
  const el = document.createElement("div");
  el.className = `splendor-flyer ${className}`;
  el.style.left = `${from.left}px`;
  el.style.top = `${from.top}px`;
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  document.body.appendChild(el);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  window.requestAnimationFrame(() => {
    el.style.transform = `translate(${dx}px, ${dy}px) scale(0.72)`;
    el.style.opacity = "0.05";
  });
  window.setTimeout(() => el.remove(), MOVE_MS + 40);
}

export function createParticles(
  origin: DOMRect,
  options?: { count?: number; color?: string }
): void {
  if (prefersReducedMotion()) {
    return;
  }
  const count = options?.count ?? 8;
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    spark.className = "splendor-particle";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const dist = 16 + Math.random() * 26;
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    spark.style.background = options?.color ?? "#d4b06a";
    spark.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    document.body.appendChild(spark);
    window.setTimeout(() => spark.remove(), 680);
  }
}
