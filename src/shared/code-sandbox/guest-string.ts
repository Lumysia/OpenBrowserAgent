import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

// What a run may still hand back, in characters, and whether something was
// already cut.
export type Budget = { left: number; cut: boolean };

// A guest string copied out of the interpreter, at most `max` characters:
// the length is read first and a longer string is cut inside the guest, so
// the host never copies more than it keeps.
export function guestString(
  context: QuickJSContext,
  handle: QuickJSHandle,
  max: number,
): { text: string; cut: boolean } {
  const lengthHandle = context.getProp(handle, "length");
  const length = context.getNumber(lengthHandle);
  lengthHandle.dispose();
  if (length <= max) return { text: context.getString(handle), cut: false };
  const slice = context.getProp(handle, "slice");
  const start = context.newNumber(0);
  const end = context.newNumber(Math.max(0, max));
  const part = context.callFunction(slice, handle, start, end);
  for (const item of [slice, start, end]) item.dispose();
  if (part.error) {
    part.error.dispose();
    return { text: "", cut: true };
  }
  const text = context.getString(part.value);
  part.value.dispose();
  return { text, cut: true };
}
