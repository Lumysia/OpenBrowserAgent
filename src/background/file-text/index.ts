import { officeText } from "./office";
import { pdfText } from "./pdf";

// Readable text of a document file (PDF, Word, Excel, PowerPoint,
// OpenDocument), or undefined when the format is not one of them or holds
// no text.
export async function documentText(bytes: Uint8Array) {
  const signature = String.fromCharCode(...bytes.subarray(0, 5));
  try {
    const text =
      signature === "%PDF-"
        ? await pdfText(bytes)
        : signature.startsWith("PK")
          ? await officeText(bytes)
          : undefined;
    return text?.trim() || undefined;
  } catch {
    return undefined;
  }
}
