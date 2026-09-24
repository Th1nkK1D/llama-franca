import { findLanguage, type Language } from "@/lib/languages";
import type {
  PageMessage,
  PageStatus,
  TranslateTextMessage,
  TranslateTextResponse,
} from "@/lib/messages";
import { buildNodes, collectSegments, plainText, swap, type Segment } from "@/lib/segments";

const CONCURRENCY = 2;

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
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
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

async function detectLanguage(segments: Segment[]) {
  const sample = segments
    .map((s) => plainText(s.source))
    .join("\n")
    .slice(0, 2000);
  const result = await browser.i18n.detectLanguage(sample).catch(() => undefined);
  const top = result?.languages[0];
  const detected = top && (result.isReliable || top.percentage >= 50) ? top.language : undefined;
  return findLanguage(detected) ?? findLanguage(document.documentElement.lang);
}

function pump(s: Session) {
  while (session === s && !s.error && s.inFlight < CONCURRENCY && s.queue.length) {
    const segment = s.queue.shift()!;
    s.inFlight++;
    translateSegment(s, segment)
      .catch((error: Error) => {
        s.error = error.message;
        s.queue.length = 0;
      })
      .finally(() => {
        s.inFlight--;
        pump(s);
      });
  }
}

async function translateSegment(s: Session, segment: Segment) {
  const translation = await requestTranslation(s.source, s.target, segment.source);
  if (session !== s) return;
  const nodes = buildNodes(segment, translation);
  swap(segment.original, nodes);
  segment.translated = nodes;
  s.done++;
}

function requestTranslation(source: Language, target: Language, text: string) {
  const key = `${source.code}>${target.code}\n${text}`;
  let result = cache.get(key);
  if (!result) {
    const message: TranslateTextMessage = { type: "translate-text", source, target, text };
    result = browser.runtime.sendMessage(message).then((res: TranslateTextResponse) => {
      if ("error" in res) throw new Error(res.error);
      return res.text;
    });
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
