import { base64ToBytes, bytesToBase64 } from "../../shared/binary";
import { DEFAULT_SCREENSHOT_QUALITY } from "../../shared/config";

// Crops of the viewport for screenshots of one element or region, in CSS
// pixels of the viewport, so a point in the image maps back to a point the
// act tool can click.

export type Box = { x: number; y: number; width: number; height: number };

// Space around an element's box, and the most a crop is enlarged.
const ELEMENT_MARGIN_PX = 8;
export const MAX_ZOOM = 4;
// Longest edge of a crop's image.
const CROP_MAX_EDGE = 2_000;

const clampTo = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

// The part of `box` (grown by `margin`) inside the viewport, in whole
// pixels; undefined when none of it is.
export function visibleBox(
  box: Box,
  viewport: { width: number; height: number },
  margin = 0,
): Box | undefined {
  const left = clampTo(Math.floor(box.x - margin), 0, viewport.width);
  const top = clampTo(Math.floor(box.y - margin), 0, viewport.height);
  const right = clampTo(
    Math.ceil(box.x + box.width + margin),
    0,
    viewport.width,
  );
  const bottom = clampTo(
    Math.ceil(box.y + box.height + margin),
    0,
    viewport.height,
  );
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const elementBox = (
  rect: Box,
  viewport: { width: number; height: number },
) => visibleBox(rect, viewport, ELEMENT_MARGIN_PX);

// The zoom asked for, from 1 to MAX_ZOOM, and small enough that the image
// stays within CROP_MAX_EDGE.
export function cropZoom(requested: unknown, box: Box) {
  const zoom = clampTo(Number(requested) || 1, 1, MAX_ZOOM);
  return Math.min(zoom, CROP_MAX_EDGE / Math.max(box.width, box.height));
}

async function bitmapOf(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const type = header.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
  return createImageBitmap(new Blob([base64ToBytes(data)], { type }));
}

// The width in pixels of an image.
export async function imageWidth(dataUrl: string) {
  const bitmap = await bitmapOf(dataUrl);
  const { width } = bitmap;
  bitmap.close();
  return width;
}

// Crops a capture of the whole viewport to `box`, scaled by `zoom`.
export async function cropCapture(
  dataUrl: string,
  box: Box,
  viewportWidth: number,
  zoom: number,
) {
  const bitmap = await bitmapOf(dataUrl);
  // Captures are in device pixels.
  const ratio = bitmap.width / viewportWidth;
  const width = Math.round(box.width * zoom);
  const height = Math.round(box.height * zoom);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.drawImage(
    bitmap,
    box.x * ratio,
    box.y * ratio,
    box.width * ratio,
    box.height * ratio,
    0,
    0,
    width,
    height,
  );
  bitmap.close();
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: DEFAULT_SCREENSHOT_QUALITY / 100,
  });
  return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}
