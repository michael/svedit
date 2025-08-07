import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import create_test_doc, { story_1_id, button_1_id, page_1_id, list_1_id } from './create_test_doc.js';

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

    expect(dom_selection.anchorNode.classList.contains('cursor-trap')).toBe(true);
    expect(dom_selection.focusNode.classList.contains('cursor-trap')).toBe(true);
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

  it('should allow copying and pasting a story node with button reference multiple times', async () => {
    const doc = create_test_doc();
    const { container } = render(SveditTest, { props: { doc } });

    // Get the original story and button content
    const original_story = doc.get(story_1_id);
    const original_button = doc.get(button_1_id);
    
    expect(original_story.title).toEqual(['First story', []]);
    expect(original_story.buttons).toEqual([button_1_id]);
    expect(original_button.label).toEqual(['Get started', []]);

    // Initial body state: [story_1_id, story_1_id, list_1_id]
    const initial_body = doc.get([page_1_id, 'body']);
    expect(initial_body).toEqual([story_1_id, story_1_id, list_1_id]);

    // Set selection to the first story node
    doc.selection = {
      type: 'node',
      path: [page_1_id, 'body'],
      anchor_offset: 0,
      focus_offset: 1
    };

    await tick();

    // Simulate copy event
    const copy_event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
    const svedit_element = container.querySelector('.svedit-canvas');
    svedit_element.focus();
    
    // Mock clipboard API
    let clipboard_data = null;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: async (items) => {
          clipboard_data = items[0];
        },
        read: async () => {
          return [clipboard_data];
        }
      }
    });

    document.dispatchEvent(copy_event);
    await tick();

    // Verify something was copied
    expect(clipboard_data).not.toBeNull();
    
    // Keep same selection for paste (to replace, not insert)
    doc.selection = {
      type: 'node',
      path: [page_1_id, 'body'],
      anchor_offset: 0,
      focus_offset: 1
    };

    await tick();

    // First paste - should replace the selected story
    const first_paste_event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    document.dispatchEvent(first_paste_event);
    await tick();
    await new Promise(resolve => setTimeout(resolve, 10)); // Give time for transaction

    // Verify first paste - should still have 3 items (replaced, not inserted)
    const body_after_first_paste = doc.get([page_1_id, 'body']);
    expect(body_after_first_paste.length).toBe(3);
    
    // Get the new story ID (first element should be the replaced one)
    const first_new_story_id = body_after_first_paste[0];
    const first_new_story = doc.get(first_new_story_id);
    const first_new_button_id = first_new_story.buttons[0];
    const first_new_button = doc.get(first_new_button_id);

    // Content should be the same as original
    expect(first_new_story.title).toEqual(['First story', []]);
    expect(first_new_story.description).toEqual(['First story description.', []]);
    expect(first_new_button.label).toEqual(['Get started', []]);
    expect(first_new_button.href).toBe('https://github.com/michael/svedit');

    // But IDs should be different
    expect(first_new_story_id).not.toBe(story_1_id);
    expect(first_new_button_id).not.toBe(button_1_id);
    expect(first_new_story.buttons).toEqual([first_new_button_id]);

    // Keep same selection for second paste (to replace again)
    doc.selection = {
      type: 'node',
      path: [page_1_id, 'body'],
      anchor_offset: 0,
      focus_offset: 1
    };

    await tick();

    const second_paste_event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    document.dispatchEvent(second_paste_event);
    await tick();
    await new Promise(resolve => setTimeout(resolve, 10)); // Give time for transaction

    // Verify second paste - should still have 3 total items (replaced again)
    const body_after_second_paste = doc.get([page_1_id, 'body']);
    expect(body_after_second_paste.length).toBe(3);

    // Get the second new story ID (first element should be the second replacement)
    const second_new_story_id = body_after_second_paste[0];
    const second_new_story = doc.get(second_new_story_id);
    const second_new_button_id = second_new_story.buttons[0];
    const second_new_button = doc.get(second_new_button_id);

    // Content should still be the same
    expect(second_new_story.title).toEqual(['First story', []]);
    expect(second_new_story.description).toEqual(['First story description.', []]);
    expect(second_new_button.label).toEqual(['Get started', []]);
    expect(second_new_button.href).toBe('https://github.com/michael/svedit');

    // But IDs should be different from both original and first paste
    expect(second_new_story_id).not.toBe(story_1_id);
    expect(second_new_story_id).not.toBe(first_new_story_id);
    expect(second_new_button_id).not.toBe(button_1_id);
    expect(second_new_button_id).not.toBe(first_new_button_id);
    expect(second_new_story.buttons).toEqual([second_new_button_id]);

    // Verify the first paste's nodes no longer exist (they were replaced)
    expect(doc.get(first_new_story_id)).toBeUndefined();
    expect(doc.get(first_new_button_id)).toBeUndefined();

    // But the current (second) paste nodes exist
    expect(doc.get(second_new_story_id)).toBeDefined();
    expect(doc.get(second_new_button_id)).toBeDefined();

    // Original nodes should still exist (at position 1)
    expect(doc.get(story_1_id)).toBeDefined();
    expect(doc.get(button_1_id)).toBeDefined();
    expect(body_after_second_paste[1]).toBe(story_1_id);
  });
});
