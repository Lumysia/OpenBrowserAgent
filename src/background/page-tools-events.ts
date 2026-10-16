// "A tab's page tools may have changed": a page was translated or shown in
// the original, its subtitles started or stopped. The right-click menu and
// the toolbar menu read the state again.
const listeners = new Set<() => void>();

export function onPageToolsChanged(listener: () => void) {
  listeners.add(listener);
}

export function pageToolsChanged() {
  for (const listener of listeners) listener();
}
