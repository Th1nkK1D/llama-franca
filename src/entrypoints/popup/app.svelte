<script lang="ts">
  import Button from "@/lib/components/button.svelte";
  import LanguageOptions from "@/lib/components/language-options.svelte";
  import { ensureContentScript } from "@/lib/content-script";
  import { findLanguage } from "@/lib/languages";
  import { LOADING_MODEL, type PageMessage, type PageStatus } from "@/lib/messages";
  import { checkSetup } from "@/lib/ollama";
  import { getTarget, sourcePref, targetPref } from "@/lib/prefs";

  let source = $state("auto");
  let target = $state("en");
  let status = $state<PageStatus>();
  let actionError = $state<string>();
  let setupError = $state<string>();
  let error = $derived(actionError ?? setupError ?? status?.error);
  let detected = $derived(findLanguage(status?.source));
  let canTranslate = $derived(
    !status ||
      status.state === "idle" ||
      status.requestedSource !== source ||
      status.target !== target,
  );

  sourcePref.getValue().then((value) => (source = value));
  getTarget().then((value) => (target = value));
  checkSetup().then((message) => (setupError = message));

  async function send(message: PageMessage) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    try {
      if (message.type === "translate-page") await ensureContentScript(tab!.id!);
      return (await browser.tabs.sendMessage(tab!.id!, message)) as PageStatus;
    } catch {
      throw new Error("Can't translate this page.");
    }
  }

  async function run(message: PageMessage) {
    actionError = undefined;
    try {
      status = await send(message);
      actionError = status.error;
    } catch (e) {
      actionError = (e as Error).message;
    }
  }

  async function poll() {
    status = await send({ type: "page-status" }).catch(() => status);
  }
  poll();
  setInterval(poll, 500);
</script>

<main class="flex flex-col gap-3 p-4">
  <div class="flex items-center gap-2">
    <select
      class="control min-w-0 flex-1"
      aria-label="Source language"
      bind:value={source}
      onchange={() => sourcePref.setValue(source)}
    >
      <LanguageOptions auto detected={source === "auto" ? detected : undefined} />
    </select>
    <span aria-hidden="true">→</span>
    <select
      class="control min-w-0 flex-1"
      aria-label="Target language"
      bind:value={target}
      onchange={() => targetPref.setValue(target)}
    >
      <LanguageOptions />
    </select>
  </div>

  <div class="flex gap-2">
    {#if canTranslate}
      <Button
        variant="primary"
        class="flex-1"
        disabled={!!setupError}
        onclick={() => run({ type: "translate-page", source, target })}
      >
        Translate page
      </Button>
    {:else}
      <Button class="flex-1" onclick={() => run({ type: "restore-page" })}>Show original</Button>
    {/if}
    <Button
      variant="icon"
      aria-label="Settings"
      title="Settings"
      onclick={() => browser.runtime.openOptionsPage()}
    >
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Button>
  </div>

  {#if error}
    <p class="text-red-600 dark:text-red-400">{error}</p>
  {:else if status?.loadingModel}
    <p class="text-gray-500">{LOADING_MODEL}</p>
  {:else if status?.state === "translating"}
    <p class="text-gray-500">Translating… {status.done} done, {status.pending} queued</p>
  {:else if status?.state === "translated"}
    <p class="text-gray-500">Translated {status.done} blocks. More translate as you scroll.</p>
  {/if}
</main>
