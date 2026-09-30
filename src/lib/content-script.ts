import type { PageMessage } from "./messages";

/** Injecting twice would leave two instances answering messages. */
export async function ensureContentScript(tabId: number) {
  const ping: PageMessage = { type: "page-status" };
  const running = await browser.tabs.sendMessage(tabId, ping).then(
    () => true,
    () => false,
  );
  if (running) return;
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["/content-scripts/content.js"],
  });
}
