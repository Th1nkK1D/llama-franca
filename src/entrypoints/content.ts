import { findLanguage, type Language } from "@/lib/languages";
import type {
  PageMessage,
  PageStatus,
  TranslateTextMessage,
  TranslateTextResponse,
} from "@/lib/messages";
import { buildNodes, collectSegments, plainText, swap, type Segment } from "@/lib/segments";

const CONCURRENCY = 2;
/** Blocks up to this many characters are grouped; longer ones get their own request and language check. */
const SHORT_TEXT = 40;
const BATCH_LINES = 16;
const MAIN_CONTENT = "main, article, [role=main]";

interface Session {
  source: Language;
  target: Language;
  segments: Segment[];
  queue: Segment[];
  inFlight: number;
  done: number;
  observer: IntersectionObserver;
  /** False until the observer's first callback queues the visible blocks. */
  observed: boolean;
  error?: string;
}

let session: Session | undefined;
const cache = new Map<string, Promise<string>>();

export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    // SPA navigation keeps this script alive, so drop the old page's session. Hash jumps stay on the same page.
    ctx.addEventListener(window, "wxt:locationchange", ({ newUrl, oldUrl }) => {
      if (newUrl.href.split("#")[0] !== oldUrl.href.split("#")[0]) restore();
    });
    browser.runtime.onMessage.addListener((message: PageMessage, _sender, sendResponse) => {
      if (message?.type === "translate-page") {
        start(message.source, message.target).then(
          () => sendResponse(status()),
          (error: Error) => sendResponse({ ...status(), error: error.message }),
        );
        return true;
      }
      if (message?.type === "restore-page") {
        restore();
        sendResponse(status());
      }
      if (message?.type === "page-status") sendResponse(status());
    });
  },
});

function status(): PageStatus {
  if (!session) return { state: "idle", done: 0, pending: 0 };
  const pending = session.queue.length + session.inFlight;
  return {
    state: pending || !session.observed ? "translating" : "translated",
    source: session.source.code,
    done: session.done,
    pending,
    error: session.error,
  };
}

async function start(sourceCode: string, targetCode: string) {
  restore();
  const target = findLanguage(targetCode);
  if (!target) throw new Error(`Unsupported target language: ${targetCode}`);

  const segments = collectSegments(document.body);
  if (!segments.length) throw new Error("Nothing to translate on this page");

  const source = sourceCode === "auto" ? await detectLanguage(segments) : findLanguage(sourceCode);
  if (!source) throw new Error("Couldn't detect the page language, pick a source language");
  if (source.code === target.code) {
    throw new Error(`Page is already in ${target.label ?? target.name}`);
  }

  const byParent = new Map<Element, Segment[]>();
  for (const segment of segments) {
    byParent.set(segment.parent, [...(byParent.get(segment.parent) ?? []), segment]);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      current.observed = true;
      // Article content first, then the rest (menus, sidebars), each top to bottom.
      const rank = (entry: IntersectionObserverEntry) =>
        (entry.target.closest(MAIN_CONTENT) ? 0 : 1e6) + entry.boundingClientRect.top;
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => rank(a) - rank(b));
      for (const entry of visible) {
        observer.unobserve(entry.target);
        current.queue.push(...byParent.get(entry.target)!);
      }
      pump(current);
    },
    { rootMargin: "300px 0px" },
  );
  const current: Session = {
    source,
    target,
    segments,
    queue: [],
    inFlight: 0,
    done: 0,
    observer,
    observed: false,
  };
  session = current;
  byParent.forEach((_, parent) => observer.observe(parent));
}

async function detect(text: string) {
  const result = await browser.i18n.detectLanguage(text).catch(() => undefined);
  const top = result?.languages[0];
  return top && (result.isReliable || top.percentage >= 50)
    ? findLanguage(top.language)
    : undefined;
}

async function detectLanguage(segments: Segment[]) {
  const sample = segments
    .map((s) => plainText(s.source))
    .join("\n")
    .slice(0, 2000);
  return (await detect(sample)) ?? findLanguage(document.documentElement.lang);
}

const isShort = (segment: Segment) => plainText(segment.source).length <= SHORT_TEXT;

/** Consecutive short blocks (menus, buttons, headings) go in one request, one per line. */
function takeBatch(queue: Segment[]) {
  const batch = [queue.shift()!];
  if (!isShort(batch[0]!)) return batch;
  while (batch.length < BATCH_LINES && queue[0] && isShort(queue[0])) batch.push(queue.shift()!);
  return batch;
}

function pump(s: Session) {
  while (session === s && !s.error && s.inFlight < CONCURRENCY && s.queue.length) {
    const batch = takeBatch(s.queue);
    s.inFlight += batch.length;
    translateBatch(s, batch)
      .catch((error: Error) => {
        s.error = error.message;
        s.queue.length = 0;
      })
      .finally(() => {
        s.inFlight -= batch.length;
        pump(s);
      });
  }
}

async function translateBatch(s: Session, batch: Segment[]) {
  if (batch.length > 1) await prefetchLines(s.source, s.target, batch);
  await Promise.all(batch.map((segment) => translateSegment(s, segment)));
}

/**
 * Long blocks get their own language check (short text detects unreliably):
 * skip ones already in the target, translate ones in another language from that language.
 */
async function blockSource(s: Session, segment: Segment) {
  if (isShort(segment)) return s.source;
  const detected = await detect(plainText(segment.source));
  if (detected?.code === s.target.code) return;
  return detected ?? s.source;
}

async function translateSegment(s: Session, segment: Segment) {
  const source = await blockSource(s, segment);
  if (!source) return;
  const translation = await requestTranslation(source, s.target, segment.source);
  if (session !== s) return;
  const nodes = buildNodes(segment, translation);
  swap(segment.original, nodes);
  segment.translated = nodes;
  s.done++;
}

const cacheKey = (source: Language, target: Language, text: string) =>
  `${source.code}>${target.code}\n${text}`;

/** Translate uncached lines in one request and seed the cache; on a line-count mismatch each falls back to its own request. */
async function prefetchLines(source: Language, target: Language, batch: Segment[]) {
  const missing = [
    ...new Set(
      batch.map((s) => s.source).filter((text) => !cache.has(cacheKey(source, target, text))),
    ),
  ];
  if (missing.length < 2) return;
  const lines = (await sendTranslation(source, target, missing.join("\n")))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== missing.length) return;
  missing.forEach((text, i) =>
    cache.set(cacheKey(source, target, text), Promise.resolve(lines[i]!)),
  );
}

async function sendTranslation(source: Language, target: Language, text: string) {
  const message: TranslateTextMessage = { type: "translate-text", source, target, text };
  const res: TranslateTextResponse = await browser.runtime.sendMessage(message);
  if ("error" in res) throw new Error(res.error);
  return res.text;
}

function requestTranslation(source: Language, target: Language, text: string) {
  const key = cacheKey(source, target, text);
  let result = cache.get(key);
  if (!result) {
    result = sendTranslation(source, target, text);
    result.catch(() => cache.delete(key));
    cache.set(key, result);
  }
  return result;
}

function restore() {
  if (!session) return;
  session.observer.disconnect();
  for (const segment of session.segments) {
    if (segment.translated) swap(segment.translated, segment.original);
    segment.translated = undefined;
  }
  session = undefined;
}
