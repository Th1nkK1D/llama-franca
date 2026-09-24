<script lang="ts">
  let count: number = 0;
  const increment = () => {
    count += 1;
  };
</script>

<button
  class="cursor-pointer rounded-lg border border-transparent bg-[#f9f9f9] px-[1.2em] py-[0.6em] font-medium transition-colors duration-250 hover:border-[#646cff] dark:bg-[#1a1a1a]"
  on:click={increment}
>
  count is {count}
</button>
