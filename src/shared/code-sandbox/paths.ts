// Package files of the code sandbox. Imported by wxt.config.ts, so this
// module uses no browser APIs.
export const CODE_SANDBOX_PATH = {
  // The sandboxed page (opaque origin) that hosts the Worker on Chrome and
  // Firefox; generated at build time, see wxt.config.ts.
  page: "code-sandbox.html",
  pageScript: "code-sandbox-frame.js",
  worker: "code-sandbox-worker.js",
  wasm: "code-sandbox/quickjs.wasm",
} as const;

// No network (default-src 'none'), only the package's scripts, WebAssembly,
// and the blob: Worker made from the Worker source the host sends. No eval.
export const CODE_SANDBOX_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:";

export const CODE_SANDBOX_PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenBrowserAgent</title>
    <script src="/${CODE_SANDBOX_PATH.pageScript}"></script>
  </head>
  <body></body>
</html>
`;
