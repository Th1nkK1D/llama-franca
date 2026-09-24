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
  const segment = page(`<button><svg></svg> Toggle <b>menu</b><sup>1</sup></button>`)[0]!;
  expect(segment.source).toBe("Toggle [1:menu]");
  swap(segment.original, buildNodes(segment, "สลับ [1:เมนู]"));
  expect(document.querySelector("button")!.innerHTML).toBe("<svg></svg>สลับ <b>เมนู</b><sup>1</sup>");
});

test("translates inside a lone element instead of marking it", () => {
  const [segment] = page(
    `<li><span class="icon"></span> <a href="/"><span>Main page</span></a></li>`,
  );
  expect(segment!.source).toBe("Main page");
  expect(segment!.parent.localName).toBe("span");
  swap(segment!.original, buildNodes(segment!, "หน้าหลัก"));
  expect(document.querySelector("li")!.innerHTML).toBe(
    '<span class="icon"></span> <a href="/"><span>หน้าหลัก</span></a>',
  );
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

test("repairs markers closed with ')' or left open", () => {
  const p = page(`<p>A <a href="/x">link (demo)</a>, <b>bold</b> and <i>it</i></p>`)[0]!;
  expect(p.source).toBe("A [1:link (demo)], [2:bold] and [3:it]");
  swap(p.original, buildNodes(p, "ก [1:ลิงก์ (สาธิต)], [2:หนา) และ [3:เอียง"));
  expect(document.querySelector("p")!.innerHTML).toBe(
    'ก <a href="/x">ลิงก์ (สาธิต)</a>, <b>หนา</b> และ เอียง',
  );
});

test("dropped markers keep their words", () => {
  const p = page(`<p>A <a href="/x">link</a> and <b>bold</b></p>`)[0]!;
  swap(p.original, buildNodes(p, "ก ลิงก์ และ [2:หนา]"));
  expect(document.querySelector("p")!.innerHTML).toBe("ก ลิงก์ และ <b>หนา</b>");
});
