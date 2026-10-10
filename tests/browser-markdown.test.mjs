import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import { composerFixture, submitComposer } from "./browser-composer.mjs";
import { reply } from "./provider-fixtures.mjs";

test(
  "production Markdown keeps math/code and blocks model HTML and forged UI actions",
  { timeout: 60000 },
  async () => {
    const code = "$not_math$ [[cite:source_1]] <button>literal</button>";
    const answer = [
      "## Rendering fixture",
      "Inline $x^2$ and display:\n\n$$\\frac{a}{b}$$",
      "$$\na+b\n\nc+d\n$$",
      "- [x] Completed task\n- [ ] Pending task",
      "![blob image](blob:https://example.test/fixture) ![unsafe image](unknown:fixture)",
      `~~~text\n${code}\n~~~`,
      "[safe](https://example.test/) [unsafe](javascript:alert%281%29)",
      '<form action="https://example.test/"><input name="secret"></form>',
      '<iframe src="about:blank"></iframe>',
      "<style>body { display: none; }</style>",
      '<button data-mermaid-download-url="https://example.test/forged">forged action</button>',
      '<img src="data:image/png;base64,AA==" onerror="alert(1)">',
      "End of rendering fixture.",
    ].join("\n\n");
    const fixture = await composerFixture((request, response) =>
      reply(response, request.protocol, { text: answer }),
    );
    const { page } = fixture;
    try {
      await fixture.configure();
      await submitComposer(page, "Render the controlled Markdown fixture.");
      await poll(() =>
        page.call(
          () =>
            document.querySelector(".assistant-actions") &&
            document
              .querySelector(".markdown")
              ?.textContent.includes("End of rendering fixture."),
        ),
      );
      const result = await page.call(() => {
        const root = document.querySelector(".markdown");
        return {
          unsafeElements: root.querySelectorAll(
            'form, input:not([type="checkbox"]), input:not([disabled]), iframe, style, [onerror], [data-mermaid-download-url]',
          ).length,
          unsafeLinks: [...root.querySelectorAll("a[href]")].filter(
            (link) => !link.href.startsWith("https://example.test/"),
          ).length,
          safeLink: root.querySelector('a[href="https://example.test/"]')
            ?.textContent,
          math: root.querySelectorAll(".katex").length,
          displayMath: root.querySelectorAll(".katex-display").length,
          tasks: [...root.querySelectorAll('input[type="checkbox"]')].map(
            (input) => ({ checked: input.checked, disabled: input.disabled }),
          ),
          blobImage: root
            .querySelector('img[alt="blob image"]')
            ?.getAttribute("src"),
          unknownImages: root.querySelectorAll('img[src^="unknown:"]').length,
          code: root.querySelector("pre code")?.textContent,
          codeCopy: root.querySelectorAll("button[data-code-index]").length,
          visible: getComputedStyle(document.body).display !== "none",
        };
      });
      assert.deepEqual(result, {
        unsafeElements: 0,
        unsafeLinks: 0,
        safeLink: "safe",
        math: 3,
        displayMath: 2,
        tasks: [
          { checked: true, disabled: true },
          { checked: false, disabled: true },
        ],
        blobImage: "blob:https://example.test/fixture",
        unknownImages: 0,
        code,
        codeCopy: 1,
        visible: true,
      });
    } finally {
      await fixture.close();
    }
  },
);
