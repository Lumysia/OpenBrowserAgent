export type MutationRequest = {
  operations: MutationOperation[];
};

export type MutationOperation = {
  operation: string;
  target: {
    aiId: string;
    selector: string;
    text: string;
    ariaLabel: string;
    selected: boolean;
  };
  value: string;
  node: Record<string, unknown>;
  attribute: string;
  position: string;
  dedupeKey: string;
  skipIfExistsSelector: string;
  openLinksInNewTab: boolean;
  scroll: { direction: string; x?: number; y?: number; behavior: string };
  key: {
    key: string;
    code: string;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  };
};

export function buildMutationRequest(args: Record<string, unknown>) {
  const operations = Array.isArray(args.operations)
    ? args.operations
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .slice(0, 10)
    : [];
  return {
    operations: operations.length
      ? operations.map((operation) =>
          buildMutationOptions({ ...args, ...operation }),
        )
      : [buildMutationOptions(args)],
  } satisfies MutationRequest;
}

export function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isNewTabRequest(
  output: unknown,
): output is { newTab: true; url: string } {
  return (
    !!output &&
    typeof output === "object" &&
    (output as { newTab?: unknown }).newTab === true &&
    typeof (output as { url?: unknown }).url === "string"
  );
}

function buildMutationOptions(args: Record<string, unknown>) {
  const target = objectInput(args.target);
  return {
    operation: stringInput(args.operation || args.action),
    target: {
      aiId: stringInput(target.aiId ?? target.id ?? args.aiId ?? args.id),
      selector: stringInput(target.selector ?? args.selector),
      text: stringInput(target.text ?? args.text),
      ariaLabel: stringInput(
        target.ariaLabel ??
          target.label ??
          target.accessibleName ??
          target.title ??
          target.placeholder ??
          args.ariaLabel ??
          args.label,
      ),
      selected: target.selected === true || args.selected === true,
    },
    value: textInput(args.value ?? args.text ?? args.html),
    node: objectInput(args.node),
    attribute: stringInput(args.attribute ?? args.name),
    position: stringInput(args.position || "beforeend"),
    dedupeKey: stringInput(args.dedupeKey),
    skipIfExistsSelector: stringInput(args.skipIfExistsSelector),
    openLinksInNewTab: args.openLinksInNewTab !== false,
    scroll: {
      direction: stringInput(args.direction),
      x: numberInput(args.x),
      y: numberInput(args.y),
      behavior: stringInput(args.behavior || "smooth"),
    },
    key: {
      key: stringInput(args.key || args.value || "Enter"),
      code: stringInput(args.code),
      ctrlKey: args.ctrlKey === true,
      shiftKey: args.shiftKey === true,
      altKey: args.altKey === true,
      metaKey: args.metaKey === true,
    },
  } satisfies MutationOperation;
}

function objectInput(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function textInput(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberInput(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
