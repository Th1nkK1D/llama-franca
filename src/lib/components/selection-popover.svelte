<script lang="ts">
  import LanguageOptions from "./language-options.svelte";
  import { findLanguage } from "../languages";

  let {
    source = $bindable("auto"),
    target = $bindable("en"),
    onchange,
    onclose,
  }: {
    source?: string;
    target?: string;
    onchange: (source: string, target: string) => void;
    onclose: () => void;
  } = $props();

  let text = $state("Translating…");
  let status = $state<"pending" | "done" | "error">("pending");
  let detected = $state<string>();
  let detectedLanguage = $derived(findLanguage(detected));

  export function pending(loadingModel = false) {
    text = loadingModel ? "Loading model, the first translation takes a while…" : "Translating…";
    status = "pending";
  }

  export function show(value: string, detectedCode?: string) {
    text = value;
    detected = detectedCode;
    status = "done";
  }

  export function fail(message: string) {
    text = message;
    status = "error";
  }
</script>

<div class="box" role="dialog" aria-label="Translation">
  <div class="header">
    <select
      class="control"
      aria-label="Source language"
      bind:value={source}
      onchange={() => onchange(source, target)}
    >
      <LanguageOptions auto detected={detectedLanguage} />
    </select>
    <span aria-hidden="true">→</span>
    <select
      class="control"
      aria-label="Target language"
      bind:value={target}
      onchange={() => onchange(source, target)}
    >
      <LanguageOptions />
    </select>
    <button class="close" aria-label="Close" onclick={onclose}>×</button>
  </div>
  <div
    class="body"
    class:pending={status === "pending"}
    class:error={status === "error"}
    aria-live="polite"
  >
    {text}
  </div>
</div>

<!-- Plain CSS, not Tailwind: Tailwind v4 utilities rely on @property, which doesn't apply inside a shadow root. -->
<style>
  .box {
    font:
      14px/1.5 system-ui,
      sans-serif;
    color: #111827;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    padding: 8px 12px 6px;
    min-width: 160px;
    max-width: 480px;
    color-scheme: light;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    font-size: 12px;
    color: #6b7280;
  }
  .close:focus-visible {
    outline: 2px solid #38bdf8;
  }
  .close {
    all: unset;
    margin-left: auto;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
    border-radius: 4px;
  }
  .body {
    padding: 4px 0;
    white-space: pre-wrap;
    max-height: 50vh;
    overflow: auto;
    user-select: text;
    scrollbar-width: thin;
    scrollbar-color: rgb(0 0 0 / 0.2) transparent;
  }
  .pending {
    color: #6b7280;
  }
  .error {
    color: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    .box {
      color: #f3f4f6;
      background: #1f2937;
      border-color: #374151;
      color-scheme: dark;
    }
    .body {
      scrollbar-color: rgb(255 255 255 / 0.2) transparent;
    }
    .header,
    .pending {
      color: #9ca3af;
    }
    .error {
      color: #f87171;
    }
  }
</style>
