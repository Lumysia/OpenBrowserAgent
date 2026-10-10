import { isVisionImageMimeType } from "../shared/attachments";
import {
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_FILE_MAX_LIMIT,
} from "../shared/config";
import { bytesToBase64 } from "../shared/binary";
import { clampToolOffset } from "./tool-utils";

export async function readFileFromUrl(
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const url = String(input.url || "").trim();
  if (!url) return { error: "Missing file URL" };
  try {
    // Fetch handles HTTP and data URLs consistently, including percent-encoded
    // UTF-8. ArrayBuffer conversion also works in MV3 workers without FileReader.
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error(`Failed to fetch file: ${response.status}`);
    const blob = await response.blob();
    signal?.throwIfAborted();
    const type = blob.type || "application/octet-stream";
    const size = blob.size;
    const format = String(input.format || "auto");
    const offset = clampToolOffset(input.offset);
    const requestedLimit = Number(input.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(READ_FILE_MAX_LIMIT, Math.max(1, Math.trunc(requestedLimit)))
      : READ_ATTACHMENT_DEFAULT_LIMIT;
    const slice = (content: string, field: string, encoding: string) => ({
      success: true,
      url,
      type,
      size,
      encoding,
      offset,
      limit,
      totalLength: content.length,
      truncated: offset + limit < content.length,
      [field]: content.slice(offset, offset + limit),
    });
    if (format === "text" || (format === "auto" && isTextType(type, url))) {
      const text = await blob.text();
      signal?.throwIfAborted();
      return slice(text, "text", "text");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    signal?.throwIfAborted();
    if (format === "auto" && isVisionImageMimeType(type))
      return {
        success: true,
        url,
        type,
        size,
        _visionImage: {
          dataUrl: `data:${type};base64,${bytesToBase64(bytes)}`,
          type,
          url,
          size,
        },
        note: "Image pixels will be sent to the next model call as a vision image.",
      };
    const encoding = format === "hex" ? "hex" : "base64";
    return {
      ...slice(
        encoding === "hex"
          ? Array.from(bytes, (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("")
          : bytesToBase64(bytes),
        encoding,
        encoding,
      ),
      note: "Binary file content is provided as a slice. If this is PDF, Office, audio, or video, semantic understanding may require a provider-specific file parser/transcription tool.",
    };
  } catch (error) {
    signal?.throwIfAborted();
    return {
      error: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

function isTextType(type: string, url: string) {
  return (
    type.startsWith("text/") ||
    /\b(json|xml|yaml|csv|markdown|javascript|svg\+xml)\b/i.test(type) ||
    /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|ya?ml|html?|css|js|svg)(\?|#|$)/i.test(
      url,
    )
  );
}
