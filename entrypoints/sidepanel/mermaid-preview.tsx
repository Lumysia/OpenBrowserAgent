import { useEffect, useState } from "react";
import { useMessages } from "../../src/ui/messages";
import { MERMAID_PNG_SCALE } from "../../src/shared/config";
import { Button, Feedback } from "../../src/ui/components";
import { downloadBlob } from "../../src/ui/download";
import { useAppliedTheme } from "../../src/ui/theme";
import { cn } from "../../src/ui/utils";
import {
  drawnMermaid,
  mermaidPng,
  renderMermaid,
  svgDataUrl,
  type MermaidDiagram,
} from "./mermaid-render";

const FILENAME = "mermaid-diagram";

type Drawing =
  | { status: "drawing" }
  | { status: "drawn"; diagram: MermaidDiagram }
  | { status: "failed" };

// A Mermaid block of a settled answer, drawn in the side panel. If the
// source does not parse, it is shown as code.
export function MermaidPreview({ code }: { code: string }) {
  const t = useMessages();
  const theme = useAppliedTheme();
  const drawing = useMermaid(code, theme);

  if (drawing.status === "failed")
    return (
      <>
        <Feedback>{t.sidepanel.mermaidRenderFailed}</Feedback>
        <pre>
          <code>{code}</code>
        </pre>
      </>
    );

  const diagram = drawing.status === "drawn" ? drawing.diagram : undefined;
  return (
    <>
      <div className={cn("mermaid-preview", !diagram && "ui-skeleton")}>
        {diagram && (
          <img
            src={svgDataUrl(diagram.svg)}
            width={diagram.width}
            height={diagram.height}
            alt={t.sidepanel.mermaidPreview}
          />
        )}
      </div>
      <div className="mermaid-preview-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={!diagram}
          onClick={() =>
            diagram &&
            downloadBlob(
              new Blob([diagram.svg], { type: "image/svg+xml" }),
              `${FILENAME}.svg`,
            )
          }
        >
          {t.sidepanel.downloadMermaidSvg}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!diagram}
          onClick={() =>
            diagram &&
            mermaidPng(diagram, MERMAID_PNG_SCALE)
              .then((png) => downloadBlob(png, `${FILENAME}.png`))
              .catch(console.warn)
          }
        >
          {t.sidepanel.downloadMermaidPng}
        </Button>
      </div>
    </>
  );
}

// A theme change keeps the last drawing up until the new one is ready.
function useMermaid(code: string, theme: string) {
  const [drawing, setDrawing] = useState<Drawing>(() => {
    const diagram = drawnMermaid(code, theme);
    return diagram ? { status: "drawn", diagram } : { status: "drawing" };
  });
  useEffect(() => {
    let current = true;
    renderMermaid(code, theme).then(
      (diagram) => current && setDrawing({ status: "drawn", diagram }),
      () => current && setDrawing({ status: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [code, theme]);
  return drawing;
}
