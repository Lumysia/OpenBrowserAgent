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
