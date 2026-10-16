<script>
  /** Segmented choice: options = [{ id, name }] */
  let { options, value = $bindable(), label = '', small = false } = $props();
</script>

<div class="seg" class:small role="group" aria-label={label}>
  {#each options as o (o.id)}
    <button type="button" aria-pressed={value === o.id} onclick={() => (value = o.id)}>{o.name}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 3px;
    background: var(--well);
    border-radius: 9px;
    margin: 8px 0;
  }
  button {
    flex: 1 1 auto;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    padding: 6px 10px;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
  }
  .small button {
    font-size: 12.5px;
    padding: 5px 8px;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.55);
  }
  button[aria-pressed='true'] {
    background: var(--paper);
    color: var(--cobalt);
    font-weight: 600;
    box-shadow: 0 1px 0 var(--line);
  }
  button:focus-visible {
    outline: 2px solid var(--cobalt);
    outline-offset: 1px;
  }
</style>
