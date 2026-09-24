/** A run of inline content inside a block element, translated as one unit. */
export interface Segment {
  parent: Element;
  original: ChildNode[];
  translated?: ChildNode[];
  /** Text sent to the model, inline elements written as `[N:text]`. */
  source: string;
  markers: Map<number, Element>;
  /** Wordless inline elements (icons, footnote refs) kept out of the prompt, put back before / after the translation. */
  leading: Element[];
  trailing: Element[];
}

const SKIP = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "pre",
  "textarea",
  "select",
  "iframe",
  "canvas",
  "video",
  "audio",
  "object",
  "head",
]);

const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "data",
  "del",
  "dfn",
  "em",
  "font",
  "i",
  "ins",
  "label",
  "mark",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
]);

/** Never sent to the model. */
const EMBEDDED = new Set(["img", "svg", "math", "input", "wbr"]);

/** Sent for context but restored verbatim. */
const VERBATIM = new Set(["code", "kbd", "samp", "var"]);

/**
 * `[1:text]` is the marker syntax translategemma preserves best; `<1>…</1>` and HTML tags get dropped.
 * The model sometimes answers with full-width punctuation (`[1：text]`) for CJK targets.
 */
const MARKER_OPEN = /[[［]\s*(\d+)\s*[:：]\s*/g;

type Part = string | { id: number; text: string };

/**
 * Split a marked-up translation into text and markers. The model sometimes closes a marker with `)`
 * or not at all, so a marker ends at the first `]` before the next marker, else `)`, else it's dropped.
 */
function parseMarkers(marked: string): Part[] {
  const opens = [...marked.matchAll(MARKER_OPEN)];
  const parts: Part[] = [];
  let pos = 0;
  opens.forEach((open, k) => {
    parts.push(marked.slice(pos, open.index));
    const start = open.index + open[0].length;
    const body = marked.slice(start, opens[k + 1]?.index ?? marked.length);
    let close = body.search(/[\]］]/);
    if (close < 0) close = body.search(/[)）]/);
    if (close < 0) {
      pos = start;
      return;
    }
    parts.push({ id: Number(open[1]), text: body.slice(0, close).trim() });
    pos = start + close + 1;
  });
  parts.push(marked.slice(pos));
  return parts;
}

const hasLetters = (text: string | null) => /\p{L}/u.test(text ?? "");

function isWordless(el: Element) {
  return EMBEDDED.has(el.localName) || (INLINE.has(el.localName) && !hasLetters(el.textContent));
}

const inlineCache = new WeakMap<Element, boolean>();

function isInline(el: Element): boolean {
  if (isWordless(el) || VERBATIM.has(el.localName)) return true;
  let result = inlineCache.get(el);
  if (result === undefined) {
    result = INLINE.has(el.localName) && [...el.children].every(isInline);
    inlineCache.set(el, result);
  }
  return result;
}

function isEditable(el: Element) {
  return (el as HTMLElement).isContentEditable || el.getAttribute("translate") === "no";
}

export function collectSegments(root: Element): Segment[] {
  const segments: Segment[] = [];

  const visit = (el: Element) => {
    if (SKIP.has(el.localName) || isEditable(el)) return;
    let run: ChildNode[] = [];
    const flush = () => {
      const [only, ...more] = run.filter((node) =>
        node instanceof Element ? !isWordless(node) : hasLetters(node.textContent),
      );
      // A run that's a single element (e.g. a menu link) is translated inside it: no marker, element untouched.
      if (only instanceof Element && !more.length && !VERBATIM.has(only.localName)) {
        visit(only);
      } else {
        const segment = run.length ? toSegment(el, run) : undefined;
        if (segment) segments.push(segment);
      }
      run = [];
    };
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE || (child instanceof Element && isInline(child))) {
        run.push(child);
      } else if (child instanceof Element) {
        flush();
        visit(child);
      }
    }
    flush();
  };

  visit(root);
  return segments;
}

/** Wrappers around links (e.g. `<b><a>…</a> and <a>…</a></b>`) are dropped so each link keeps its own marker. */
function wrapsLinks(el: Element) {
  return (
    el.localName !== "a" && [...el.querySelectorAll("a")].some((a) => hasLetters(a.textContent))
  );
}

function toSegment(parent: Element, nodes: ChildNode[]): Segment | undefined {
  const markers = new Map<number, Element>();
  const leading: Element[] = [];
  const trailing: Element[] = [];
  let text = "";

  const serialize = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node instanceof Element) {
      if (isWordless(node)) {
        (hasLetters(text) ? trailing : leading).push(node);
      } else if (wrapsLinks(node)) {
        node.childNodes.forEach(serialize);
      } else {
        const id = markers.size + 1;
        markers.set(id, node);
        text += `[${id}:${node.textContent?.trim()}]`;
      }
    }
  };
  nodes.forEach(serialize);

  const source = text.replace(/\s+/g, " ").trim();
  if (!hasLetters(plainText(source))) return;
  return { parent, original: nodes, source, markers, leading, trailing };
}

/** Copy of `el` with its words replaced by `text`, keeping nested formatting and icons. */
function fill(el: Element, text: string) {
  const clone = el.cloneNode(true) as Element;
  if (VERBATIM.has(el.localName)) return clone;
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const [first, ...rest] = texts.filter((node) => hasLetters(node.data));
  if (!first) {
    clone.append(text);
    return clone;
  }
  first.data = text;
  rest.forEach((node) => (node.data = ""));
  return clone;
}

/**
 * Rebuild DOM nodes from a marked-up translation. Markers the model dropped lose their element but keep their words.
 * ponytail: wordless elements after the first word (footnote refs) all go to the end of the block,
 * anchor them to the neighbouring marker if that bothers.
 */
export function buildNodes(segment: Segment, translation: string): ChildNode[] {
  const fragment = document.createDocumentFragment();
  fragment.append(...segment.leading.map((el) => el.cloneNode(true)));
  const used = new Set<number>();
  for (const part of parseMarkers(translation)) {
    if (typeof part === "string") {
      fragment.append(part);
      continue;
    }
    const original = segment.markers.get(part.id);
    if (original && !used.has(part.id)) {
      used.add(part.id);
      fragment.append(fill(original, part.text));
    } else {
      fragment.append(part.text);
    }
  }
  fragment.append(...segment.trailing.map((el) => el.cloneNode(true)));
  return [...fragment.childNodes];
}

export function plainText(marked: string) {
  return parseMarkers(marked)
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("");
}

export function swap(from: ChildNode[], to: ChildNode[]) {
  const anchor = from.find((node) => node.parentNode);
  if (!anchor) return;
  anchor.before(...to);
  from.forEach((node) => node.remove());
}
