// Tests on the page's computed styles that blocks, layout and look share.
// Markup decides first (dom-rules.ts); these are read once per paragraph or
// per candidate, never for every element of the page.

// A box narrower or lower than this doesn't show its text (visually hidden
// labels, icon-only buttons).
export const HIDDEN_BOX_PX = 2;
// Boxes measured separately can differ by this much from rounding alone.
export const SUBPIXEL_PX = 1;
// The line height `normal` stands for, as a share of the font size.
const NORMAL_LINE_HEIGHT = 1.2;

const styleOf = (element: Element) =>
  element.ownerDocument.defaultView!.getComputedStyle(element);

// The box cuts off what overflows it, in either direction.
export function clipsOverflow(style: CSSStyleDeclaration) {
  return /hidden|clip/.test(`${style.overflowX} ${style.overflowY}`);
}

// A flex container laying its items out in a row.
export function isHorizontalFlex(style: CSSStyleDeclaration) {
  return (
    /flex/.test(style.display) && !style.flexDirection.startsWith("column")
  );
}

// A row of items: a horizontal flex box, or a grid with several columns.
export function isRow(style: CSSStyleDeclaration) {
  if (/flex/.test(style.display)) return isHorizontalFlex(style);
  return (
    /grid/.test(style.display) &&
    style.gridTemplateColumns.trim().split(/\s+/).length > 1
  );
}

export function lineHeightOf(style: CSSStyleDeclaration) {
  return (
    parseFloat(style.lineHeight) ||
    parseFloat(style.fontSize) * NORMAL_LINE_HEIGHT
  );
}

export function hasBackground(style: CSSStyleDeclaration) {
  return (
    !/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor) ||
    style.backgroundImage !== "none"
  );
}

// Text set as code: kept as written (white space preserved) in a monospace
// font. Code views and editors draw their lines in plain elements this way;
// both properties are inherited, so the paragraph's own element tells.
const codeViews = new WeakMap<Element, boolean>();
const PRESERVED_SPACE = /^(pre|pre-wrap|break-spaces)$/;
const MONOSPACE = /(^|,)\s*(ui-)?monospace\s*(,|$)/i;

export function isCodeView(element: Element) {
  let known = codeViews.get(element);
  if (known === undefined) {
    const style = styleOf(element);
    known =
      PRESERVED_SPACE.test(style.whiteSpace) &&
      MONOSPACE.test(style.fontFamily);
    codeViews.set(element, known);
  }
  return known;
}

// An icon drawn from a word by the font's ligatures ("home" drawn as a
// house): a font that asks for ligatures explicitly.
const LIGATURES = /"liga"(?!\s+(0|off))/;

export function isLigatureIcon(element: Element) {
  return LIGATURES.test(styleOf(element).fontFeatureSettings);
}

// A box that doesn't show its text: 1px or less (visually hidden labels,
// icon-only buttons), or text for screen readers laid over the page and not
// painted (an alternative text for star icons, a spoken price): fully
// transparent or clipped to nothing. Text in the flow that is transparent
// may be about to fade in. Only for elements that have boxes.
export function isVisuallyHidden(element: Element) {
  const box = element.getBoundingClientRect();
  if (box.width < HIDDEN_BOX_PX || box.height < HIDDEN_BOX_PX) return true;
  const style = styleOf(element);
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  return (
    style.opacity === "0" || /^(circle\(0(px)?|inset\(50%)/.test(style.clipPath)
  );
}
