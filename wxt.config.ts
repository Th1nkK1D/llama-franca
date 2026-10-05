import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

/** Without it Chromium draws the toolbar icon at the wrong scale on Wayland until hovered. */
const actionIcon = { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png" };

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  modules: ["@wxt-dev/module-svelte"],
  manifest: ({ browser }) => ({
    name: "Llama Franca",
    permissions: ["storage", "contextMenus", "activeTab", "scripting"],
    host_permissions: ["http://localhost:11434/*"],
    action: { default_icon: actionIcon },
    browser_action: { default_icon: actionIcon },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: { id: "llama-franca@th1nkk1d", data_collection_permissions: { required: ["none"] } },
      },
    }),
  }),
  hooks: {
    // The runtime-registered content script has no `matches`, so WXT exposes its popover CSS to no page.
    "build:manifestGenerated": (_wxt, manifest) => {
      for (const entry of manifest.web_accessible_resources ?? []) {
        if (typeof entry === "object") entry.matches = ["<all_urls>"];
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
