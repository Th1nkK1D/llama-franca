import { ensureContentScript } from "@/lib/content-script";
import type {
  BadgeMessage,
  ModelMessage,
  ModelResponse,
  PageMessage,
  TabMode,
  TabModeMessage,
  TranslateTextMessage,
  TranslateTextResponse,
} from "@/lib/messages";
import { isModelLoaded, loadModel, translate } from "@/lib/ollama";
import { getTarget, sourcePref } from "@/lib/prefs";

const modeKey = (tabId: number) => `tab-mode:${tabId}`;

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: TranslateTextMessage | BadgeMessage | TabModeMessage | ModelMessage,
      sender,
      sendResponse,
    ) => {
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
      if (message?.type === "model-loaded" || message?.type === "load-model") {
        const loaded =
          message.type === "model-loaded" ? isModelLoaded() : loadModel().then(() => true);
        loaded.then(
          (loaded) => sendResponse({ loaded } satisfies ModelResponse),
          (error: Error) => sendResponse({ error: error.message } satisfies ModelResponse),
        );
        return true;
      }
      if (message?.type !== "translate-text") return;
      translate(message.source, message.target, message.text).then(
        (text) => sendResponse({ text } satisfies TranslateTextResponse),
        (error: Error) => sendResponse({ error: error.message } satisfies TranslateTextResponse),
      );
      return true;
    },
  );

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "translate-page",
      title: "Translate page",
      contexts: ["page"],
    });
    browser.contextMenus.create({
      id: "translate-selection",
      title: 'Translate "%s"',
      contexts: ["selection"],
    });
  });
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (tab?.id === undefined) return;
    const [source, target] = await Promise.all([sourcePref.getValue(), getTarget()]);
    const message: PageMessage =
      info.menuItemId === "translate-page"
        ? { type: "translate-page", source, target }
        : { type: "translate-selection", text: info.selectionText ?? "", source, target };
    // Fails on pages extensions can't script, like browser pages.
    ensureContentScript(tab.id)
      .then(() => browser.tabs.sendMessage(tab.id!, message))
      .catch(() => {});
  });

  browser.tabs.onUpdated.addListener(async (tabId, info) => {
    // A full page load kills the content script before it can clear its badge.
    if (info.status === "loading") void browser.action.setBadgeText({ tabId, text: "" });
    if (info.status !== "complete") return;
    // activeTab access ends when the tab leaves the granted origin, which ends translating too.
    const key = modeKey(tabId);
    if (!(await browser.storage.session.get(key))[key]) return;
    await ensureContentScript(tabId).catch(() => browser.storage.session.remove(key));
  });
  browser.tabs.onRemoved.addListener(
    (tabId) => void browser.storage.session.remove(modeKey(tabId)),
  );
});
