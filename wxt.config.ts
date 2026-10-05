import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  modules: ["@wxt-dev/module-svelte"],
  manifest: ({ browser }) => ({
    name: "Llama Franca",
    permissions: ["storage", "contextMenus", "activeTab", "scripting"],
    host_permissions: ["http://localhost:11434/*"],
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
