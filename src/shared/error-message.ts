// The text of a thrown value, for messages and replies.
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
