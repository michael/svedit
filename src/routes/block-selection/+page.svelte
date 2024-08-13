

<script>
  function onselectionchange(event) {
    console.log('selectionchange', event);
    
    const selection = window.getSelection();
    console.log(selection.anchorNode.parentElement);


    // if (selection.rangeCount > 0 && selection.anchorNode === editor.firstChild) {
    //   cursorPosition = selection.getRangeAt(0).startOffset;
    // }
    // console.log('cursorPosition', cursorPosition);
  }
</script>


<svelte:document {onselectionchange} />


<div class="surface" contenteditable="true">
  <div class="container">
    <div class="block">
      <!-- <div class="block-focus" contenteditable="true" data-index=0></div> -->
       <div class="block-focus" data-index=0></div>
      <div class="text" contenteditable="true">First block text</div>
    </div>
    <div class="block">
      <!-- <div class="block-focus" contenteditable="true" data-index=1></div> -->
      <div class="block-focus" data-index=0></div>
      <div class="text" contenteditable="true">Second block text</div>
    </div>
    <div class="block">
      <div class="block-focus" data-index=0></div>
      <!-- <div class="block-focus" contenteditable="true" data-index=2></div> -->
      <div class="text" contenteditable="true">Third block text</div>
    </div>
    <div class="block">
      <div class="block-focus" data-index=0></div>
      <!-- <div class="block-focus" contenteditable="true" data-index=3></div> -->
      <div class="text" contenteditable="true">Forth block text</div>
    </div>
  </div>
</div>




<style>
  .container {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-gap: 10px;
  }
</style>