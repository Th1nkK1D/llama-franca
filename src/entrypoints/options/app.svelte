<script lang="ts">
  import { cacheUsage, clearCache, evict } from "@/lib/cache";
  import { listModels } from "@/lib/ollama";
  import {
    cacheLimitPref,
    DEFAULT_MODEL,
    DEFAULT_PROMPT,
    MAX_CACHE_MB,
    modelPref,
    promptPref,
  } from "@/lib/prefs";

  const placeholders = "{source}, {source_code}, {target}, {target_code}, {text}";
  const mb = new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  });
  const formatBytes = (bytes: number) => mb.format(bytes / 1024 / 1024);

  let usage = $state<{ count: number; bytes: number }>();
  const refreshUsage = () => cacheUsage().then((value) => (usage = value));
  refreshUsage();

  let cacheLimit = $state<number | null>(MAX_CACHE_MB);
  let validCacheLimit = $derived(
    cacheLimit !== null && cacheLimit >= 0 && cacheLimit <= MAX_CACHE_MB,
  );
  cacheLimitPref.getValue().then((value) => (cacheLimit = value));

  async function saveCacheLimit() {
    if (!validCacheLimit) return;
    await cacheLimitPref.setValue(cacheLimit!);
    await evict();
    await refreshUsage();
  }

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
    await Promise.all([
      modelPref.removeValue(),
      promptPref.removeValue(),
      cacheLimitPref.removeValue(),
    ]);
    model = DEFAULT_MODEL;
    prompt = DEFAULT_PROMPT;
    cacheLimit = MAX_CACHE_MB;
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

  <div class="flex flex-col gap-1">
    <label class="flex items-center gap-2">
      <span class="font-medium">Translation cache</span>
      <input
        type="number"
        class="w-20 rounded border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-900"
        min="0"
        max={MAX_CACHE_MB}
        step="0.5"
        bind:value={cacheLimit}
        onchange={saveCacheLimit}
      />
      <span>MB</span>
    </label>
    {#if !validCacheLimit}
      <span class="text-red-600 dark:text-red-400">
        Must be 0 to {MAX_CACHE_MB} MB, not saved.
      </span>
    {:else if cacheLimit === 0}
      <span class="text-gray-500">Disabled, every page is translated again.</span>
    {:else if usage}
      <span class="text-gray-500">
        {usage.count} translations, {formatBytes(usage.bytes)} used. The older half is removed when full.
        Set 0 to disable.
      </span>
    {/if}
  </div>

  <div class="flex flex-row justify-end gap-2">
    <button
      class="cursor-pointer self-start rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
      disabled={!usage?.count}
      onclick={() => clearCache().then(refreshUsage)}
    >
      Clear cache
    </button>

    <button
      class="cursor-pointer self-start rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
      onclick={reset}
    >
      Reset to defaults
    </button>
  </div>
</main>
