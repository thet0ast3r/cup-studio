<script>
  let { label, value = $bindable(), min = 0, max = 100, step = 1, unit = '', digits = 0 } = $props();
  const id = $props.id();
  const shown = $derived(typeof value === 'number' ? value.toFixed(digits) : value);
</script>

<div class="slider">
  <label for={id}>{label}</label>
  <output for={id}>{shown}{unit}</output>
  <input {id} type="range" {min} {max} {step} bind:value />
</div>

<style>
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    row-gap: 2px;
    margin: 10px 0;
  }
  label {
    font-size: 13.5px;
    color: var(--ink);
  }
  output {
    font-size: 12.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  input {
    grid-column: 1 / -1;
    width: 100%;
  }
</style>
