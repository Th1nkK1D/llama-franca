<script lang="ts">
  import { findLanguage, LANGUAGES } from "@/lib/languages";
  import type { PageMessage, PageStatus } from "@/lib/messages";
  import { checkSetup } from "@/lib/ollama";

  const sourceItem = storage.defineItem<string>("local:source", { fallback: "auto" });
  const targetItem = storage.defineItem<string>("local:target", {
    fallback: findLanguage(browser.i18n.getUILanguage())?.code ?? "en",
  });

  let source = $state("auto");
  let target = $state("en");
  let status = $state<PageStatus>();
  let actionError = $state<string>();
  let setupError = $state<string>();
  let error = $derived(actionError ?? setupError ?? status?.error);
  let detected = $derived(findLanguage(status?.source));

  sourceItem.getValue().then((value) => (source = value));
  targetItem.getValue().then((value) => (target = value));
  checkSetup().then((message) => (setupError = message));

  async function send(message: PageMessage) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    try {
      return (await browser.tabs.sendMessage(tab!.id!, message)) as PageStatus;
    } catch {
      throw new Error(
        "Can't translate this page. If it was open before the extension loaded, reload it.",
      );
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
  <h1 class="text-base font-semibold">Llama Franca</h1>

  <div class="flex items-center gap-2">
    <select
      class="min-w-0 flex-1 rounded border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-900"
      aria-label="Source language"
      bind:value={source}
      onchange={() => sourceItem.setValue(source)}
    >
      <option value="auto">
        Auto{source === "auto" && detected ? ` (${detected.label ?? detected.name})` : ""}
      </option>
      {#each LANGUAGES as lang (lang.code)}
        <option value={lang.code}>{lang.label ?? lang.name}</option>
      {/each}
    </select>
    <span aria-hidden="true">→</span>
    <select
      class="min-w-0 flex-1 rounded border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-900"
      aria-label="Target language"
      bind:value={target}
      onchange={() => targetItem.setValue(target)}
    >
      {#each LANGUAGES as lang (lang.code)}
        <option value={lang.code}>{lang.label ?? lang.name}</option>
      {/each}
    </select>
  </div>

  {#if !status || status.state === "idle"}
    <button
      class="cursor-pointer rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!!setupError}
      onclick={() => run({ type: "translate-page", source, target })}
    >
      Translate
    </button>
  {:else}
    <button
      class="cursor-pointer rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
      onclick={() => run({ type: "restore-page" })}
    >
      Show original
    </button>
  {/if}

  {#if error}
    <p class="text-red-600 dark:text-red-400">{error}</p>
  {:else if status?.state === "translating"}
    <p class="text-gray-500">Translating… {status.done} done, {status.pending} queued</p>
  {:else if status?.state === "translated"}
    <p class="text-gray-500">Translated {status.done} blocks. More translate as you scroll.</p>
  {/if}
</main>
