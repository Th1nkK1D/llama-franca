import { findLanguage } from "./languages";

export const sourcePref = storage.defineItem<string>("local:source", { fallback: "auto" });
export const targetPref = storage.defineItem<string | null>("local:target", { fallback: null });

export async function getTarget() {
  return (await targetPref.getValue()) ?? findLanguage(browser.i18n.getUILanguage())?.code ?? "en";
}

export const DEFAULT_MODEL = "translategemma:4b";

// Exact template from https://ollama.com/library/translategemma.
export const DEFAULT_PROMPT = `You are a professional {source} ({source_code}) to {target} ({target_code}) translator. Your goal is to accurately convey the meaning and nuances of the original {source} text while adhering to {target} grammar, vocabulary, and cultural sensitivities.
Produce only the {target} translation, without any additional explanations or commentary. Please translate the following {source} text into {target}:


{text}`;

/** storage.local allows 10 MB without the unlimitedStorage permission, the rest is left for settings. */
export const MAX_CACHE_MB = 8;
export const cacheLimitPref = storage.defineItem<number>("local:cacheLimit", {
  fallback: MAX_CACHE_MB,
});

export const modelPref = storage.defineItem<string>("local:model", { fallback: DEFAULT_MODEL });
export const promptPref = storage.defineItem<string>("local:prompt", { fallback: DEFAULT_PROMPT });
