import {
  eventListeners,
  fakeTabs,
  installChrome,
  type FakeTab,
} from "./fake-chrome";

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
// The tools' browser: `tabs` exist (loaded), the first one active.
export function toolBrowser(open: FakeTab[] = [{ id: 1 }]) {
  const tabs = fakeTabs(
    open.map((tab) => ({
      title: "Fixture",
      url: "https://example.test",
      status: "complete",
      ...tab,
    })),
  );
  const onUpdated = tabs.api.onUpdated;
  const onChanged = eventListeners();
  installChrome({
    tabs: tabs.api,
    scripting: { executeScript: async () => [{ result: {} }] },
    downloads: {
      download: async () => 7,
      cancel: async () => {},
      search: async () => [{ id: 7, state: "complete" }],
      onChanged,
    },
  });
  return { onUpdated, onChanged };
}
