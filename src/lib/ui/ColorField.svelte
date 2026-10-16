<script>
  import { SWATCHES } from '../cup.svelte.js';
  let { label, value = $bindable() } = $props();
  const id = $props.id();
</script>

<div class="cf">
  <div class="top">
    <label for={id}>{label}</label>
    <span class="hex">{value}</span>
    <input {id} type="color" bind:value />
  </div>
  <div class="sw" role="group" aria-label={`${label} presets`}>
    {#each SWATCHES as c (c)}
      <button type="button" style:background={c} aria-label={c} aria-pressed={value.toLowerCase() === c} onclick={() => (value = c)}></button>
    {/each}
  </div>
</div>

<style>
  .cf {
    margin: 12px 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  label {
    font-size: 13.5px;
    flex: 1;
  }
  .hex {
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  input[type='color'] {
    width: 34px;
    height: 26px;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 2px;
    background: var(--paper);
    cursor: pointer;
  }
  .sw {
    display: flex;
    gap: 5px;
    margin-top: 7px;
    flex-wrap: wrap;
  }
  .sw button {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.18);
    cursor: pointer;
    padding: 0;
  }
  .sw button[aria-pressed='true'] {
    box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--cobalt);
  }
  .sw button:focus-visible {
    outline: 2px solid var(--cobalt);
    outline-offset: 2px;
  }
</style>
