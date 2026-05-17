import { defineConfig } from "wxt";
import { fileURLToPath } from "node:url";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }),
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    version: "0.1.0",
    default_locale: "en",
    permissions: [
      "scripting",
      "tabs",
      "storage",
      "tabGroups",
      "search",
      "sidePanel",
      "downloads",
    ],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    action: {
      default_title: "Open OpenBrowserAgent",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+J",
          mac: "Command+J",
        },
        description: "Open OpenBrowserAgent",
      },
    },
    options_ui: {
      open_in_tab: true,
      page: "options.html",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
});
