<script lang="ts">
  import { LANGUAGES, type Language } from "../languages";

  let { auto = false, detected }: { auto?: boolean; detected?: Language } = $props();
</script>

{#if auto}
  <option value="auto">Auto{detected ? ` (${detected.label ?? detected.name})` : ""}</option>
{/if}
{#each LANGUAGES as lang (lang.code)}
  <option value={lang.code}>{lang.label ?? lang.name}</option>
{/each}
