import { mount, unmount } from "svelte";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import SelectionPopover from "./selection-popover.svelte";

/** Matches the box's max-width in selection-popover.svelte, to keep it inside the viewport. */
const WIDTH = 480;
let dismissCurrent: (() => void) | undefined;

interface Options {
  source: string;
  target: string;
  onchange: (source: string, target: string) => void;
}

/** Floating translation box under the selection, rendered in a shadow root so page CSS stays out. */
export async function showPopover(
  ctx: ContentScriptContext,
  anchor: Range | undefined,
  options: Options,
) {
  dismissCurrent?.();

  const ui = await createShadowRootUi(ctx, {
    name: "llama-franca-popover",
    position: "inline",
    anchor: "body",
    onMount: (container) =>
      mount(SelectionPopover, { target: container, props: { ...options, onclose: dismiss } }),
    onRemove: (app) => app && unmount(app),
  });
  ui.mount();

  // Positioned inside the shadow root: WXT's `:host { all: initial !important }` reset beats styles on the host.
  const place = () => {
    const rect = anchor?.getBoundingClientRect();
    const left = rect ? rect.left : innerWidth / 2 - WIDTH / 2;
    Object.assign(ui.uiContainer.style, {
      position: "fixed",
      zIndex: "2147483647",
      left: `${Math.max(8, Math.min(left, innerWidth - WIDTH - 16))}px`,
      top: `${rect ? rect.bottom + 8 : 80}px`,
    });
  };
  place();

  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().includes(ui.shadowHost)) dismiss();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };
  function dismiss() {
    ui.remove();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    removeEventListener("scroll", place, true);
    removeEventListener("resize", place);
    if (dismissCurrent === dismiss) dismissCurrent = undefined;
  }
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  // Follow the selection while the page (or any scroll container) scrolls.
  addEventListener("scroll", place, { capture: true, passive: true });
  addEventListener("resize", place, { passive: true });
  dismissCurrent = dismiss;

  return ui.mounted!;
}
