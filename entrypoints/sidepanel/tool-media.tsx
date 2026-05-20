import { Copy, Download } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { Button } from "../../src/ui/components";

export function GeneratedImage({
  output,
  loading,
  t,
}: {
  output: Record<string, unknown>;
  loading: boolean;
  t: Messages;
}) {
  const image = stringValue(output.image);
  const prompt = stringValue(output.prompt);
  if (loading) return <div className="generated-image-skeleton ui-skeleton" />;
  if (!image || output.error) return null;
  const canCopyImage =
    image.startsWith("data:") && typeof ClipboardItem !== "undefined";
  async function copyImage() {
    if (!canCopyImage) return;
    const blob = await (await fetch(image)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }
  return (
    <div className="generated-image-result">
      <img src={image} alt={prompt || t.sidepanel.generatedImage} />
      <div className="row">
        <a
          className="ui-button ui-button-secondary ui-button-sm generated-image-download"
          href={image}
          download="generated-image.png"
        >
          <Download size={14} /> {t.sidepanel.downloadGeneratedImage}
        </a>
        {canCopyImage && (
          <Button variant="secondary" size="sm" onClick={copyImage}>
            <Copy size={14} /> {t.sidepanel.copyImage}
          </Button>
        )}
        {prompt && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(prompt)}
          >
            <Copy size={14} /> {t.sidepanel.copyPrompt}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CapturedTabImage({
  output,
  t,
}: {
  output: Record<string, unknown>;
  t: Messages;
}) {
  const image = stringValue(output.image);
  const format = stringValue(output.format) || "png";
  if (!image || output.error) return null;
  const canCopyImage =
    image.startsWith("data:") && typeof ClipboardItem !== "undefined";
  async function copyImage() {
    if (!canCopyImage) return;
    const blob = await (await fetch(image)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }
  return (
    <div className="generated-image-result">
      <img src={image} alt={t.sidepanel.capturedTabImage} />
      <div className="row">
        <a
          className="ui-button ui-button-secondary ui-button-sm generated-image-download"
          href={image}
          download={`tab-screenshot.${format}`}
        >
          <Download size={14} /> {t.sidepanel.downloadCapturedTabImage}
        </a>
        {canCopyImage && (
          <Button variant="secondary" size="sm" onClick={copyImage}>
            <Copy size={14} /> {t.sidepanel.copyImage}
          </Button>
        )}
      </div>
    </div>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
