import type { BadgeMessage, TranslateTextMessage, TranslateTextResponse } from "@/lib/messages";
import { translate } from "@/lib/ollama";

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: TranslateTextMessage | BadgeMessage, sender, sendResponse) => {
      if (message?.type === "badge") {
        const tabId = sender.tab?.id;
        if (tabId === undefined) return;
        void browser.action.setBadgeText({ tabId, text: message.text });
        void browser.action.setBadgeBackgroundColor({
          tabId,
          color: message.error ? "#dc2626" : "#2563eb",
        });
        return;
      }
      if (message?.type !== "translate-text") return;
      translate(message.source, message.target, message.text).then(
        (text) => sendResponse({ text } satisfies TranslateTextResponse),
        (error: Error) => sendResponse({ error: error.message } satisfies TranslateTextResponse),
      );
      return true;
    },
  );

  // A full page load kills the content script before it can clear its badge.
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "loading") void browser.action.setBadgeText({ tabId, text: "" });
  });
});
