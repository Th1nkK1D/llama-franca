<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  const VARIANTS = {
    primary: "bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700",
    secondary:
      "border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800",
    icon: "flex items-center justify-center px-1 hover:bg-gray-100 dark:hover:bg-gray-800",
  };

  let {
    variant = "secondary",
    class: className,
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: keyof typeof VARIANTS } = $props();
</script>

<button
  class={[
    "cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  ]}
  {...rest}
>
  {@render children?.()}
</button>
