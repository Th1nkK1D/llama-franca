<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    inline = false,
    error,
    hint,
    children,
  }: {
    label: string;
    /** Control next to the label instead of below it. */
    inline?: boolean;
    error?: string;
    hint?: string | Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-1">
  <label class={["flex", inline ? "items-center gap-2" : "flex-col gap-1"]}>
    <span class="font-medium">{label}</span>
    {@render children()}
  </label>
  {#if error}
    <span class="text-red-600 dark:text-red-400">{error}</span>
  {/if}
  {#if typeof hint === "string"}
    <span class="text-gray-500">{hint}</span>
  {:else if hint}
    <span class="text-gray-500">{@render hint()}</span>
  {/if}
</div>
