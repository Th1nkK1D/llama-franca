<script lang="ts">
  import Button from "@/lib/components/button.svelte";
  import { cacheUsage, clearCache, evict } from "@/lib/cache";
  import Field from "@/lib/components/field.svelte";
  import { DEFAULT_LANGUAGES, displayName, languagesPref, type Language } from "@/lib/languages";
  import { listModels } from "@/lib/ollama";
  import {
    cacheLimitPref,
    DEFAULT_MODEL,
    DEFAULT_PROMPT,
    MAX_CACHE_MB,
    modelPref,
    promptPref,
    sourcePref,
    targetPref,
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

  let languages = $state(DEFAULT_LANGUAGES);
  let newCode = $state("");
  let newName = $state("");
  languagesPref.getValue().then((value) => (languages = value));

  let code = $derived.by(() => {
    try {
      return Intl.getCanonicalLocales(newCode.trim())[0];
    } catch {
      return undefined;
    }
  });
  let suggestedName = $derived(
    code && new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(code),
  );
  let languageError = $derived(
    !newCode.trim()
      ? undefined
      : !code
        ? "Not a valid language code."
        : languages.some((l) => l.code === code)
          ? "Already in the list."
          : undefined,
  );
  let canAdd = $derived(!!code && !languageError && !!(newName.trim() || suggestedName));

  /** Drop source / target picks that point at a language no longer in the list. */
  async function pruneSelection(list: Language[]) {
    const has = (value: string | null) =>
      !value || value === "auto" || list.some((l) => l.code === value);
    if (!has(await sourcePref.getValue())) await sourcePref.removeValue();
    if (!has(await targetPref.getValue())) await targetPref.removeValue();
  }

  async function saveLanguages(list: Language[]) {
    languages = list;
    await languagesPref.setValue($state.snapshot(list));
    await pruneSelection(list);
  }

  async function addLanguage() {
    if (!canAdd) return;
    const added = { code: code!, name: newName.trim() || suggestedName! };
    await saveLanguages(
      [...languages, added].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    );
    newCode = newName = "";
  }

  async function resetLanguages() {
    await languagesPref.removeValue();
    languages = DEFAULT_LANGUAGES;
    await pruneSelection(DEFAULT_LANGUAGES);
  }

  async function reset() {
    await Promise.all([
      modelPref.removeValue(),
      promptPref.removeValue(),
      cacheLimitPref.removeValue(),
      resetLanguages(),
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

  <section class="flex flex-col gap-1" aria-labelledby="languages-label">
    <span id="languages-label" class="font-medium">Languages</span>
    <ul class="control flex max-h-64 flex-col overflow-y-auto">
      {#each languages as lang (lang.code)}
        <li class="flex items-center justify-between gap-2">
          <span>{displayName(lang)} <span class="text-gray-500">{lang.code}</span></span>
          <Button
            variant="icon"
            aria-label="Remove {displayName(lang)}"
            title="Remove"
            disabled={languages.length === 1}
            onclick={() => saveLanguages(languages.filter((l) => l.code !== lang.code))}
          >
            ×
          </Button>
        </li>
      {/each}
    </ul>
    <form
      class="flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        addLanguage();
      }}
    >
      <input
        class="control min-w-0 flex-1"
        aria-label="Language name"
        placeholder={suggestedName ?? "Name"}
        bind:value={newName}
      />
      <input
        class="control w-36"
        aria-label="Language code"
        placeholder="Code, e.g. pt-BR"
        bind:value={newCode}
      />
      <Button type="submit" disabled={!canAdd}>Add</Button>
      <Button type="button" onclick={resetLanguages}>Reset</Button>
    </form>
    {#if languageError}
      <span class="text-red-600 dark:text-red-400">{languageError}</span>
    {/if}
    <span class="text-gray-500">
      The default list is the languages supported by <a
        class="underline"
        href="https://ollama.com/library/translategemma"
        target="_blank"
        rel="noreferrer">TranslateGemma</a
      >. The name is how the prompt refers to the language, in English by default. The code is BCP
      47.
    </span>
  </section>

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
