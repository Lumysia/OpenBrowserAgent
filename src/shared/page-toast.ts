// Colours for the short notes the extension shows on web pages (copied as
// Markdown, page translation problems). Dependency-free: page scripts
// import the types.

export type PageToastColors = {
  background: string;
  foreground: string;
  border: string;
  accent: string;
  error: string;
  shadow: string;
};

export type PageToastTheme = {
  scheme: "light" | "dark" | "system";
  light: PageToastColors;
  dark: PageToastColors;
};

export type PageToastOptions = {
  // "error" notes are marked in the theme's error colour and announced at once.
  tone: "info" | "error";
  durationMs: number;
};

// A short note at the top of the page, in a closed shadow root out of the
// page's styles and scripts; it fades out after `durationMs`. `onHost`
// gets its host element, to take it away sooner. Self-contained and
// returning nothing: the background runs it in pages with
// scripting.executeScript, page scripts call it directly.
export function showPageToast(
  message: string,
  theme: PageToastTheme,
  options: PageToastOptions,
  onHost?: (host: HTMLElement) => void,
) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const dark =
    theme.scheme === "dark" ||
    (theme.scheme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = dark ? theme.dark : theme.light;
  const error = options.tone === "error";
  const note = document.createElement("div");
  note.setAttribute("role", error ? "alert" : "status");
  note.textContent = message;
  note.style.cssText = [
    "all:initial",
    "position:fixed",
    "z-index:2147483647",
    "top:16px",
    "right:16px",
    "max-width:min(380px,calc(100vw - 32px))",
    "box-sizing:border-box",
    "padding:10px 14px",
    "border-radius:10px",
    `border:1px solid ${colors.border}`,
    `border-left:4px solid ${error ? colors.error : colors.accent}`,
    `background:${colors.background}`,
    `color:${colors.foreground}`,
    "font:500 13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
    `box-shadow:0 8px 24px ${colors.shadow}`,
    "transition:opacity .2s ease",
    "pointer-events:none",
  ].join(";");
  root.append(note);
  onHost?.(host);
  document.documentElement.append(host);
  setTimeout(() => {
    note.style.opacity = "0";
    setTimeout(() => host.remove(), 250);
  }, options.durationMs);
}
