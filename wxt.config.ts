import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

/** Without it Chromium draws the toolbar icon at the wrong scale on Wayland until hovered. */
const actionIcon = { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png" };

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Llama Franca",
    permissions: ["storage", "contextMenus"],
    host_permissions: ["http://localhost:11434/*"],
    action: { default_icon: actionIcon },
    browser_action: { default_icon: actionIcon },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
