import { displayName, findLanguage, type Language } from "@/lib/languages";
import type {
  BadgeMessage,
  PageMessage,
  PageStatus,
  TabMode,
  TabModeMessage,
} from "@/lib/messages";
import { showPopover } from "@/lib/popover";
import { modelPref, promptPref, sourcePref, targetPref } from "@/lib/prefs";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { buildNodes, collectSegments, plainText, swap, type Segment } from "@/lib/segments";
import {
  clearTranslations,
  isLoadingModel,
  prefetchLines,
  requestTranslation,
  watchLoadingModel,
} from "@/lib/translator";

const CONCURRENCY = 2;
const SHORT_TEXT = 40;
const BATCH_LINES = 16;
const SAMPLE_LENGTH = 2000;
const MAIN_CONTENT = "main, article, [role=main]";
const SCAN_DELAY = 300;
/** Marks each block's own nodes, not its parent, since blocks split by `<br>` share one parent. */
let pendingHighlight: Highlight;
const pendingRanges = new WeakMap<Segment, Range>();
/**
 * Adopted into the page rather than shipped as content script CSS: with cssInjectionMode "ui" that CSS only
 * reaches the popover's shadow root, where it can't style the page's text.
 */
const PENDING_STYLE =
  "::highlight(llama-franca-pending) { background-color: rgb(56 189 248 / 0.3); }";

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
  mutations: MutationObserver;
  scanRoots: Set<Element>;
  scanTimer?: ReturnType<typeof setTimeout>;
  error?: string;
}

let session: Session | undefined;
/** Nodes already collected or inserted as a translation, so mutation scans only pick up new content. */
const known = new WeakSet<Node>();

export default defineContentScript({
  registration: "runtime",
  // Content script CSS (the popover's Svelte styles) goes into the popover's shadow root, not the page.
  cssInjectionMode: "ui",
  main(ctx) {
    pendingHighlight = new Highlight();
    CSS.highlights.set("llama-franca-pending", pendingHighlight);
    const pendingSheet = new CSSStyleSheet();
    pendingSheet.replaceSync(PENDING_STYLE);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, pendingSheet];
    modelPref.watch(clearTranslations);
    promptPref.watch(clearTranslations);
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
      if (message?.type === "translate-selection") {
        void translateSelection(ctx, message.text, message.source, message.target);
      }
      if (message?.type === "restore-page") {
        restore();
        setTabMode(null);
        sendResponse(status());
      }
      if (message?.type === "page-status") sendResponse(status());
    });

    browser.runtime
      .sendMessage({ type: "get-tab-mode" } satisfies TabModeMessage)
      .then((mode: TabMode | null) => {
        // Errors like "page is already in the target language" just leave this page as is.
        if (mode && !session) start(mode.source, mode.target).catch(() => {});
      });
  },
});

async function translateSelection(
  ctx: ContentScriptContext,
  menuText: string,
  initialSource: string,
  initialTarget: string,
) {
  const selection = getSelection();
  const text = (selection?.toString() || menuText).trim();
  const anchor = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
  let latest = 0;

  const run = async (sourceCode: string, targetCode: string) => {
    // Languages can change while a translation is in flight; only the latest one may render.
    const id = ++latest;
    const notify = () => id === latest && popover.pending(isLoadingModel());
    const unwatch = watchLoadingModel(notify);
    notify();

    try {
      if (!text) throw new Error("Nothing selected");
      const target = await findTarget(targetCode);
      const source =
        sourceCode === "auto"
          ? ((await detect(text)) ??
            session?.source ??
            (await pageLanguage(document.body.innerText)))
          : await findLanguage(sourceCode);

      if (!source) throw new Error("Couldn't detect the language, pick a source language");

      const translation =
        source.code === target.code ? text : await requestTranslation(source, target, text);

      if (id === latest) popover.show(translation, source.code);
    } catch (error) {
      if (id === latest) popover.fail((error as Error).message);
    } finally {
      unwatch();
    }
  };

  const popover = await showPopover(ctx, anchor, {
    source: initialSource,
    target: initialTarget,
    onchange: (source, target) => {
      void sourcePref.setValue(source);
      void targetPref.setValue(target);
      void run(source, target);
    },
  });
  await run(initialSource, initialTarget);
}

async function findTarget(code: string) {
  const target = await findLanguage(code);
  if (!target) throw new Error(`Unsupported target language: ${code}`);
  return target;
}

function setTabMode(mode: TabMode | null) {
  const message: TabModeMessage = { type: "set-tab-mode", mode };
  browser.runtime.sendMessage(message).catch(() => {});
}

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
    loadingModel: isLoadingModel(),
    error: session.error,
  };
}

function report() {
  const { state, pending, target, error } = status();
  let text = "";
  if (error) text = "!";
  else if (state === "translating") text = String(pending || "…");
  else if (state === "translated") text = target!.split("-")[0]!.toUpperCase();
  const message: BadgeMessage = { type: "badge", text, error: !!error };
  browser.runtime.sendMessage(message).catch(() => {});
}

async function start(sourceCode: string, targetCode: string) {
  restore();
  const target = await findTarget(targetCode);

  const segments = collectSegments(document.body);
  if (!segments.length) throw new Error("Nothing to translate on this page");

  const source =
    sourceCode === "auto"
      ? await pageLanguage(segments.map((s) => plainText(s.source)).join("\n"))
      : await findLanguage(sourceCode);
  if (!source) throw new Error("Couldn't detect the page language, pick a source language");
  if (source.code === target.code) throw new Error(`Page is already in ${displayName(target)}`);

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
  setTabMode({ source: sourceCode, target: targetCode });
  addSegments(current, segments);
  current.mutations.observe(document.body, { childList: true, subtree: true });
  report();
}

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

async function pageLanguage(text: string) {
  return (
    (await detect(text.slice(0, SAMPLE_LENGTH))) ?? findLanguage(document.documentElement.lang)
  );
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
  const prefetched =
    batch.length > 1
      ? prefetchLines(
          s.source,
          s.target,
          batch.map((segment) => segment.source),
        )
      : undefined;
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
