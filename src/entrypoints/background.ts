import type {
  BadgeMessage,
  TabMode,
  TabModeMessage,
  TranslateTextMessage,
  TranslateTextResponse,
} from "@/lib/messages";
import { translate } from "@/lib/ollama";

const modeKey = (tabId: number) => `tab-mode:${tabId}`;

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: TranslateTextMessage | BadgeMessage | TabModeMessage, sender, sendResponse) => {
      const tabId = sender.tab?.id;
      if (message?.type === "badge") {
        if (tabId === undefined) return;
        void browser.action.setBadgeText({ tabId, text: message.text });
        void browser.action.setBadgeBackgroundColor({
          tabId,
          color: message.error ? "#dc2626" : "#2563eb",
        });
        return;
      }
      if (message?.type === "get-tab-mode") {
        if (tabId === undefined) return;
        browser.storage.session
          .get(modeKey(tabId))
          .then((items) => sendResponse((items[modeKey(tabId)] as TabMode | undefined) ?? null));
        return true;
      }
      if (message?.type === "set-tab-mode") {
        if (tabId === undefined) return;
        void (message.mode
          ? browser.storage.session.set({ [modeKey(tabId)]: message.mode })
          : browser.storage.session.remove(modeKey(tabId)));
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
  browser.tabs.onRemoved.addListener(
    (tabId) => void browser.storage.session.remove(modeKey(tabId)),
  );
});
