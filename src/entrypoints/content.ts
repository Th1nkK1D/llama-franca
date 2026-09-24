import { findLanguage, type Language } from "@/lib/languages";
import type {
  BadgeMessage,
  PageMessage,
  PageStatus,
  TranslateTextMessage,
  TranslateTextResponse,
} from "@/lib/messages";
import { buildNodes, collectSegments, plainText, swap, type Segment } from "@/lib/segments";
import "@/assets/content.css";

const CONCURRENCY = 2;
/** Blocks up to this many characters are grouped; longer ones get their own request and language check. */
const SHORT_TEXT = 40;
const BATCH_LINES = 16;
const MAIN_CONTENT = "main, article, [role=main]";
/** Wait for added content to settle before scanning it. */
const SCAN_DELAY = 300;
/**
 * Tints text while its translation is in flight (style in assets/content.css). A highlight marks the block's own
 * nodes, not its parent, since blocks split by `<br>` share one parent.
 */
let pendingHighlight: Highlight;
const pendingRanges = new WeakMap<Segment, Range>();

interface Session {
  requestedSource: string;
  source: Language;
  target: Language;
  segments: Segment[];
  /** Segments waiting to scroll into view, by the element the visibility observer watches. */
  byParent: Map<Element, Segment[]>;
  queue: Segment[];
  inFlight: number;
  done: number;
  observer: IntersectionObserver;
  /** False until the observer's first callback queues the visible blocks. */
  observed: boolean;
  /** Picks up content added after the page was scanned (infinite scroll, SPA navigation). */
  mutations: MutationObserver;
  scanRoots: Set<Element>;
  scanTimer?: ReturnType<typeof setTimeout>;
  error?: string;
}

let session: Session | undefined;
const cache = new Map<string, Promise<string>>();
/** Nodes already collected or inserted as a translation, so mutation scans only pick up new content. */
const known = new WeakSet<Node>();

export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    pendingHighlight = new Highlight();
    CSS.highlights.set("llama-franca-pending", pendingHighlight);
    // SPA navigation keeps this script alive: keep translating (new content arrives as mutations) but
    // restart the count and forget the old page's blocks. Hash jumps stay on the same page.
    ctx.addEventListener(window, "wxt:locationchange", ({ newUrl, oldUrl }) => {
      if (session && newUrl.href.split("#")[0] !== oldUrl.href.split("#")[0])
        forgetDetached(session);
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
    requestedSource: session.requestedSource,
    target: session.target.code,
    done: session.done,
    pending,
    error: session.error,
  };
}

/** Toolbar badge: blocks left while translating, target language when done, "!" on error. */
function report() {
  const { state, pending, error } = status();
  const text = error
    ? "!"
    : state === "translating"
      ? String(pending || "…")
      : state === "translated"
        ? session!.target.code.split("-")[0]!.toUpperCase()
        : "";
  const message: BadgeMessage = { type: "badge", text, error: !!error };
  browser.runtime.sendMessage(message).catch(() => {});
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

  const current: Session = {
    requestedSource: sourceCode,
    source,
    target,
    segments: [],
    byParent: new Map(),
    queue: [],
    inFlight: 0,
    done: 0,
    observer: new IntersectionObserver((entries) => onVisible(current, entries), {
      rootMargin: "300px 0px",
    }),
    observed: false,
    mutations: new MutationObserver((records) => onMutations(current, records)),
    scanRoots: new Set(),
  };
  session = current;
  addSegments(current, segments);
  current.mutations.observe(document.body, { childList: true, subtree: true });
  report();
}

/** Track segments and translate each once its parent scrolls near the viewport. */
function addSegments(s: Session, segments: Segment[]) {
  for (const segment of segments) {
    segment.original.forEach((node) => known.add(node));
    s.segments.push(segment);
    const waiting = s.byParent.get(segment.parent);
    if (waiting) {
      waiting.push(segment);
    } else {
      s.byParent.set(segment.parent, [segment]);
      s.observer.observe(segment.parent);
    }
  }
}

function onVisible(s: Session, entries: IntersectionObserverEntry[]) {
  s.observed = true;
  const rank = (entry: IntersectionObserverEntry) =>
    (entry.target.closest(MAIN_CONTENT) ? 0 : 1e6) + entry.boundingClientRect.top;
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => rank(a) - rank(b));
  for (const entry of visible) {
    s.observer.unobserve(entry.target);
    s.queue.push(...(s.byParent.get(entry.target) ?? []));
    s.byParent.delete(entry.target);
  }
  pump(s);
}

function onMutations(s: Session, records: MutationRecord[]) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (known.has(node)) continue;
      const root = node instanceof Element ? node : node.parentElement;
      if (root) s.scanRoots.add(root);
    }
  }
  if (s.scanRoots.size && !s.scanTimer) s.scanTimer = setTimeout(() => scan(s), SCAN_DELAY);
}

/**
 * A run mixing translated and new nodes (text appended to a translated paragraph) is skipped,
 * split runs by known nodes if that shows up.
 */
function scan(s: Session) {
  s.scanTimer = undefined;
  if (session !== s) return;
  for (const root of s.scanRoots) {
    if (!root.isConnected) continue;
    const fresh = collectSegments(root).filter((seg) => !seg.original.some((n) => known.has(n)));
    addSegments(s, fresh);
  }
  s.scanRoots.clear();
}

/** After SPA navigation: drop blocks the old page removed and restart the count. */
function forgetDetached(s: Session) {
  const attached = (seg: Segment) => (seg.translated ?? seg.original).some((n) => n.isConnected);
  s.segments = s.segments.filter(attached);
  s.queue = s.queue.filter(attached);
  for (const parent of s.byParent.keys()) {
    if (parent.isConnected) continue;
    s.observer.unobserve(parent);
    s.byParent.delete(parent);
  }
  s.done = 0;
  report();
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
    batch.forEach((segment) => setPending(segment, true));
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
  if (session === s) report();
}

function setPending(segment: Segment, on: boolean) {
  const existing = pendingRanges.get(segment);
  if (existing) pendingHighlight.delete(existing);
  if (!on) return;
  const range = new Range();
  range.setStartBefore(segment.original[0]!);
  range.setEndAfter(segment.original.at(-1)!);
  pendingRanges.set(segment, range);
  pendingHighlight.add(range);
}

async function translateBatch(s: Session, batch: Segment[]) {
  const prefetched = batch.length > 1 ? prefetchLines(s.source, s.target, batch) : undefined;
  await Promise.all(
    batch.map(async (segment) => {
      try {
        await prefetched;
        await translateSegment(s, segment);
      } finally {
        setPending(segment, false);
      }
    }),
  );
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
  if (!segment.original.some((node) => node.isConnected)) return;
  const source = await blockSource(s, segment);
  if (!source) return;
  const translation = await requestTranslation(source, s.target, segment.source);
  if (session !== s) return;
  const nodes = buildNodes(segment, translation);
  nodes.forEach((node) => known.add(node));
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
  session.mutations.disconnect();
  clearTimeout(session.scanTimer);
  for (const segment of session.segments) {
    if (segment.translated) swap(segment.translated, segment.original);
    segment.translated = undefined;
  }
  pendingHighlight.clear();
  session = undefined;
  report();
}
