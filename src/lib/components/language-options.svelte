<script lang="ts">
  import { displayName, LANGUAGES, type Language } from "../languages";

  let { auto = false, detected }: { auto?: boolean; detected?: Language } = $props();
</script>

{#if auto}
  <option value="auto">Auto{detected ? ` (${displayName(detected)})` : ""}</option>
{/if}
{#each LANGUAGES as lang (lang.code)}
  <option value={lang.code}>{displayName(lang)}</option>
{/each}
