<script lang="ts">
  import { listModels } from "@/lib/ollama";
  import { DEFAULT_MODEL, DEFAULT_PROMPT, modelPref, promptPref } from "@/lib/prefs";

  const placeholders = "{source}, {source_code}, {target}, {target_code}, {text}";

  let model = $state(DEFAULT_MODEL);
  let prompt = $state(DEFAULT_PROMPT);
  let models = $state<string[]>([]);
  let modelsError = $state<string>();
  let options = $derived(models.includes(model) ? models : [model, ...models]);
  let validPrompt = $derived(prompt.includes("{text}"));

  modelPref.getValue().then((value) => (model = value));
  promptPref.getValue().then((value) => (prompt = value));
  listModels().then(
    (names) => (models = names),
    (e: Error) => (modelsError = e.message),
  );

  async function reset() {
    await Promise.all([modelPref.removeValue(), promptPref.removeValue()]);
    model = DEFAULT_MODEL;
    prompt = DEFAULT_PROMPT;
  }
</script>

<main class="flex flex-col gap-4 p-4">
  <label class="flex flex-col gap-1">
    <span class="font-medium">Model</span>
    <select
      class="rounded border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-900"
      bind:value={model}
      onchange={() => modelPref.setValue(model)}
    >
      {#each options as name (name)}
        <option value={name}
          >{name}{models.length && !models.includes(name) ? " (not installed)" : ""}</option
        >
      {/each}
    </select>
    {#if modelsError}
      <span class="text-red-600 dark:text-red-400">{modelsError}</span>
    {/if}
    <span class="text-gray-500">
      Recommended: <a
        class="underline"
        href="https://ollama.com/library/translategemma"
        target="_blank"
        rel="noreferrer">TranslateGemma</a
      >, which the default prompt is written for. Other models may need a different prompt, drop
      links and formatting, or translate slower when blocks are batched.
    </span>
  </label>

  <label class="flex flex-col gap-1">
    <span class="font-medium">Prompt template</span>
    <textarea
      class="h-64 rounded border border-gray-300 bg-white p-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-900"
      bind:value={prompt}
      oninput={() => validPrompt && promptPref.setValue(prompt)}></textarea>
    {#if validPrompt}
      <span class="text-gray-500">Placeholders: {placeholders}</span>
    {:else}
      <span class="text-red-600 dark:text-red-400">
        Must include {"{text}"}, not saved. Placeholders: {placeholders}
      </span>
    {/if}
  </label>

  <button
    class="cursor-pointer self-start rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
    onclick={reset}
  >
    Reset to defaults
  </button>
</main>
