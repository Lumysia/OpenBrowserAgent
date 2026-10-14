// The English name of a language setting, for prompts that tell the model
// which language to reply in. The full tag keeps variants apart (Chinese
// (Taiwan) vs (China)).
export function languageName(code: string) {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(
        code.replace("_", "-"),
      ) || "English"
    );
  } catch {
    return "English";
  }
}
