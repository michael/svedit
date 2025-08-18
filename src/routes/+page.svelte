<script>
  import { Svedit } from 'svedit';
  import Toolbar from './components/Toolbar.svelte';
  import Overlays from './components/Overlays.svelte';
  import NodeCursorTrap from './components/NodeCursorTrap.svelte';
  import create_demo_doc from './create_demo_doc.js';

  const doc = create_demo_doc();
  let svedit_ref;

  function focus_canvas() {
    if (svedit_ref) {
      svedit_ref.focus_canvas();
    }
  }
</script>

<svelte:head>
  <title>Svedit - A tiny library for building rich content editors with Svelte 5</title>
  <script async defer src="https://buttons.github.io/buttons.js"></script>
</svelte:head>

<div class="demo-wrapper">
  <Toolbar {doc} {focus_canvas} />
  <!-- Svedit editable canvas composed of Svedit nodes -->
  <Svedit
    {doc}
    editable={true}
    bind:this={svedit_ref}
    path={[doc.document_id]}
    {Overlays}
    {NodeCursorTrap}
  />
  <hr/>
  <div class='flex-column gap-y-2 my-10 w-full max-w-screen-lg mx-auto'>
    <p>Selection:</p>
    <pre class='debug-info p-4'>{JSON.stringify(doc.selection || {}, null, '  ')}</pre>
    <p>Nodes:</p>
    <pre class='debug-info p-4'>{JSON.stringify(doc.to_json(), null, '  ')}</pre>
  </div>
</div>

<style>
  .debug-info {
    text-wrap: wrap;
    height: 12lh;
    overflow-y: auto;
    color: white;
    background: var(--primary-fill-color);
    font-size: 12px;
  }
</style>
