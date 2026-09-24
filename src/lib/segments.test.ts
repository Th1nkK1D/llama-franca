// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { buildNodes, collectSegments, swap } from "./segments";

function page(html: string) {
  document.body.innerHTML = html;
  return collectSegments(document.body);
}

test("splits blocks, marks inline elements, keeps wordless ones out of the prompt", () => {
  const segments = page(`
    <h1>Title</h1>
    <p>Click <a href="/x">here</a> to <b>continue</b>, run <code>npm i</code>.<sup><a href="#r">[2]</a></sup></p>
    <div>Card <div>nested</div> tail</div>
    <p>line one<br>line two</p>
    <p><b>see <a href="/a">A</a> and <a href="/b">B</a></b></p>
    <pre>skip me</pre>
    <p>123 — 456</p>
  `);
  expect(segments.map((s) => s.source)).toEqual([
    "Title",
    "Click [1:here] to [2:continue], run [3:npm i].",
    "Card",
    "nested",
    "tail",
    "line one",
    "line two",
    "see [1:A] and [2:B]",
  ]);
  expect(segments[1]!.trailing.map((el) => el.localName)).toEqual(["sup"]);
});

test("keeps wordless elements before the first word in front", () => {
  const segment = page(
    `<button><span class="icon"></span><span>Toggle</span><sup>1</sup></button>`,
  )[0]!;
  const button = document.querySelector("button")!;
  swap(segment.original, buildNodes(segment, "[1:สลับ]"));
  expect(button.innerHTML).toBe('<span class="icon"></span><span>สลับ</span><sup>1</sup>');
});

test("rebuilds translation with original elements and restores", () => {
  const p = page(
    `<p>Click <a href="/x">here <img src="i.png"></a> or <b>go <i>now</i></b> <code>x</code><sup>[1]</sup></p>`,
  )[0]!;
  expect(p.source).toBe("Click [1:here] or [2:go now] [3:x]");

  const nodes = buildNodes(p, "คลิก [1:ที่นี่] หรือ［2：ไปเลย］[3:แปล] [9:ไม่มี]");
  swap(p.original, nodes);
  const el = document.querySelector("p")!;
  expect(el.innerHTML).toBe(
    'คลิก <a href="/x">ที่นี่<img src="i.png"></a> หรือ<b>ไปเลย<i></i></b><code>x</code> ไม่มี<sup>[1]</sup>',
  );

  swap(nodes, p.original);
  expect(el.innerHTML).toBe(
    'Click <a href="/x">here <img src="i.png"></a> or <b>go <i>now</i></b> <code>x</code><sup>[1]</sup>',
  );
});

test("dropped markers keep their words", () => {
  const p = page(`<p>A <a href="/x">link</a> and <b>bold</b></p>`)[0]!;
  swap(p.original, buildNodes(p, "ก ลิงก์ และ [2:หนา]"));
  expect(document.querySelector("p")!.innerHTML).toBe("ก ลิงก์ และ <b>หนา</b>");
});
