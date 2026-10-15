// Scrolls the element with `id` into view once it renders, such as an item
// just added and opened.
export function revealElement(id: string) {
  requestAnimationFrame(() =>
    document
      .getElementById(id)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
  );
}
