import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

// The QuickJS packages (quickjs-emscripten's variants).
const QUICKJS_PACKAGE = "/@jitl/quickjs-";

// The code sandbox's Worker hands QuickJS a compiled WebAssembly.Module, so
// the glue never loads its .wasm by URL. Unlisted scripts build in library
// mode, where Vite inlines every `new URL(..., import.meta.url)` asset, here
// a 700 KB base64 copy of the file the package already ships (see the
// build:publicAssets hook). Vite's own `@vite-ignore` marker leaves these
// URLs as they are; checkSandboxWorker (run after each build) keeps the
// Worker small.
export function quickjsWasmUrl(): Plugin {
  return {
    name: "oba-quickjs-wasm-url",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(QUICKJS_PACKAGE) || !code.includes("new URL(")) return;
      return code.replaceAll("new URL(", "new URL(/* @vite-ignore */ ");
    },
  };
}

// The Worker is about 60 KB; an inlined interpreter would add 700 KB.
const WORKER_MAX_BYTES = 100 * 1024;

// Fails the build when the interpreter was inlined into the sandbox Worker
// after all (an upstream change the transform above no longer covers).
export async function checkSandboxWorker(file: string) {
  const code = await readFile(file, "utf8");
  if (code.includes("data:application/wasm") || code.length > WORKER_MAX_BYTES)
    throw new Error(
      `${file} is ${code.length} bytes or inlines the QuickJS .wasm; check scripts/quickjs-wasm-plugin.ts.`,
    );
}
