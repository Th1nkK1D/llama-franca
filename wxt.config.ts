import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Llama Franca",
    permissions: ["storage", "contextMenus"],
    host_permissions: ["http://localhost:11434/*"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
