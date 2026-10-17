// What act says happened to the page after its steps, each fact on its
// own: whether it navigated (a new document, a pending one, or a new URL
// in the same document), whether it is still loading, and whether the
// viewport changed. "No visible change" is said only when the page did
// not navigate.

export type PageOutcome = {
  // The steps loaded a new document: refs from before are gone.
  newPage: boolean;
  // The tab is still loading.
  loading: boolean;
  // A navigation the tab has started but not committed yet.
  pendingUrl?: string;
  // The URL changed without a new document (a route change).
  urlChanged: boolean;
  title?: string;
  url: string;
  // What changed in the viewport (empty when nothing did).
  changes: string[];
  // Something else answers "did it do anything": a failure, dialogs, new
  // tabs, downloads, or steps that only scroll or wait.
  otherwiseReported: boolean;
};

export function pageOutcomeLines(outcome: PageOutcome): string[] {
  const at = `${outcome.title || "(untitled)"} | ${outcome.url}`;
  if (outcome.newPage)
    return [
      outcome.loading
        ? `New page still loading: ${outcome.url}. Refs from before are gone: take a snapshot when it has loaded.`
        : `New page: ${at}. Refs from before are gone: take a snapshot.`,
    ];
  if (outcome.pendingUrl)
    return [
      `Navigating to ${outcome.pendingUrl}, still loading. Take a snapshot when it has loaded; refs from before will be gone.`,
    ];
  const lines = outcome.urlChanged
    ? [`Same page, new URL: ${at}. Refs still work.`]
    : [];
  if (outcome.changes.length) return [...lines, ...outcome.changes];
  if (outcome.otherwiseReported) return lines;
  return [
    ...lines,
    outcome.urlChanged
      ? `Nothing in the viewport changed yet${outcome.loading ? " and the page is still loading" : ""}: wait for the text you expect, or take a snapshot.`
      : "No visible change in the viewport, and no navigation. Check with snapshot or find if you expected one.",
  ];
}
