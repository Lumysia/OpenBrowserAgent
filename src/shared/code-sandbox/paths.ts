// Package files of the code sandbox. Imported by wxt.config.ts, so this
// module uses no browser APIs.
export const CODE_SANDBOX_PATH = {
  // The sandboxed page (opaque origin) that hosts the Worker where the
  // browser supports sandboxed pages: public/code-sandbox.html.
  page: "code-sandbox.html",
  worker: "code-sandbox-worker.js",
  wasm: "code-sandbox/quickjs.wasm",
} as const;

// No network (default-src 'none'), only the package's scripts, WebAssembly,
// and the blob: Worker made from the Worker source the host sends. No eval.
export const CODE_SANDBOX_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:";

// Whether a manifest lists the sandboxed page (Safari's has none).
export function hasCodeSandboxPage(manifest: {
  sandbox?: { pages?: string[] };
}) {
  return !!manifest.sandbox?.pages?.includes(CODE_SANDBOX_PATH.page);
}
