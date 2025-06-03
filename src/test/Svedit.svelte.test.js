import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import { create_test_doc } from './create_test_doc.js';

describe('Svedit.svelte', () => {
  it('should map container cursor to DOM', async () => {
    const doc = create_test_doc();
    const { container }  = render(SveditTest, { props: { doc } });

    // Now set container cursor between first and second block
    doc.selection = {
      type: 'container',
      path: [doc.doc_id, 'body'],
      anchor_offset: 1,
      focus_offset: 1,
    };

    // Wait for the selection to be updated
    await Promise.resolve();

    const dom_selection = window.getSelection();
    expect(dom_selection).not.toBeNull();
    expect(dom_selection.isCollapsed).toBe(true);
    expect(dom_selection.type).toBe('Caret');

    // console.log('dom_selection', dom_selection);
    expect(dom_selection.anchorNode.attributes['data-path'].value).toBe(`${doc.doc_id}.body`);
    expect(dom_selection.focusNode.attributes['data-path'].value).toBe(`${doc.doc_id}.body`);
    expect(dom_selection.anchorOffset).toBe(7);
    expect(dom_selection.focusOffset).toBe(7);
  });
});
