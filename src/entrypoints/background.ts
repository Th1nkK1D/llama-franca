import type { TranslateTextMessage, TranslateTextResponse } from "@/lib/messages";
import { translate } from "@/lib/ollama";

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: TranslateTextMessage, _sender, sendResponse) => {
    if (message?.type !== "translate-text") return;
    translate(message.source, message.target, message.text).then(
      (text) => sendResponse({ text } satisfies TranslateTextResponse),
      (error: Error) => sendResponse({ error: error.message } satisfies TranslateTextResponse),
    );
    return true;
  });
});
