import type { Plugin } from "vite";

const GLUE = "quickjs-ng-wasmfile-release-sync/dist/emscripten-module";
const WASM_URL = 'new URL("emscripten-module.wasm",import.meta.url)';

// The code sandbox's Worker hands QuickJS a compiled WebAssembly.Module, so
// the glue never loads its .wasm by URL. Unlisted scripts build in library
// mode, where Vite would inline that URL as a 700 KB base64 copy of the file
// the package already ships (see the build:publicAssets hook); the reference
// becomes a plain string instead.
export function quickjsWasmUrl(): Plugin {
  return {
    name: "oba-quickjs-wasm-url",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(GLUE)) return;
      if (!code.includes(WASM_URL))
        throw new Error(
          `${id} no longer loads its .wasm as ${WASM_URL}; update scripts/quickjs-wasm-plugin.ts.`,
        );
      return code.replace(WASM_URL, '"emscripten-module.wasm"');
    },
  };
}
