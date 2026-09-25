<img src="src/assets/icon.svg" alt="Llama Franca icon" width="128">

# LLama Franca

Browser extension for local LLM page translation with Ollama. Just like lingua franca, but llama.

## Features

- **Translate page** from the popup or the right-click menu. Text is replaced in place, links and formatting are kept, and **Show original** restores the page.
- **Translate selection** from the right-click menu, shown in a popover with its own language pickers.
- **Auto-detects** the source language, per page and per block, and skips text already in the target language.
- **Visible text first**: blocks translate as they scroll into view, main content before menus and sidebars.
- **Keeps up with the page**: content loaded later (infinite scroll, SPA navigation) is translated too, and a tab keeps translating across page loads until **Show original**.
- **Cached**: translations are stored locally, so revisiting a page is instant.
- **Progress** shown as a tint on text being translated and a badge on the toolbar icon.
- **Fully local**: text only goes to your own Ollama server.

## Tech stack

- [WXT](https://wxt.dev) (Manifest V3) with [Svelte 5](https://svelte.dev) and [Tailwind CSS v4](https://tailwindcss.com)
- [Ollama](https://ollama.com) running [TranslateGemma](https://ollama.com/library/translategemma) (`translategemma:4b`)
- TypeScript, [Vitest](https://vitest.dev) + happy-dom
- [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter), run on commit via simple-git-hooks + lint-staged

## How to

### Set up Ollama

1. Install [Ollama](https://ollama.com/download) and pull the model:

   ```sh
   ollama pull translategemma:4b
   ```

2. Allow requests from the extension by setting `OLLAMA_ORIGINS` for the Ollama server, then restart it:

   ```sh
   OLLAMA_ORIGINS="chrome-extension://*" ollama serve
   ```

   Use `moz-extension://*` for Firefox. The extension expects Ollama at `http://localhost:11434`.

### Run in development

```sh
pnpm install
pnpm dev          # Chromium
pnpm dev:firefox  # Firefox
```

This opens a browser with the extension loaded and reloads it on changes. To use a specific browser binary, create a `web-ext.config.ts` (gitignored):

```ts
import { defineWebExtConfig } from "wxt";

export default defineWebExtConfig({
  binaries: { chrome: "/path/to/browser" },
});
```

### Build and install

```sh
pnpm build          # all of the below
pnpm build:chrome   # → dist/chrome-mv3 (Chrome, Edge, Brave, Opera, and other Chromium browsers)
pnpm build:firefox  # → dist/firefox-mv2
pnpm build:safari   # → dist/safari-mv2
```

In a Chromium browser, open `chrome://extensions`, enable **Developer mode**, and **Load unpacked** the `dist/chrome-mv3` folder.

In Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `dist/firefox-mv2/manifest.json`. It stays loaded until Firefox restarts. To keep it installed, set `xpinstall.signatures.required` to `false` in `about:config` (Developer Edition, Nightly, or ESR only), run `pnpm zip:firefox`, and install the zip from `about:addons` → gear icon → **Install Add-on From File…**.

The Safari build must be converted into an Xcode project on macOS with `xcrun safari-web-extension-packager dist/safari-mv2` before it can be installed.

> Tested on Chromium ([Helium](https://helium.computer)). The Firefox and Safari builds are untested.

### Use

- Click the toolbar icon, pick the languages, and press **Translate page**. Press **Show original** to stop.
- Or right-click the page for **Translate page**, or right-click selected text for **Translate "…"**.

### Check

```sh
pnpm check     # svelte-check
pnpm lint      # oxlint
pnpm fmt:check # oxfmt
pnpm test      # vitest
```

---

Not affiliated with [Ollama](https://ollama.com).
