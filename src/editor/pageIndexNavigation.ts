const highlightTimers = new WeakMap<HTMLElement, number>();

export function focusPageHeading(target: HTMLElement): void {
  const scrollHost = target.closest<HTMLElement>(".workspace-main");
  const hostTop = scrollHost?.getBoundingClientRect().top ?? 0;
  const distance = Math.abs(target.getBoundingClientRect().top - hostTop);

  target.scrollIntoView({
    block: "center",
    behavior: distance > 2_600 ? "auto" : "smooth",
  });

  const previousTimer = highlightTimers.get(target);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  target.classList.remove("editor-page-index-target");
  // Restart the same feedback when the same heading is chosen twice.
  void target.offsetWidth;
  target.classList.add("editor-page-index-target");
  const duration = Math.min(2_200, 650 + Math.pow(distance / 260, 1.35) * 80);
  target.style.setProperty("--page-index-highlight-duration", `${duration}ms`);
  highlightTimers.set(target, window.setTimeout(() => {
    target.classList.remove("editor-page-index-target");
    target.style.removeProperty("--page-index-highlight-duration");
    highlightTimers.delete(target);
  }, duration));
}
