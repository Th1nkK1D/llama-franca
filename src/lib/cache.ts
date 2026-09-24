import type { Language } from "./languages";
import { MODEL } from "./ollama";

/** Translations kept across page loads in storage.local, next to (and never evicting) other settings. */
const PREFIX = "tr:";
/** storage.local allows 10 MB without the unlimitedStorage permission. */
const MAX_BYTES = 8 * 1024 * 1024;
const CHECK_EVERY = 50;

interface Entry {
  text: string;
  at: number;
}

let writes = 0;

async function storageKey(source: Language, target: Language, text: string) {
  const data = new TextEncoder().encode(`${MODEL}\n${source.code}>${target.code}\n${text}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return PREFIX + Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getStored(source: Language, target: Language, text: string) {
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
  const key = await storageKey(source, target, text);
  await browser.storage.local.set({ [key]: { text: translation, at: Date.now() } satisfies Entry });
  if (++writes % CHECK_EVERY === 0) await evict();
}

/**
 * Evicts by write time, not last use, so an old but often-read entry can go first.
 * Bump `at` on reads if that matters.
 */
async function evict() {
  if ((await browser.storage.local.getBytesInUse(null)) < MAX_BYTES) return;
  await browser.storage.local.remove(oldestHalf(await browser.storage.local.get(null)));
}

/** Keys of the older half of cached translations; other storage keys are left alone. */
export function oldestHalf(items: Record<string, unknown>) {
  const entries = Object.entries(items)
    .filter(([key]) => key.startsWith(PREFIX))
    .sort(([, a], [, b]) => (a as Entry).at - (b as Entry).at);
  return entries.slice(0, Math.ceil(entries.length / 2)).map(([key]) => key);
}
