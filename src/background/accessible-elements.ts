import { getBrowserApi } from "../shared/storage";

export async function findAccessibleElements(tabId: number) {
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId },
    func: () => {
      const selectors = [
        "a",
        "button",
        "input",
        "textarea",
        "img",
        '[contenteditable="true"]',
        "[aria-label]",
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="tab"]',
        '[role="listitem"]',
        "[tabindex]",
      ].join(", ");
      const elements: Array<{
        type: string;
        id: string;
        properties: Record<string, unknown>;
      }> = [];
      Array.from(document.querySelectorAll(selectors)).forEach((element) => {
        const htmlElement = element as
          | HTMLAnchorElement
          | HTMLImageElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLElement;
        const tag = htmlElement.tagName.toLowerCase();
        const style = getComputedStyle(htmlElement);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          tag === "img" ||
          (tag === "a" &&
            (!(htmlElement as HTMLAnchorElement).href ||
              /^(javascript:|mailto:|tel:|data:|blob:|about:|chrome:|#)/i.test(
                (htmlElement as HTMLAnchorElement).href,
              ))) ||
          (tag === "input" &&
            (htmlElement as HTMLInputElement).type === "hidden")
        ) {
          return;
        }

        let id = htmlElement.getAttribute("data-ai-id");
        if (!id) {
          id = `ai-id-${Math.random().toString(36).substring(2, 8)}`;
          htmlElement.setAttribute("data-ai-id", id);
        }

        let type =
          (
            {
              img: "image",
              a: "link",
              button: "button",
              textarea: "textarea",
              input: "input",
            } as Record<string, string>
          )[tag] || tag;
        if (htmlElement.hasAttribute("contenteditable"))
          type = "contentEditable";

        const properties: Record<string, unknown> = {};
        if (type === "button")
          properties.buttonType = (htmlElement as HTMLButtonElement).type;
        if (type === "input") {
          const input = htmlElement as HTMLInputElement;
          if (input.type) properties.inputType = input.type;
          if (input.placeholder) properties.placeholder = input.placeholder;
        }
        const ariaLabel = htmlElement.getAttribute("aria-label");
        if (ariaLabel) properties.ariaLabel = ariaLabel;
        else if (type === "image")
          properties.alt = (htmlElement as HTMLImageElement).alt || "";
        const role = htmlElement.getAttribute("role");
        if (role) properties.role = role;
        if (type === "input" || type === "textarea")
          properties.value = (
            htmlElement as HTMLInputElement | HTMLTextAreaElement
          ).value;
        else if (type === "contentEditable")
          properties.value = htmlElement.innerHTML;
        if (type === "link")
          properties.href = (htmlElement as HTMLAnchorElement).href;
        if (type !== "image") {
          const content = (htmlElement.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          if (content) properties.content = content.slice(0, 240);
        } else properties.alt = (htmlElement as HTMLImageElement).alt;
        elements.push({ type, id, properties });
      });
      return elements;
    },
  });
  return result.result || [];
}
