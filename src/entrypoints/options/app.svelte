<script lang="ts">
  import Button from "@/lib/components/button.svelte";
  import { cacheUsage, clearCache, evict } from "@/lib/cache";
  import Field from "@/lib/components/field.svelte";
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
  <Field label="Model" error={modelsError}>
    <select class="control" bind:value={model} onchange={() => modelPref.setValue(model)}>
      {#each options as name (name)}
        <option value={name}
          >{name}{models.length && !models.includes(name) ? " (not installed)" : ""}</option
        >
      {/each}
    </select>
    {#snippet hint()}
      Recommended: <a
        class="underline"
        href="https://ollama.com/library/translategemma"
        target="_blank"
        rel="noreferrer">TranslateGemma</a
      >, which the default prompt is written for. Other models may need a different prompt, drop
      links and formatting, or translate slower when blocks are batched.
    {/snippet}
  </Field>

  <Field
    label="Prompt template"
    error={validPrompt ? undefined : "Must include {text}, not saved."}
    hint="Placeholders: {placeholders}"
  >
    <textarea
      class="control h-64 font-mono text-xs"
      bind:value={prompt}
      oninput={() => validPrompt && promptPref.setValue(prompt)}></textarea>
  </Field>

  <Field
    label="Translation cache"
    inline
    error={validCacheLimit ? undefined : `Must be 0 to ${MAX_CACHE_MB} MB, not saved.`}
    hint={cacheLimit === 0
      ? "Disabled, every page is translated again."
      : usage &&
        `${usage.count} translations, ${formatBytes(usage.bytes)} used. The older half is removed when full. Set 0 to disable.`}
  >
    <input
      type="number"
      class="control w-20"
      min="0"
      max={MAX_CACHE_MB}
      step="0.5"
      bind:value={cacheLimit}
      onchange={saveCacheLimit}
    />
    <span>MB</span>
  </Field>

  <div class="flex justify-end gap-2">
    <Button disabled={!usage?.count} onclick={() => clearCache().then(refreshUsage)}>
      Clear cache
    </Button>
    <Button onclick={reset}>Reset to defaults</Button>
  </div>
</main>
