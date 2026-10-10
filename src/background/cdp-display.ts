import {
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_SCREENSHOT_QUALITY,
} from "../shared/config";
import type { CdpSend } from "./cdp-session";

export async function takeCdpScreenshot(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  const format =
    args.format === "png" || args.format === "webp"
      ? args.format
      : DEFAULT_SCREENSHOT_FORMAT;
  const quality = Number(args.quality);
  const fullPage = args.fullPage === true;
  let clip;
  if (fullPage) {
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    if (!size || !(size.width > 0) || !(size.height > 0))
      throw new Error("Page content dimensions are unavailable.");
    clip = {
      x: size.x || 0,
      y: size.y || 0,
      width: size.width,
      height: size.height,
      scale: 1,
    };
  }
  const result = await send("Page.captureScreenshot", {
    format,
    ...(format === "png"
      ? {}
      : {
          quality: Number.isFinite(quality)
            ? Math.min(100, Math.max(0, Math.trunc(quality)))
            : DEFAULT_SCREENSHOT_QUALITY,
        }),
    fromSurface: true,
    captureBeyondViewport: fullPage,
    ...(clip ? { clip } : {}),
  });
  const image = `data:image/${format};base64,${result.data}`;
  return {
    success: true,
    format,
    fullPage,
    image,
    _visionImage: { dataUrl: image, type: `image/${format}` },
    note: "Screenshot pixels will be sent to the next model call as a vision image.",
  };
}

export async function emulateCdpPage(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  let viewport;
  if (args.viewport !== undefined) {
    const match = String(args.viewport)
      .trim()
      .match(/^(\d+)[x,](\d+)(?:[x,](\d+(?:\.\d+)?))?(?:,(mobile))?$/i);
    if (!match) throw new Error("Invalid viewport. Use WxH[xDPR][,mobile].");
    viewport = {
      width: Number(match[1]),
      height: Number(match[2]),
      deviceScaleFactor: Number(match[3] || 1),
      mobile: !!match[4],
    };
  } else if (args.width !== undefined || args.height !== undefined) {
    viewport = {
      width: Number(args.width),
      height: Number(args.height),
      deviceScaleFactor: 1,
      mobile: false,
    };
  }
  if (
    viewport &&
    (!Number.isInteger(viewport.width) ||
      !Number.isInteger(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0 ||
      viewport.width > 10000000 ||
      viewport.height > 10000000 ||
      !(viewport.deviceScaleFactor > 0))
  )
    throw new Error(
      "Viewport dimensions and device scale must be positive and valid.",
    );
  const colorScheme = args.colorScheme;
  if (
    colorScheme !== undefined &&
    !["dark", "light", "auto"].includes(String(colorScheme))
  )
    throw new Error("Invalid color scheme.");
  if (!viewport && args.userAgent === undefined && colorScheme === undefined)
    throw new Error("Provide viewport, userAgent, colorScheme, or reset=true.");
  if (viewport) await send("Emulation.setDeviceMetricsOverride", viewport);
  if (args.userAgent !== undefined)
    await send("Network.setUserAgentOverride", {
      userAgent: String(args.userAgent),
    });
  if (colorScheme !== undefined)
    await send("Emulation.setEmulatedMedia", {
      features:
        colorScheme === "auto"
          ? []
          : [{ name: "prefers-color-scheme", value: colorScheme }],
    });
  return {
    success: true,
    ...(viewport ? { viewport } : {}),
    note: "Emulation remains active until reset=true, debugger detach, or tab closure.",
  };
}
