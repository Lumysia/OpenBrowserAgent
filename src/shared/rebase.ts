import { mergeChanges } from "./sync/merge-content";

// A page's edit stored over a value another context changed since the page
// read it (a sync download, an agent tool): `edited` was made from `base`,
// `current` is what storage holds now. Each part takes the side that
// changed it, the edit's where both did (see mergeChanges). Without this, a
// page writing its whole copy would undo changes it had not seen yet.
export function rebaseEdit<T>(base: T, edited: T, current: T): T {
  return mergeChanges(base, edited, current);
}

type EditableItem<T> = {
  update(updater: (current: T) => T): Promise<unknown>;
};

// Store a page's edit made from `base`, keeping what changed meanwhile.
export function storeEdit<T>(item: EditableItem<T>, base: T, edited: T) {
  return item.update((current) => rebaseEdit(base, edited, current));
}
