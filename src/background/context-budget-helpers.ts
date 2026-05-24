export function latestRealUserMessageIndex<T extends Record<string, unknown>>(
  items: T[],
) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.role !== "user") continue;
    const text =
      messageContentText(item.content) || messagePartsText(item.parts);
    if (!text) continue;
    if (text.includes("<internal_instruction>")) continue;
    if (text.includes("The tool image is attached for visual inspection."))
      continue;
    if (text.includes("<context_pruned>")) continue;
    return index;
  }
  return undefined;
}

export function pruneOpenAIVisionMessages(
  messages: Array<Record<string, unknown>>,
) {
  let keptVisionImages = 0;
  let truncatedToolResults = 0;
  const items = [...messages].reverse().map((message) => {
    if (!Array.isArray(message.content)) return message;
    const result = pruneVisionContentParts(message.content, keptVisionImages);
    keptVisionImages = result.keptVisionImages;
    truncatedToolResults += result.truncatedVisionImages;
    return result.content === message.content
      ? message
      : { ...message, content: result.content };
  });
  return { items: items.reverse(), truncatedToolResults };
}

export function pruneOpenAIResponsesVisionMessages(
  input: Array<Record<string, unknown>>,
) {
  let keptVisionImages = 0;
  let truncatedToolResults = 0;
  const items = [...input].reverse().map((item) => {
    if (!Array.isArray(item.content)) return item;
    const result = pruneVisionContentParts(item.content, keptVisionImages);
    keptVisionImages = result.keptVisionImages;
    truncatedToolResults += result.truncatedVisionImages;
    return result.content === item.content
      ? item
      : { ...item, content: result.content };
  });
  return { items: items.reverse(), truncatedToolResults };
}

export function pruneGeminiVisionMessages(
  contents: Array<Record<string, unknown>>,
) {
  let keptVisionImages = 0;
  let truncatedToolResults = 0;
  const items = [...contents].reverse().map((content) => {
    if (!Array.isArray(content.parts)) return content;
    const result = pruneGeminiParts(content.parts, keptVisionImages);
    keptVisionImages = result.keptVisionImages;
    truncatedToolResults += result.truncatedVisionImages;
    return result.parts === content.parts
      ? content
      : { ...content, parts: result.parts };
  });
  return { items: items.reverse(), truncatedToolResults };
}

function pruneVisionContentParts(content: unknown[], keptVisionImages: number) {
  let truncatedVisionImages = 0;
  const nextContent = content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const record = part as Record<string, unknown>;
    if (!isVisionImagePart(record)) return part;
    keptVisionImages += 1;
    if (keptVisionImages <= 1) return part;
    truncatedVisionImages += 1;
    return {
      type: record.type === "input_image" ? "input_text" : "text",
      text: "[Previous tool image omitted from this request to preserve context budget. Re-capture the page if visual evidence is still needed.]",
    };
  });
  return {
    content: truncatedVisionImages ? nextContent : content,
    keptVisionImages,
    truncatedVisionImages,
  };
}

function isVisionImagePart(record: Record<string, unknown>) {
  if (record.type === "input_image")
    return (
      typeof record.image_url === "string" &&
      record.image_url.startsWith("data:image/")
    );
  if (record.type !== "image_url") return false;
  const imageUrl = record.image_url;
  return (
    imageUrl &&
    typeof imageUrl === "object" &&
    typeof (imageUrl as Record<string, unknown>).url === "string" &&
    String((imageUrl as Record<string, unknown>).url).startsWith("data:image/")
  );
}

function pruneGeminiParts(parts: unknown[], keptVisionImages: number) {
  let truncatedVisionImages = 0;
  const nextParts = parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    const record = part as Record<string, unknown>;
    if (!isGeminiVisionPart(record)) return part;
    keptVisionImages += 1;
    if (keptVisionImages <= 1) return part;
    truncatedVisionImages += 1;
    return {
      text: "[Previous tool image omitted from this request to preserve context budget. Re-capture the page if visual evidence is still needed.]",
    };
  });
  return {
    parts: truncatedVisionImages ? nextParts : parts,
    keptVisionImages,
    truncatedVisionImages,
  };
}

function isGeminiVisionPart(record: Record<string, unknown>) {
  const inlineData = record.inline_data;
  return Boolean(
    inlineData &&
    typeof inlineData === "object" &&
    typeof (inlineData as Record<string, unknown>).data === "string" &&
    String((inlineData as Record<string, unknown>).mime_type || "").startsWith(
      "image/",
    ),
  );
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

function messagePartsText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}
