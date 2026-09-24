# LLama Franca

Cross-browser extension for local LLM page translation with Ollama. Just like lingua franca, but llama.

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
pnpm build          # → .output/chrome-mv3
pnpm build:firefox  # → .output/firefox-mv2
```

In a Chromium browser, open `chrome://extensions`, enable **Developer mode**, and **Load unpacked** the `.output/chrome-mv3` folder.

> Tested on Chromium ([Helium](https://helium.computer)). The Firefox build is untested.

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
