import { defineConfig } from "wxt";
import { fileURLToPath } from "node:url";

const permissions = ["scripting", "tabs", "storage", "downloads"] as const;

const chromiumOnlyPermissions = [
  "tabGroups",
  "search",
  "sidePanel",
  "debugger",
] as const;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }),
  manifest: ({ browser }) => ({
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    version: "0.1.0",
    default_locale: "en",
    permissions:
      browser === "firefox" || browser === "safari"
        ? [...permissions]
        : [...permissions, ...chromiumOnlyPermissions],
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob: http: https:;",
    },
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
