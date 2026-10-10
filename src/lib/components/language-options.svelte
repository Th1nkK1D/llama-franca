<script lang="ts">
  import { DEFAULT_LANGUAGES, displayName, languagesPref } from "../languages";

  let { auto = false, detected }: { auto?: boolean; detected?: string } = $props();

  let languages = $state(DEFAULT_LANGUAGES);
  languagesPref.getValue().then((value) => (languages = value));
  $effect(() => languagesPref.watch((value) => (languages = value)));

  let detectedLanguage = $derived(languages.find((l) => l.code === detected));
</script>

{#if auto}
  <option value="auto">Auto{detectedLanguage ? ` (${displayName(detectedLanguage)})` : ""}</option>
{/if}
{#each languages as lang (lang.code)}
  <option value={lang.code}>{displayName(lang)}</option>
{/each}
