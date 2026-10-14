import { defineConfig } from "wxt";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { quickjsWasmUrl } from "./scripts/quickjs-wasm-plugin";
import { SMART_BAR_COMMAND } from "./src/shared/smart-bar-protocol";
import {
  CODE_SANDBOX_CSP,
  CODE_SANDBOX_PAGE_HTML,
  CODE_SANDBOX_PATH,
} from "./src/shared/code-sandbox/paths";

const permissions = [
  "scripting",
  "tabs",
  "storage",
  "downloads",
  "unlimitedStorage",
  // Sync checks once a minute while an extension page is visible.
  "alarms",
  // Removes the Origin header from requests to MCP servers that reject
  // browser requests (mcp-origin-rules); host access comes from <all_urls>.
  "declarativeNetRequestWithHostAccess",
  // The right-click menu (OpenBrowserAgent ▸ …); Safari has it on macOS.
  "contextMenus",
  // Which page opened a tab, so tabs a page the agent works on opens do not
  // take the user's tab (the browser names the active tab as the opener).
  "webNavigation",
] as const;
const chromiumAndFirefoxPermissions = ["nativeMessaging", "search"] as const;
const sourcemap = process.env.WXT_SOURCEMAP === "true";
const require = createRequire(import.meta.url);
const extensionPagesCsp =
  "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob: http: https:;";

const chromiumOnlyPermissions = [
  "tabGroups",
  "sidePanel",
  "debugger",
  "offscreen",
] as const;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  hooks: {
    // The code sandbox's interpreter ships in the package (never from a
    // CDN). Its sandboxed page is plain HTML with a classic script, so it
    // loads the same way from an opaque origin in Chrome and Firefox; Safari
    // has no sandboxed pages and runs the Worker from the background page.
    "build:publicAssets": (wxt, files) => {
      files.push({
        absoluteSrc:
          require.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm"),
        relativeDest: CODE_SANDBOX_PATH.wasm,
      });
      if (wxt.config.browser !== "safari")
        files.push({
          contents: CODE_SANDBOX_PAGE_HTML,
          relativeDest: CODE_SANDBOX_PATH.page,
        });
    },
  },
  vite: () => ({
    plugins: [quickjsWasmUrl()],
    build: {
      sourcemap,
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }),
  manifest: ({ browser }) => ({
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    version: "0.2.0",
    version_name: "0.2.0 beta 7",
    default_locale: "en",
    permissions:
      browser === "safari"
        ? [...permissions]
        : browser === "firefox"
          ? [...permissions, ...chromiumAndFirefoxPermissions]
          : [
              ...permissions,
              ...chromiumAndFirefoxPermissions,
              ...chromiumOnlyPermissions,
            ],
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages: extensionPagesCsp,
      ...(browser === "chrome" ? { sandbox: CODE_SANDBOX_CSP } : {}),
    },
    // Manifest V2 (Firefox) keeps the sandbox CSP inside `sandbox`; Firefox
    // before 154 ignores the key and the host falls back to a plain Worker.
    ...(browser === "chrome"
      ? { sandbox: { pages: [CODE_SANDBOX_PATH.page] } }
      : browser === "firefox"
        ? {
            sandbox: {
              pages: [CODE_SANDBOX_PATH.page],
              content_security_policy: CODE_SANDBOX_CSP,
            },
          }
        : {}),
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    action: {
      default_title: "OpenBrowserAgent",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+J",
          mac: "Command+J",
        },
        description: "OpenBrowserAgent",
      },
      // No default key: the user picks one in the browser's shortcut settings.
      [SMART_BAR_COMMAND]: {
        description: "__MSG_smartBarCommand__",
      },
    },
    options_ui: {
      open_in_tab: true,
      page: "options.html",
    },
    ...(browser === "safari"
      ? {}
      : {
          side_panel: {
            default_path: "sidepanel.html",
          },
        }),
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "open-browser-agent@openbrowseragent.local",
              data_collection_permissions: {
                required: [
                  "browsingActivity",
                  "searchTerms",
                  "websiteContent",
                  "websiteActivity",
                ],
              },
            },
          },
        }
      : {}),
  }),
});
