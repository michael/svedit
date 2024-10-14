<script>
  const blocks = [
    {id: 'body-1', content: 'First para'},
    {id: 'body-2', content: 'Second para'},
    {id: 'body-3', content: 'Third para'},
    {id: 'body-4', content: 'Fourth para'},
    {id: 'body-5', content: 'Fourth para'},
    {id: 'body-6', content: 'Fourth para'},
    {id: 'body-7', content: 'Fourth para'},
    {id: 'body-8', content: 'Fourth para'},
    {id: 'body-9', content: 'Fourth para'},
    {id: 'body-10', content: 'Fourth para'},
  ];
  const selected_blocks = ['body-1', 'body-2'];
</script>

<div class="container">
  {#each blocks as block, index}
    <div class="block" style="anchor-name: --{block.id};">
      {block.content}
    </div>
  {/each}
</div>

<!-- Overlays such as selection fragments are rendered in a dedicated div -->
<div class="overlays">
  <!-- Selection fragments -->
  {#each selected_blocks as block_id, index}
    <div class="block-selection-fragment" style="position-anchor: --{block_id};"></div>
  {/each}
</div>

<style>
  .block {
    background: #eee;
    padding: 5px;
    margin-top: 5px;
  }

  /* This should be an exact overlay */
  .block-selection-fragment {
    position: absolute;
    background: rgba(9, 144, 203, 0.3);
    border: 1px solid rgba(9, 144, 203, 0.8);
    
    top: anchor(top);
    left: anchor(left);
    bottom: anchor(bottom);
    right: anchor(right);
    pointer-events: none;
  }
</style>