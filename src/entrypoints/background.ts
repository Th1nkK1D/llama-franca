import { ensureContentScript } from "@/lib/content-script";
import type {
  BadgeMessage,
  ModelMessage,
  ModelResult,
  PageMessage,
  Reply,
  TabMode,
  TabModeMessage,
  TranslateTextMessage,
  TranslateTextResult,
} from "@/lib/messages";
import { isModelLoaded, loadModel, translate } from "@/lib/ollama";
import { displayName, findLanguage } from "@/lib/languages";
import { getTarget, sourcePref, targetPref } from "@/lib/prefs";

const modeKey = (tabId: number) => `tab-mode:${tabId}`;

async function getMode(tabId: number) {
  const key = modeKey(tabId);
  return ((await browser.storage.session.get(key))[key] as TabMode | undefined) ?? null;
}

const languageName = (code: string) => {
  const language = findLanguage(code);
  return language ? displayName(language) : code;
};

/** Menu titles are shared by all tabs, so this follows the one in front. */
async function syncMenu() {
  const [[tab], source, target] = await Promise.all([
    browser.tabs.query({ active: true, lastFocusedWindow: true }),
    sourcePref.getValue(),
    getTarget(),
  ]);
  const translating = tab?.id !== undefined && !!(await getMode(tab.id));
  const languages = `${source === "auto" ? "" : `from ${languageName(source)} `}to ${languageName(target)}`;
  await Promise.all([
    browser.contextMenus.update("translate-page", {
      title: translating ? "Show original" : `Translate page ${languages}`,
    }),
    browser.contextMenus.update("translate-selection", { title: `Translate "%s" ${languages}` }),
  ]).catch(() => {});
}

/** Returns true to keep the message channel open until it answers. */
function reply<T>(result: Promise<T>, sendResponse: (response: Reply<T>) => void) {
  result.then(sendResponse, (error: Error) => sendResponse({ error: error.message }));
  return true;
}

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: TranslateTextMessage | BadgeMessage | TabModeMessage | ModelMessage,
      sender,
      sendResponse,
    ) => {
      const tabId = sender.tab?.id;
      switch (message?.type) {
        case "badge":
          if (tabId === undefined) return;
          void browser.action.setBadgeText({ tabId, text: message.text });
          void browser.action.setBadgeBackgroundColor({
            tabId,
            color: message.error ? "#dc2626" : "#2563eb",
          });
          return;
        case "get-tab-mode":
          if (tabId === undefined) return;
          getMode(tabId).then(sendResponse);
          return true;
        case "set-tab-mode":
          if (tabId === undefined) return;
          void (message.mode
            ? browser.storage.session.set({ [modeKey(tabId)]: message.mode })
            : browser.storage.session.remove(modeKey(tabId)));
          return;
        case "model-loaded":
          return reply<ModelResult>(
            isModelLoaded().then((loaded) => ({ loaded })),
            sendResponse,
          );
        case "load-model":
          return reply<ModelResult>(
            loadModel().then(() => ({ loaded: true })),
            sendResponse,
          );
        case "translate-text":
          return reply<TranslateTextResult>(
            translate(message.source, message.target, message.text).then((text) => ({ text })),
            sendResponse,
          );
      }
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
    void syncMenu();
  });
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (tab?.id === undefined) return;
    if (info.menuItemId === "translate-page" && (await getMode(tab.id))) {
      const restore: PageMessage = { type: "restore-page" };
      // Without a content script (the extension was reloaded) only the stale mode is left to clear.
      await browser.tabs
        .sendMessage(tab.id, restore)
        .catch(() => browser.storage.session.remove(modeKey(tab.id!)));
      return;
    }
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
    if (!(await getMode(tabId))) return;
    await ensureContentScript(tabId).catch(() => browser.storage.session.remove(modeKey(tabId)));
  });
  browser.tabs.onRemoved.addListener(
    (tabId) => void browser.storage.session.remove(modeKey(tabId)),
  );

  browser.storage.session.onChanged.addListener(() => void syncMenu());
  browser.tabs.onActivated.addListener(() => void syncMenu());
  browser.windows.onFocusChanged.addListener(() => void syncMenu());
  sourcePref.watch(() => void syncMenu());
  targetPref.watch(() => void syncMenu());
});
