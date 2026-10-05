/** A run of inline content inside a block element, translated as one unit. */
export interface Segment {
  parent: Element;
  original: ChildNode[];
  translated?: ChildNode[];
  /** Text sent to the model, inline elements written as `[N:text]`. */
  source: string;
  markers: Map<number, Element>;
  /** Wordless inline elements (icons, footnote refs) kept out of the prompt, put back before / within the translation. */
  leading: Element[];
  trailing: Trailing[];
}

/** A wordless element after the first word, e.g. a footnote ref, and where it sat in the source. */
interface Trailing {
  el: Element;
  /** Marker it directly followed (only punctuation / spaces between): placed right after that element. */
  marker?: number;
  /** Otherwise: relative position in the source text, 0–1, mapped onto the translation. */
  ratio: number;
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

/** Reset per scan, since an element can gain block children between mutation scans. */
let inlineCache = new WeakMap<Element, boolean>();

function isInline(el: Element): boolean {
  if (isWordless(el) || VERBATIM.has(el.localName)) return true;
  let result = inlineCache.get(el);
  if (result === undefined) {
    result = INLINE.has(el.localName) && [...el.children].every(isInline);
    inlineCache.set(el, result);
  }
  return result;
}

function isExcluded(el: Element) {
  return (el as HTMLElement).isContentEditable || el.getAttribute("translate") === "no";
}

const SKIP_ANCESTOR = [...SKIP, "[translate=no]"].join(",");

export function collectSegments(root: Element): Segment[] {
  const segments: Segment[] = [];
  if (root.parentElement?.closest(SKIP_ANCESTOR)) return segments;
  inlineCache = new WeakMap();

  const visit = (el: Element) => {
    if (SKIP.has(el.localName) || isExcluded(el)) return;
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
  const found: { el: Element; marker?: number; at: number }[] = [];
  let text = "";
  let plain = "";
  let lastMarker: number | undefined;
  let sinceMarker = "";

  const serialize = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      plain += node.textContent;
      sinceMarker += node.textContent;
    } else if (node instanceof Element) {
      if (isWordless(node)) {
        if (!hasLetters(text)) leading.push(node);
        else {
          const followsMarker = lastMarker !== undefined && /^[\s\p{P}]*$/u.test(sinceMarker);
          found.push({
            el: node,
            marker: followsMarker ? lastMarker : undefined,
            at: plain.length,
          });
        }
      } else if (wrapsLinks(node)) {
        node.childNodes.forEach(serialize);
      } else {
        const id = markers.size + 1;
        const content = node.textContent?.trim() ?? "";
        markers.set(id, node);
        text += `[${id}:${content}]`;
        plain += content;
        lastMarker = id;
        sinceMarker = "";
      }
    }
  };
  nodes.forEach(serialize);

  const source = text.replace(/\s+/g, " ").trim();
  if (!hasLetters(plainText(source))) return;
  const trailing = found.map(({ el, marker, at }) => ({ el, marker, ratio: at / plain.length }));
  return { parent, original: nodes, source, markers, leading, trailing };
}

/**
 * Copy of `el` with its text replaced by `text`, keeping nested formatting and icons. The marker carried all of
 * the element's text, punctuation included, so every other text node is cleared (else `/ˈlɑːmə/` came out `//ˈlɑːmə//`).
 */
function fill(el: Element, text: string) {
  const clone = el.cloneNode(true) as Element;
  if (VERBATIM.has(el.localName)) return clone;
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const first = texts.find((node) => node.data.trim());
  if (!first) {
    clone.append(text);
    return clone;
  }
  texts.forEach((node) => (node.data = node === first ? text : ""));
  return clone;
}

/** Markers the model dropped lose their element but keep their words. */
export function buildNodes(segment: Segment, translation: string): ChildNode[] {
  const fragment = document.createDocumentFragment();
  fragment.append(...segment.leading.map((el) => el.cloneNode(true)));
  const clones = new Map<number, Element>();
  for (const part of parseMarkers(translation)) {
    if (typeof part === "string") {
      fragment.append(part);
      continue;
    }
    const original = segment.markers.get(part.id);
    if (original && !clones.has(part.id)) {
      const clone = fill(original, part.text);
      clones.set(part.id, clone);
      fragment.append(clone);
    } else {
      fragment.append(part.text);
    }
  }
  placeTrailing(fragment, segment.trailing, clones);
  return [...fragment.childNodes];
}

interface Spot {
  /** Undefined for the end of the block. */
  text?: Text;
  offset: number;
  pos: number;
}

/**
 * Put footnote refs back: right after the marker they followed, else at the same relative position in the
 * translation snapped to the nearest sentence end (or word gap, for scripts like Thai without periods).
 */
function placeTrailing(
  fragment: DocumentFragment,
  trailing: Trailing[],
  clones: Map<number, Element>,
) {
  const sentenceEnds: Spot[] = [];
  const gaps: Spot[] = [];
  let total = 0;
  for (const child of fragment.childNodes) {
    if (child instanceof Text) {
      for (const match of child.data.matchAll(/[.!?;。！？]+|\s+/g)) {
        const isGap = /\s/.test(match[0]);
        const offset = isGap ? match.index : match.index + match[0].length;
        (isGap ? gaps : sentenceEnds).push({ text: child, offset, pos: total + offset });
      }
    }
    total += child.textContent?.length ?? 0;
  }
  const end: Spot = { offset: 0, pos: total };
  sentenceEnds.push(end);

  const nearest = (spots: Spot[], target: number, within = Infinity) => {
    let best: Spot | undefined;
    for (const spot of spots) {
      const distance = Math.abs(spot.pos - target);
      if (distance <= within && (!best || distance < Math.abs(best.pos - target))) best = spot;
    }
    return best;
  };

  const afterMarker = new Map<Element, Element>();
  const placed: { spot: Spot; node: Element }[] = [];
  for (const item of trailing) {
    const node = item.el.cloneNode(true) as Element;
    const clone = item.marker === undefined ? undefined : clones.get(item.marker);
    if (clone) {
      (afterMarker.get(clone) ?? clone).after(node);
      afterMarker.set(clone, node);
      continue;
    }
    const target = item.ratio * total;
    const spot = nearest(sentenceEnds, target, total * 0.2) ?? nearest(gaps, target) ?? end;
    placed.push({ spot, node });
  }

  // Insert back to front so earlier offsets stay valid. Each insert at a shared spot lands before the
  // previous one, so reverse first (the sort is stable) to keep those in source order.
  const atEnd: Node[] = [];
  for (const { spot, node } of placed.reverse().sort((a, b) => b.spot.pos - a.spot.pos)) {
    if (spot.text) spot.text.splitText(spot.offset).before(node);
    else atEnd.unshift(node);
  }
  fragment.append(...atEnd);
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
