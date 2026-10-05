import type { Language } from "./languages";
import { cacheLimitPref, modelPref, promptPref } from "./prefs";

/** Translations kept across page loads in storage.local, next to (and never evicting) other settings. */
const PREFIX = "tr:";
const CHECK_EVERY = 50;

interface Entry {
  text: string;
  at: number;
}

let writes = 0;

async function storageKey(source: Language, target: Language, text: string) {
  const [model, prompt] = await Promise.all([modelPref.getValue(), promptPref.getValue()]);
  const data = new TextEncoder().encode(
    `${model}\n${prompt}\n${source.code}>${target.code}\n${text}`,
  );
  // In a Firefox content script the hash belongs to the page, so methods like `slice` that read `constructor` are denied.
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return (
    PREFIX + Array.from({ length: 16 }, (_, i) => hash[i]!.toString(16).padStart(2, "0")).join("")
  );
}

export async function getStored(source: Language, target: Language, text: string) {
  if (!(await cacheLimitPref.getValue())) return;
  const key = await storageKey(source, target, text);
  const entry = (await browser.storage.local.get(key))[key] as Entry | undefined;
  return entry?.text;
}

export async function putStored(
  source: Language,
  target: Language,
  text: string,
  translation: string,
) {
  if (!(await cacheLimitPref.getValue())) return;
  const key = await storageKey(source, target, text);
  await browser.storage.local.set({ [key]: { text: translation, at: Date.now() } satisfies Entry });
  if (++writes % CHECK_EVERY === 0) await evict();
}

/**
 * Evicts by write time, not last use, so an old but often-read entry can go first.
 * Bump `at` on reads if that matters. Repeats until the cache fits, so a lowered limit (or 0) trims it right away.
 */
export async function evict() {
  const limit = (await cacheLimitPref.getValue()) * 1024 * 1024;
  for (;;) {
    const items = await browser.storage.local.get(null);
    const keys = Object.keys(items).filter((key) => key.startsWith(PREFIX));
    if (!keys.length || (await browser.storage.local.getBytesInUse(keys)) < limit) return;
    await browser.storage.local.remove(oldestHalf(items));
  }
}

async function cacheKeys() {
  return Object.keys(await browser.storage.local.get(null)).filter((key) => key.startsWith(PREFIX));
}

export async function cacheUsage() {
  const keys = await cacheKeys();
  return { count: keys.length, bytes: await browser.storage.local.getBytesInUse(keys) };
}

export const clearCache = async () => browser.storage.local.remove(await cacheKeys());

/** Keys of the older half of cached translations; other storage keys are left alone. */
export function oldestHalf(items: Record<string, unknown>) {
  const entries = Object.entries(items)
    .filter(([key]) => key.startsWith(PREFIX))
    .sort(([, a], [, b]) => (a as Entry).at - (b as Entry).at);
  return entries.slice(0, Math.ceil(entries.length / 2)).map(([key]) => key);
}
