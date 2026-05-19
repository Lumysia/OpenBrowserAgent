import { ATTACHMENT_KIND } from "../../src/shared/attachments";
import type {
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";

export function selectedElementImageAttachments(
  elements: SelectedElement[],
): UploadedAttachment[] {
  return elements
    .map(selectedElementImageAttachment)
    .filter((item): item is UploadedAttachment => !!item);
}

function selectedElementImageAttachment(
  element: SelectedElement,
): UploadedAttachment | undefined {
  if (!element?.imageDataUrl) return undefined;
  const type = element.imageDataUrl.match(/^data:([^;,]+)/)?.[1] || "image/png";
  return {
    id: `selected-element-image-${element.aiId || crypto.randomUUID()}`,
    name: element.imageAlt || element.tagName || "selected-image",
    type,
    size: dataUrlSize(element.imageDataUrl),
    kind: ATTACHMENT_KIND.image,
    dataUrl: element.imageDataUrl,
  };
}

function dataUrlSize(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}
