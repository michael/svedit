import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import { create_test_doc } from './create_test_doc.js';

describe('Svedit.svelte', () => {
  it('should map node cursor to DOM', async () => {
    const doc = create_test_doc();
    const { container }  = render(SveditTest, { props: { doc } });

    // Now set node cursor between first and second node
    doc.selection = {
      type: 'node',
      path: [doc.document_id, 'body'],
      anchor_offset: 1,
      focus_offset: 1,
    };

    // Wait for Svelte effects to complete
    await tick();

    // Give browser time to update DOM selection after focus
    await new Promise(resolve => setTimeout(resolve, 10));

    const dom_selection = window.getSelection();
    expect(dom_selection).not.toBeNull();
    expect(dom_selection.isCollapsed).toBe(true);
    expect(dom_selection.type).toBe('Caret');
    expect(dom_selection.anchorNode.attributes['data-path'].value).toBe(`${doc.document_id}.body`);
    expect(dom_selection.focusNode.attributes['data-path'].value).toBe(`${doc.document_id}.body`);
    expect(dom_selection.anchorOffset).toBe(7);
    expect(dom_selection.focusOffset).toBe(7);
  });

  it('should map property selection to DOM', async () => {
    const doc = create_test_doc();
    const { container }  = render(SveditTest, { props: { doc } });

    // Now set property selection
    doc.selection = {
      type: 'property',
      path: [doc.document_id, 'body', 0, 'image'],
    };

    // Wait for Svelte effects to complete
    await tick();

    // Give browser time to update DOM selection after focus
    await new Promise(resolve => setTimeout(resolve, 10));

    const dom_selection = window.getSelection();
    expect(dom_selection).not.toBeNull();
    expect(dom_selection.isCollapsed).toBe(true);
    expect(dom_selection.type).toBe('Caret');
  });
});
