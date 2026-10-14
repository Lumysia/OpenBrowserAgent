import motionCss from "./styles/motion.css?inline";
import pageSurfaceCss from "./styles/page-surface.css?inline";
import tokensCss from "./styles/tokens.css?inline";

// The style sheet of our UI inside web pages, for a closed shadow root: the
// page's styles stop at the host, and the element with `rootClass` stands in
// for :root in the tokens, the motion and `rootSheets`; applyTheme() sets
// the theme on it. `sheets` follow as they are.
export function pageShadowCss(
  rootClass: string,
  rootSheets: string[],
  sheets: string[],
) {
  return [
    ":host { all: initial !important; }",
    ...[tokensCss, motionCss, ...rootSheets].map((css) =>
      css.replaceAll(":root", `.${rootClass}`),
    ),
    pageSurfaceCss,
    ...sheets,
  ].join("\n");
}
