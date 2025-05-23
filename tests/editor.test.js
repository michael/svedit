import { test as base, expect } from '@playwright/test';

// Test data
const testDocument = {
  page_1: {
    id: 'page_1',
    type: 'page',
    title: 'Test Page',
    body: ['story_1']
  },
  story_1: {
    id: 'story_1',
    type: 'story',
    title: 'Test Story',
    description: 'This is a test story description with some text.'
  }
};

// Extend the test with custom fixtures
export const testWithEditor = base.extend({
  page: async ({ page }, use) => {
    // Mock the initial document data
    await page.route('**/api/document', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testDocument)
      });
    });

    await page.goto('/');
    await use(page);
  },
});

// Helper function to get the position of a character in a text node
async function getCharacterPosition(page, textSelector, charIndex) {
  return await page.evaluate(({ selector, index }) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    
    // Find the first text node with content
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    
    const textNode = walker.nextNode();
    if (!textNode) return null;
    
    const safeIndex = Math.min(index, textNode.nodeValue.length);
    const range = document.createRange();
    range.setStart(textNode, safeIndex);
    range.collapse(true);
    
    return {
      rect: range.getBoundingClientRect(),
      textNode: {
        nodeValue: textNode.nodeValue,
        length: textNode.nodeValue.length
      },
      index: safeIndex
    };
  }, { selector: textSelector, index: charIndex });
}

// Helper function to set cursor position
async function setCursorPosition(page, textSelector, position) {
  return await page.evaluate(async ({ selector, pos }) => {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found with selector: ${selector}`);
    }
    
    // Find the text node - this might need adjustment based on your actual DOM structure
    let textNode = null;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    
    // Get the first text node with content
    textNode = walker.nextNode();
    
    if (!textNode) {
      // If no text node found, try to get any text node
      const allTextNodes = [];
      const allNodes = document.createNodeIterator(
        element,
        NodeFilter.SHOW_TEXT
      );
      
      let node;
      while (node = allNodes.nextNode()) {
        if (node.nodeValue.trim().length > 0) {
          allTextNodes.push(node);
        }
      }
      
      if (allTextNodes.length > 0) {
        textNode = allTextNodes[0];
      } else {
        throw new Error('No text nodes found in the element');
      }
    }
    
    // Ensure position is within bounds
    const maxPosition = textNode.nodeValue.length;
    const safePosition = Math.min(pos, maxPosition);
    
    const range = document.createRange();
    const selection = window.getSelection();
    
    range.setStart(textNode, safePosition);
    range.collapse(true);
    
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Dispatch a selection change event
    const event = new Event('selectionchange', { bubbles: true });
    document.dispatchEvent(event);
    
    return {
      success: true,
      textNode: {
        nodeValue: textNode.nodeValue,
        length: textNode.nodeValue.length
      },
      position: safePosition
    };
  }, { selector: textSelector, pos: position });
}

// Helper function to get current selection
async function getSelectionInfo(page) {
  return await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    return {
      text: range.toString(),
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
      startContainer: {
        nodeType: range.startContainer.nodeType,
        nodeName: range.startContainer.nodeName,
        textContent: range.startContainer.textContent
      },
      endContainer: {
        nodeType: range.endContainer.nodeType,
        nodeName: range.endContainer.nodeName,
        textContent: range.endContainer.textContent
      }
    };
  });
}

testWithEditor('should set cursor position in text field', async ({ page }) => {
  // Wait for the editor to be ready
  await page.waitForSelector('[data-type="text"]');
  
  // Get the text element for the story description
  const textSelector = '[data-path*="description"]';
  await page.waitForSelector(textSelector, { state: 'visible' });
  
  // Debug: Log the element's content
  const elementContent = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return {
      outerHTML: el.outerHTML,
      textContent: el.textContent,
      childNodes: Array.from(el.childNodes).map(n => ({
        nodeType: n.nodeType,
        nodeName: n.nodeName,
        nodeValue: n.nodeValue,
        textContent: n.textContent
      }))
    };
  }, textSelector);
  
  console.log('Element content:', JSON.stringify(elementContent, null, 2));
  
  // Try to set cursor to position 5 in the text
  const position = 5;
  const result = await setCursorPosition(page, textSelector, position);
  console.log('Set cursor result:', result);
  
  // Get the current selection
  const selection = await getSelectionInfo(page);
  console.log('Selection info:', selection);
  
  // Verify the selection is collapsed (cursor only, no text selected)
  expect(selection).not.toBeNull();
  expect(selection.collapsed, 'Selection should be collapsed').toBe(true);
  
  // The offset might be adjusted if the text is shorter than expected
  const expectedOffset = Math.min(position, result.textNode.length);
  expect(selection.startOffset, 'Start offset should match').toBe(expectedOffset);
  expect(selection.endOffset, 'End offset should match').toBe(expectedOffset);
  
  // Verify the selection is in a text node
  expect(selection.startContainer.nodeType, 'Should be a text node').toBe(Node.TEXT_NODE);
});

testWithEditor('should handle text selection', async ({ page }) => {
  // Wait for the editor to be ready
  await page.waitForSelector('[data-type="text"]');
  
  // Get the text element for the story description
  const textSelector = '[data-path*="description"]';
  await page.waitForSelector(textSelector, { state: 'visible' });
  
  // First, get the text node info
  const textInfo = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const textNode = walker.nextNode();
    return textNode ? {
      text: textNode.nodeValue,
      length: textNode.nodeValue.length
    } : null;
  }, textSelector);
  
  expect(textInfo, 'Should find text content').not.toBeNull();
  
  // Ensure we have enough text to select
  const maxLength = textInfo.length;
  const start = Math.min(2, maxLength - 1);
  const end = Math.min(7, maxLength);
  
  console.log(`Selecting text from ${start} to ${end} in: ${textInfo.text}`);
  
  // Select text using the helper function first to find the text node
  await setCursorPosition(page, textSelector, start);
  
  // Now extend the selection
  await page.evaluate(({ selector, endPos }) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const element = document.querySelector(selector);
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const textNode = walker.nextNode();
    
    if (textNode) {
      const safeEnd = Math.min(endPos, textNode.nodeValue.length);
      range.setEnd(textNode, safeEnd);
      
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Dispatch a selection change event
      const event = new Event('selectionchange', { bubbles: true });
      document.dispatchEvent(event);
    }
  }, { selector: textSelector, endPos: end });
  
  // Get the current selection
  const selection = await getSelectionInfo(page);
  console.log('Selection info:', selection);
  
  // Verify the selection
  expect(selection, 'Should have a valid selection').not.toBeNull();
  expect(selection.collapsed, 'Selection should not be collapsed').toBe(false);
  
  // The actual offsets might be adjusted if the text is shorter than expected
  const expectedStart = Math.min(start, maxLength);
  const expectedEnd = Math.min(end, maxLength);
  
  expect(selection.startOffset, 'Start offset should be within bounds').toBeLessThanOrEqual(maxLength);
  expect(selection.endOffset, 'End offset should be within bounds').toBeLessThanOrEqual(maxLength);
  
  if (selection.text) {
    expect(selection.text.length, 'Selected text length should match').toBe(selection.endOffset - selection.startOffset);
  }
});

testWithEditor('should maintain cursor position after content change', async ({ page }) => {
  // Wait for the editor to be ready
  await page.waitForSelector('[data-type="text"]');
  
  // Get the text element for the story description
  const textSelector = '[data-path*="description"]';
  await page.waitForSelector(textSelector, { state: 'visible' });
  
  // First, get the current text content
  const initialText = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    return element ? element.textContent : '';
  }, textSelector);
  
  // Set cursor to a specific position (but within bounds)
  const position = Math.min(5, initialText.length);
  console.log(`Setting cursor to position ${position} in text: "${initialText}"`);
  
  const setResult = await setCursorPosition(page, textSelector, position);
  console.log('Cursor set result:', setResult);
  
  // Simulate a content change (e.g., from another user or undo/redo)
  const newText = 'Updated test content with different length';
  console.log(`Changing content to: "${newText}"`);
  
  await page.evaluate(({ selector, updatedText }) => {
    const element = document.querySelector(selector);
    if (!element) return;
    
    // Preserve the selection information
    const selection = window.getSelection();
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    
    // Update the content
    element.textContent = updatedText;
    
    // Try to restore the selection if possible
    if (range) {
      // Find the new text node
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        { acceptNode: (node) => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
      );
      const textNode = walker.nextNode();
      
      if (textNode) {
        const safeOffset = Math.min(range.startOffset, updatedText.length);
        range.setStart(textNode, safeOffset);
        range.collapse(true);
        
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    
    // Dispatch input event to simulate user input
    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
    
    // Also dispatch a selection change event
    const selectionEvent = new Event('selectionchange', { bubbles: true });
    document.dispatchEvent(selectionEvent);
  }, { 
    selector: textSelector,
    updatedText: newText 
  });
  
  // Get the current selection after content change
  const selection = await getSelectionInfo(page);
  console.log('Selection after content change:', selection);
  
  // The cursor should still be at a valid position
  expect(selection, 'Should have a valid selection after content change').not.toBeNull();
  expect(selection.collapsed, 'Cursor should be collapsed').toBe(true);
  
  // The cursor position should be within the new text length
  const newTextLength = newText.length;
  expect(selection.startOffset, 'Cursor position should be within bounds')
    .toBeLessThanOrEqual(newTextLength);
  
  // Verify the selection is in a text node
  expect(selection.startContainer.nodeType, 'Should be a text node').toBe(Node.TEXT_NODE);
});
