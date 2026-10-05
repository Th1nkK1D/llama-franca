import { cacheKey, getStored, putStored } from "./cache";
import type { Language } from "./languages";
import type {
  ModelMessage,
  ModelResult,
  Reply,
  TranslateTextMessage,
  TranslateTextResult,
} from "./messages";

const translations = new Map<string, Promise<string>>();
let modelReady: Promise<void> | undefined;
let loadingModel = false;
let onLoadingModel: (() => void) | undefined;

export const isLoadingModel = () => loadingModel;

/** Call `listener` when the model starts or stops loading, until unwatched or another listener takes over. */
export function watchLoadingModel(listener: () => void) {
  onLoadingModel = listener;
  return () => {
    if (onLoadingModel === listener) onLoadingModel = undefined;
  };
}

/** Translations from another model or prompt are stale. */
export const clearTranslations = () => translations.clear();

async function ask<T extends object>(message: TranslateTextMessage | ModelMessage): Promise<T> {
  const res: Reply<T> = await browser.runtime.sendMessage(message);
  if ("error" in res) throw new Error(String(res.error));
  return res;
}

function ensureModel() {
  modelReady ??= (async () => {
    if ((await ask<ModelResult>({ type: "model-loaded" })).loaded) return;
    setLoadingModel(true);
    try {
      await ask<ModelResult>({ type: "load-model" });
    } finally {
      setLoadingModel(false);
    }
  })().finally(() => (modelReady = undefined));
  return modelReady;
}

function setLoadingModel(on: boolean) {
  loadingModel = on;
  onLoadingModel?.();
}

async function sendTranslation(source: Language, target: Language, text: string) {
  await ensureModel();
  const res = await ask<TranslateTextResult>({ type: "translate-text", source, target, text });
  return res.text;
}

export function requestTranslation(source: Language, target: Language, text: string) {
  const key = cacheKey(source, target, text);
  let result = translations.get(key);
  if (!result) {
    result = getStored(source, target, text).then(async (stored) => {
      if (stored !== undefined) return stored;
      const translation = await sendTranslation(source, target, text);
      void putStored(source, target, text, translation);
      return translation;
    });
    result.catch(() => translations.delete(key));
    translations.set(key, result);
  }
  return result;
}

/** Translate uncached lines in one request and seed the cache; on a line-count mismatch each falls back to its own request. */
export async function prefetchLines(source: Language, target: Language, texts: string[]) {
  const unseen = [
    ...new Set(texts.filter((text) => !translations.has(cacheKey(source, target, text)))),
  ];
  const stored = await Promise.all(unseen.map((text) => getStored(source, target, text)));
  const missing = unseen.filter((text, i) => {
    const hit = stored[i];
    if (hit !== undefined) translations.set(cacheKey(source, target, text), Promise.resolve(hit));
    return hit === undefined;
  });
  if (missing.length < 2) return;
  const lines = (await sendTranslation(source, target, missing.join("\n")))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== missing.length) return;
  missing.forEach((text, i) => {
    translations.set(cacheKey(source, target, text), Promise.resolve(lines[i]!));
    void putStored(source, target, text, lines[i]!);
  });
}
