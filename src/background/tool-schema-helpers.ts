// Shared building blocks for the tool JSON schemas.

export const contentSliceParameters = {
  offset: {
    type: "number",
    description: "Zero-based character offset for returned content",
  },
  limit: {
    type: "number",
    description: "Maximum characters to return for this read",
  },
} as const;

export const listSliceParameters = {
  offset: {
    type: "number",
    description: "Zero-based item offset for returned results",
  },
  limit: {
    type: "number",
    description: "Maximum items to return",
  },
} as const;

export function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}
